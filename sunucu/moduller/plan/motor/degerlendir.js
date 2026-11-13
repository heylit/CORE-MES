// @ts-check
/* ---------- Planlama değerlendirmesi (Soru 357 a) ----------
   Planlama sayfasının tarayıcıda motoru koşturan kartları sunucuda aynı kodla hesaplanır: plan seçenekleri, teklif termin seçenekleri,
   termin uzatma önerisi (zw-denge), malzeme ve fason terminleri listesi (zv-termin), malzeme öne çekme (zz7), partiyi böl (zz4, zz10) ve
   sipariş maliyeti ve kârı (zu-yan-sayfalar, zz6). İşlevler sayfanın parçalarından taşındı; ekran, bildirim ve yazma kısımları alınmadı.
   Hiçbir şey yazılmaz: çalışma bu bağlamın kopyasıdır, sonuç yalnız döner.
   Arama sayfanınkidir (457 1-3 b): plan seçeneklerinde LNS (zw-denge PD_ISCI, pdMs), ek mesai ölçümünde 300 ms (zu ymOlc), partiyi bölde
   500 ms (zz11 btKur). Saat sayfanın işçisindeki gibi sabit adımlıdır (zz-karar-1650 saatSabitle, zz8 saatAdimi): bütçe tur sayısına
   döner, aynı girdi aynı sonucu verir; gerçek süreyi uçtaki süre sınırı keser. Sayfanın deneme varsayılanları (uydurma gider kalemi, kişi
   ücreti, talaş fiyatı) kurulmaz: çalışmada yoksa o hesap sayfadaki yalın karşılığına döner. Saatler planın ekseninde, terminler
   çalışmanın biçiminde ('GGGG-AA-GG SS:DD'). Veri yoksa null; sıfır uydurulmaz. */
var S = null;
var U = {};
let DG_BITEN = null;
let DG_CX = null;

/* sayfanın stOf'u: tam girdi ve biten işin düşülmesi (a-durum, zz31-tmi) */
function stOf(ek = [], gevset = true) { return bitenUygula(stTamKur(S, ek, gevset, {}), DG_BITEN); }
function cxAl() { if (!DG_CX || DG_CX.v !== S.dataVer) DG_CX = { v: S.dataVer, cx: compile(stOf()) }; return DG_CX.cx; }
const planGuncel = () => S.plan && S.plan.dataVer === S.dataVer;
const tmYaz = t => new Date(baseMs(S.D) + t * 3600000).toISOString().slice(0, 16).replace('T', ' ');
const basladiMi = j => Object.values(S.plan.ops).some(r => r.job === j && (r.act || r.done || (S.gercek && S.gercek[r.id])));
const ymAnahtar = e => `${e.m}|${e.gun}|${e.vardiya}`;

/* plan dengesine göre dondurma bölgesi (t-tekyer): bölgedeki işler bugünkü yerinde geçici kilitlenir */
const DENGE_UFUK = { elle: 72, dengeli: 24, otomatik: 0 };
/** @param {MotorDurumu} [st] */
function dengeKilit(st) {
  const u = DENGE_UFUK[S.w.denge] != null ? DENGE_UFUK[S.w.denge] : DENGE_UFUK.dengeli; if (!u || !S.plan) return st;
  const a = st.now, b = a + u; const var_ = new Set(st.D.siparisler.map(s => s.id));
  for (const r of Object.values(S.plan.ops)) if (!st.locks[r.id] && !r.fas && !r.done && isFinite(r.S) && r.S >= a && r.S < b && var_.has(r.job)) st.locks[r.id] = { m: r.m, S: r.S, gecici: 1 };
  return st;
}

/* planın kaydı (c-masa): ekranın sakladığı biçim. 3199: özel takımın ömür hesabı (değişim anı, kalan) yalnız takımlı işte taşınır */
function opKaydi(r) { return { id: r.id, job: r.job, m: r.m, S: r.S, Su: r.Su, C: r.C, su: r.su, run: r.run, lot1: r.lot1, fas: r.fas ? 1 : 0, why: r.why || null, sl: r.sl, famHit: !!r.famHit, pin: r.pin ? 1 : 0, done: r.done ? 1 : 0, act: r.act ? 1 : 0, ...(r.takim && r.takim.length ? { takim: r.takim } : {}), ...(r.ikBas != null ? { ikBas: r.ikBas } : {}) }; }
/** @param {any} [p] @param {MotorDurumu} [st] @param {any} [ref] */
function planKaydi(p, st, ref) {
  const ef = evaluate(p, st, ref, false);
  const ops = {}; for (const id in p.ops) ops[id] = opKaydi(p.ops[id]);
  const J = {}; for (const k in ef.J) { const x = ef.J[k]; J[k] = { C: isFinite(x.C) ? x.C : null, T: x.T }; }
  const util = {}; for (const m in ef.util) util[m] = ef.util[m];
  const kisiTezgahIsleri = kisiTezgahIsleriOf(p);
  return { ops, fail: p.fail || [], failNeden: p.failNeden || {}, ozet: { kisiTezgahIsleri, wT: ef.wT, onT: ef.onT, late: ef.late, yerlesmeyenSip: ef.yerlesmeyenSip, n: ef.n, suH: ef.suH, suN: ef.suN, famN: ef.famN, Cmax: ef.Cmax, tl: ef.tl, wB: ef.wB, chg: ref ? ef.chg : null }, J, util, warn: ef.warn.slice(0, 300) };
}
/* aynı veriyle kural tabanlı ilk plan (zw-denge PD_ISCI, ms 0) */
/** @param {MotorDurumu} [st] @param {any} [ms] */
function dgPlanKur(st, ms = 0) {
  stHazirla(st); const cx = compile(st); let cur = schedule(st, 'dagit', null, { cx }); slack(cur, cx); let E = evaluate(cur, st, null, true);
  const t0 = Date.now(); let seed = 17, durgun = 0;
  while (ms > 0 && Date.now() - t0 < ms && durgun < 3) { const L = lns(st, cur, null, { ms: Math.max(200, Math.min(1000, ms - (Date.now() - t0))), seed: seed++, free: true }); if (cmpEv(L.e, E) > 0) { cur = L.plan; E = L.e; durgun = 0; } else durgun++; }
  return planKaydi(cur, st, null);
}
/* sayfanın kısa araması (t-tekyer kisaArama) */
/** @param {MotorDurumu} [st] @param {Derleme} [cx] @param {any} [p0] @param {any} [ms] */
function kisaArama(st, cx, p0, ms) {
  const L = lns(st, p0, null, { ms, seed: 7, free: true });
  let p = p0; if (cmpEv(L.e, evaluate(p0, st, null, true)) > 0 && (L.plan.fail || []).length <= (p0.fail || []).length) p = L.plan;
  slack(p, cx); return p;
}
/* sabit adımlı saat: her okunuşta bir plan çözümü kadar ilerler; adım veri boyuyla büyür (zz8) */
const SAAT_REF = { n: 134, adim: 1.6, us: 1.25 };
function saatAdimi(n) { return n > SAAT_REF.n ? SAAT_REF.adim * Math.pow(n / SAAT_REF.n, SAAT_REF.us) : SAAT_REF.adim; }
function saatSabitle(an, n) { const a = +saatAdimi(n).toFixed(3); let t = an; Date.now = () => (t += a); }
const pdMs = () => Math.max(1500, (+S.w.sure || 10) * 1000 / 3);

/* ---------- maliyet (zu-yan-sayfalar, zz6) ---------- */
/* 2510 a: ek mesainin ücretli saati molası düşülmüş süredir (vardiyaNetSaat); dağıtım penceresi brüt vardiyadır (ymVPencere) */
const ymVH = (D, id) => vardiyaNetSaat(D, id);
const ymVPencere = (D, id) => { const v = D.vardiyalar.find(x => x.id === id); if (!v) return 0; let h = hm(v.bit) - hm(v.bas); if (h <= 0) h += 24; return h; };
function ymGecTL(e) { let t = 0; for (const s of S.D.siparisler) { const J = e.J[s.id]; if (J && J.T > 0.05) t += agGecTL(agBedel(S.D, s), J.T); } return t; }
/* gecikmenin TL karşılığı (zr-agirlik): tavana kadar tam bedel, sonra taban bedel */
function agGecTL(x, T) {
  if (!(T > 0.05)) return 0;
  if (x.ceza == null || x.tavanTL == null || x.ceza <= 0) return T * x.b;
  const h = x.tavanTL / x.ceza; return T <= h ? T * x.b : h * x.b + (T - h) * x.sonra;
}
const ymMesaiUcret = D => { const u = (D.ayarlar || {}).mesaiUcret; return u == null || u === '' || !isFinite(+u) ? null : +u; };
/** @param {any} [D] @param {Derleme} [cx] @param {any} [e] */
function ymMesaiTLYalin(D, cx, e) { const u = ymMesaiUcret(D); if (u == null) return null; return ymVH(D, e.vardiya) * u * mesaiCarpani({ planTL: ymAyar(D) }); }
/** @param {Derleme} [cx] @param {any} [r] */
function ymFasonTL(cx, r) {
  const f = cx.FS[r.m.slice(1)]; const o = cx.byId[r.id]; if (!f || !o) return null; const cl = o.cTum || o.c; const c = cl.find(x => x.m === r.m) || {};
  if (c.opt) { const h = Math.min(...cl.filter(x => !x.fas).map(x => x.run), Infinity); return isFinite(h) && f.saatFiyat != null ? h * f.saatFiyat + (+f.tasima || 0) * o.adet : null; }
  return f.fiyat != null ? f.fiyat * o.adet : null;
}
const mlNorm = x => String(x || '').trim().toLocaleUpperCase('tr-TR');
function mlSatir(D, m) {
  const l = D.kgFiyat || []; const k = mlNorm(m.kalite); if (!k) return null;
  return l.find(r => mlNorm(r.kalite) === k && mlNorm(r.form) === mlNorm(m.form)) || l.find(r => mlNorm(r.kalite) === k && !mlNorm(r.form)) || null;
}
const tlSatir = (D, kalite) => (D.talasFiyat || []).find(t => mlNorm(t.kalite) === mlNorm(kalite)) || null;
/* talaş kredisi: hammadde ağırlığı (fire dahil) − parçanın net ağırlığı, kalitenin talaş fiyatıyla; net ağırlık ya da talaş fiyatı yoksa hesaplanmaz */
function ymTalas(D, s) {
  const u = D.urunler.find(x => x.id === s.urun); if (!u || u.netKg == null) return null;
  /* 1473 a: talaş yalnız işlenen hammaddeden çıkar: öncülsüz (ilk) adımın malzemesi; sonraki adımın malzemesi (bağlantı elemanı vb.) sayılmaz */
  const kok = new Set((u.rota || []).filter(o => !(o.bag || []).length).map(o => String(o.k)));
  const sat = (s.malzeme || []).filter(r => r.adim == null || kok.has(String(r.adim))); if (!sat.length) return null;
  let kg = 0, tl = 0;
  for (const r of sat) { const m = D.malzemeler.find(x => x.kod === r.kod); if (!m) return null; const kb = m.birim === 'kg' ? 1 : +m.kgBirim; const ks = mlSatir(D, m);
    const tf = tlSatir(D, m.kalite); if (!(kb > 0) || !tf || tf.fiyat == null) return null; const h = +r.miktar * kb * (1 + (+m.fire || 0) / 100); kg += h; tl += h * +tf.fiyat; void ks; }
  const t = (kg - +u.netKg) * s.adet; if (!(t > 0)) return { kg: 0, tl: 0 };
  return { kg: t, tl: tl / kg * t };
}

/* kişi bazlı mesai yalnız çalışmada kayıtlıysa: sayfa yoksa deneme varsayılanı kurardı. Kayıttaki eski kalem kipi verisi (maliyetSis) okunmaz:
   genel gider oranının tek kaynağı Finans oranıdır (planTL.genelGider). */
const mesSis = (D = S.D) => D.mesaiSis || null;
/* 2742 (2740 a): ek mesai saat değeri İK'nın departman saat maliyetinden, tezgâh başına; sunucu girdiye yazar (mesai-maliyeti.ts
   mesaiSaatGirdisi). Değer yoksa (küçük ya da karışık grup, atama yok, maliyet görmeyen okuyucu) yalın mesai ücretine düşer. */
const msTezgahSaat = (D, m) => { const s = D.mesaiSaat && typeof D.mesaiSaat === 'object' ? D.mesaiSaat[m] : null; return typeof s === 'number' && isFinite(s) ? s : null; };
/* tek oran girilmemişse genel gider bilinmez (null, 2173-1 a) */
const ggTek = () => { const g = ymAyar().genelGider; return g == null || g === '' ? null : +g; };
function msGunTur(D, gun) { const iso = isoT(D, gun * 24).slice(0, 10); if ((D.tatiller || []).includes(iso)) return 'tatil'; const g = fmtDT(D, gun * 24).slice(6, 9); return g === 'Cmt' ? 'cmt' : g === 'Paz' ? 'paz' : 'hi'; }
/** @param {any} [D] @param {Derleme} [cx] @param {any} [e] */
/* kişi bazlı kip istemcinin mesaiSistemi ve sunucu mesaiAyarlari ile aynı okunur: mesai sistemi yoksa ya da alan yoksa açık, yalnız false kapalı;
   gün çarpanı yoksa onların varsayılanı */
const MS_CARP0 = { hi: 1.5, cmt: 1.5, paz: 2, tatil: 2 };
function ymMesaiTL(D, cx, e) {
  const m = mesSis(D) || {}; if (m.kisiBazli === false) return ymMesaiTLYalin(D, cx, e);
  const t = D.tezgahlar.find(x => x.id === e.m); const h = ymVH(D, e.vardiya); const op = t && t.opOran != null ? +t.opOran : 1;
  const s = msTezgahSaat(D, e.m); if (s == null) return ymMesaiTLYalin(D, cx, e);
  const tur = msGunTur(D, e.gun); const c = (m.carp || {})[tur];
  return h * op * s * (c == null || c === '' || !isFinite(+c) ? MS_CARP0[tur] : +c || 1.5) + op * (+m.kisiEk || 0);
}
/* ek mesai bedeli, mesai vardiyasında o tezgâhta çalışan işlere çalıştıkları saat oranında dağıtılır; bedeli bilinmeyen vardiyadaki işin payı null */
/** @param {any} [p] @param {Derleme} [cx] */
function ymMesaiPay(p, cx) {
  const out = {}; if (!p || !cx) return out; const D = S.D;
  for (const e of S.ekMesai || []) { const v = D.vardiyalar.find(x => x.id === e.vardiya); if (!v) continue; const a = e.gun * 24 + hm(v.bas), b = a + ymVPencere(D, e.vardiya);
    const pay = {}; let top = 0; for (const r of Object.values(p.ops)) { if (r.m !== e.m) continue; const h = Math.min(b, r.C) - Math.max(a, r.S); if (h > 0) { pay[r.job] = (pay[r.job] || 0) + h; top += h; } }
    const tl = ymMesaiTL(D, cx, e); if (!top) continue; if (tl == null) { for (const j in pay) out[j] = null; continue; }
    for (const j in pay) if (out[j] !== null) out[j] = (out[j] || 0) + tl * pay[j] / top; }
  return out;
}
/* sipariş maliyeti son plandan: tezgâh seçimi, ayar ve fason planın kendisidir; malzeme fire payıyla */
/** @param {any} [s] @param {any} [p] @param {Derleme} [cx] @param {any} [W] @param {any} [MP] */
function ymSipMaliyet(s, p, cx, W, MP) {
  if (!p || !cx) return null; const A = cx.A; const ops = Object.values(p.ops).filter(r => r.job === s.id); if (!ops.length) return null;
  let isl = 0, ayar = 0, fas = 0, gg = 0; const eksik = []; const tek = ggTek();
  for (const r of ops) {
    if (r.fas) { const t = ymFasonTL(cx, r); if (t == null) eksik.push('fason fiyatı'); else fas += t; continue; }
    const M = cx.M[r.m]; if (!M || M.ucret == null) { eksik.push(r.m + ' saat maliyeti'); continue; }
    isl += r.run * (1 - (M.pay || 0)) * M.ucret; ayar += r.su * (M.ucret + (+A.ayarciUcret || 0)); if (gg != null) gg = tek == null ? null : gg + (r.run + r.su) * tek;
  }
  const mr = cx.mat.res[s.id]; const mal = mr ? mr.fiyat : null; if (mal == null && (s.malzeme || []).length) eksik.push('malzeme kg fiyatı');
  const J = p.J[s.id] || {}; const due = parseT(S.D, s.termin); const A2 = agAyar();
  const tutar = s.gelir == null ? null : +s.gelir;
  const fin = tutar != null && s.vade != null ? tutar * A2.fin / 100 * +s.vade : null;
  const erken = J.C != null && due != null ? Math.max(0, due - J.C) : 0;
  const tal = ymTalas(S.D, s); const talas = tal && tal.tl > 0 ? tal.tl : 0;
  const bek = W && W.J[s.id] ? W.J[s.id] : null;
  const mes = MP && MP[s.id] !== undefined ? MP[s.id] : 0; if (mes === null) eksik.push('mesai ücreti');
  const top = (mal || 0) - talas + isl + ayar + (gg || 0) + fas + (mes || 0);
  const gec = J.T > 0.05 ? agGecTL(agBedel(S.D, s), J.T) : 0;
  return { mal, talas, talasKg: tal ? tal.kg : null, isl, ayar, gg, mes, fas, fin, bek, top, eksik: [...new Set(eksik)], tutar, gec, T: J.T, erken, kar: tutar == null || eksik.length ? null : tutar - top, net: tutar == null || eksik.length ? null : tutar - top - gec - (fin || 0) - (bek ? bek.tl : 0) };
}

/* ---------- plan dengesi (zw-denge) ---------- */
/** @param {any} [k] @param {MotorDurumu} [st] */
function pdOzet(k, st) {
  const cx = compile(st); const W = wipHesap(k, st, cx); const MP = ymMesaiPay(k, cx);
  const o = { net: 0, eksik: 0, gec: 0, gecSa: 0, late: 0, sip: {} };
  for (const s of st.D.siparisler) { const J = k.J[s.id] || {}; if (J.T > 0.05) { o.gecSa += J.T; o.late++; }
    const x = ymSipMaliyet(s, k, cx, W, MP); if (!x) continue; o.sip[s.id] = { ...x, C: J.C }; if (x.net == null) { o.eksik++; continue; } o.net += x.net; o.gec += x.gec; }
  return o;
}
/* teklif için havuzdaki sipariş plana alınmış gibi kopyalanır; motor havuzu görmez */
function pdSt(id, termin) {
  const s0 = S.D.siparisler.find(x => x.id === id); const h = s0 && s0.havuz; if (h) s0.havuz = false;
  let st; try { st = dengeKilit(stOf()); } finally { if (h) s0.havuz = h; }
  if (termin !== undefined) { const s = st.D.siparisler.find(x => x.id === id); if (s) s.termin = termin; }
  return st;
}
function pdCalistir(liste, ms = 0) { return liste.map(x => ({ ...x, k: dgPlanKur(x.st, ms) })); }

/* ek mesai adayları (zu ymMesaiOner): darboğaz tezgâhların geciken işlerinin günlerinde ek vardiya; ölçüm sıra korunarak çözüm ve 300 ms arama */
/** @param {MotorDurumu} [st] */
function ymOlc(st) {
  stHazirla(st); const cx = compile(st);
  const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true); p0.cx = p0.cx || cx;
  const L = lns(st, p0, null, { ms: 300, seed: 11, free: true }); const e0 = evaluate(p0, st, null, true);
  const p = cmpEv(L.e, e0) > 0 ? L.plan : p0; p.cx = p.cx || cx; slack(p, cx); const e = evaluate(p, st, null, true);
  return { p, e, cx, gec: ymGecTL(e), diger: e.tl - (e.mesaiTL || 0), fail: (p.fail || []).length };
}
/** @param {any} [p] @param {Derleme} [cx] @param {any} [ev] */
function ymDarbogaz(p, cx, ev) {
  const val = {}, days = {}, isler = {};
  for (const r of Object.values(p.ops)) { if (r.fas || r.pin || r.done) continue; const J = ev.J[r.job]; if (!J || !(J.T > 0.05) || !(r.sl < 0)) continue;
    const s = S.D.siparisler.find(x => x.id === r.job); if (!s) continue;
    (isler[r.m] = isler[r.m] || new Set()).add(r.job); (days[r.m] = days[r.m] || new Set()).add(Math.floor(Math.max(r.S, 7) / 24)); }
  for (const m in isler) val[m] = [...isler[m]].reduce((a, j) => a + agBedel(S.D, S.D.siparisler.find(x => x.id === j)).b, 0);
  return { val, days, isler };
}
function ymMesaiAdaylari() {
  if (!S.plan || !planGuncel()) return [];
  const st = stOf(); const cx = compile(st); const D = st.D; if (!(D.vardiyalar || []).length) return [];
  const b = ymOlc(st); const dar = ymDarbogaz(b.p, cx, b.e);
  const red = new Set(((S.D.mesaiKarar || []).filter(k => k.karar === 'red')).map(ymAnahtar)); const var0 = new Set(S.ekMesai.map(ymAnahtar));
  const top = Object.entries(dar.val).sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(x => x[0]); const v1 = D.vardiyalar[0].id; const aday = [];
  for (const m of top) { let n = 0; const own = cx.M[m].vardiyalar || []; const ok = x => !own.length || own.includes(x);
    for (const d of [...dar.days[m]].sort((a, b2) => a - b2)) { if (n >= 3) break;
      if (cx.days[d] && cx.days[d].vard.length && !cx.days[d].vard.includes('V3') && D.vardiyalar.some(v => v.id === 'V3') && ok('V3')) { aday.push({ m, gun: d, vardiya: 'V3' }); n++; }
      const e = d + 1; if (e < HDAYS && cx.days[e] && !cx.days[e].vard.length) { aday.push({ m, gun: e, vardiya: v1 }); n++; } } }
  const l = [...new Map(aday.filter(a => !red.has(ymAnahtar(a)) && !var0.has(ymAnahtar(a))).map(a => [ymAnahtar(a), a])).values()].slice(0, 8); const liste = [];
  for (const a of l) {
    const stC = { ...stOf(), ekMesai: [...clone(S.ekMesai), a] }; const r = ymOlc(stC);
    const tl = ymMesaiTL(D, cx, a); const dGec = b.gec - r.gec; const dDiger = r.diger - b.diger;
    liste.push({ ...a, tl, dGec, dDiger });
  }
  return liste;
}
/* sira: yalnız o sıradaki denge konumu kurulur (uç konumları ayrı iş parçacıklarında koşturup birleştirir; sıra dışı boş döner) */
function pdSecenekler(sira) {
  const M = ymMesaiAdaylari();
  const D0 = [...new Set([0, 50, 100, pdDenge()])].sort((a, b) => a - b);
  const l = (sira == null ? D0 : D0.slice(sira, sira + 1)).map(d => { const st = dengeKilit(stOf()); st.tlAmac.kT = pdKat(d);
    const ac = M.filter(a => a.tl != null && a.dGec * pdKat(d) - a.tl - a.dDiger > 0).map(a => ({ m: a.m, gun: a.gun, vardiya: a.vardiya, tl: a.tl }));
    st.ekMesai = [...st.ekMesai, ...ac.map(({ tl, ...e }) => e)]; return { id: 'd' + d, d, st, mesai: ac }; });
  const r = pdCalistir(l, pdMs()); Object.assign(TL_AMAC, stOf().tlAmac);
  /* bedeli bilinmeyen ek mesai bedava sayılmaz, seçilmez (2745 a ilkesi); kart bunu bildirsin diye işaret döner */
  return { bedeliBilinmeyenEkMesai: M.some(a => a.tl == null), secenekler: r.map(x => { const o = pdOzet(x.k, x.st); const mTL = x.mesai.some(e => e.tl == null) ? null : x.mesai.reduce((a, e) => a + e.tl, 0);
    return { denge: x.d, carpan: pdKat(x.d), ekMesai: x.mesai.map(e => ({ makineId: e.m, gun: e.gun, vardiya: e.vardiya, tl: e.tl })), ekMesaiTl: mTL,
      geciken: o.late, isSayisi: x.k.ozet.n, gecikmeSaat: o.gecSa, netKar: mTL == null ? null : o.net - mTL, eksik: o.eksik, plan: { ...x.k, dataVer: S.dataVer } }; }) };
}
function pdTeklif(id) {
  const s = S.D.siparisler.find(x => x.id === id);
  const now = cxAl().st.now;
  const r = pdCalistir([{ id: 'erken', st: pdSt(id, tmYaz(Math.ceil(now + 1))) }]);
  const C = (r[0].k.J[id] || {}).C;
  const taban = s.havuz ? 'siparissiz' : 'girilen-termin';
  if (C == null) return { siparisId: id, havuz: !!s.havuz, taban, yerlesti: false, satirlar: [] };
  const C0 = Math.ceil(C); const mev = parseT(S.D, s.termin);
  const adaylar = /** @type {[string, number][]} */ ([['en-erken', C0], ['3-gun', C0 + 72], ['7-gun', C0 + 168], ['14-gun', C0 + 336]]);
  if (mev != null && !adaylar.some(a => Math.abs(a[1] - mev) < 12)) adaylar.push(['girilen', mev]);
  adaylar.sort((a, b) => a[1] - b[1]);
  const l = adaylar.map(([ad, t], i) => ({ id: 't' + i, ad, t, st: pdSt(id, tmYaz(t)) }));
  const r2 = pdCalistir([{ id: 'taban', st: dengeKilit(stOf()) }, ...l]);
  const T0 = r2.find(x => x.id === 'taban'); const o0 = pdOzet(T0.k, T0.st);
  const satirlar = r2.filter(x => x.id !== 'taban').map(x => { const o = pdOzet(x.k, x.st); const b = o.sip[id] || {};
    let diger = 0;
    for (const j in o.sip) { if (j === id) continue; const a = o.sip[j], z = o0.sip[j]; if (a && z && a.net != null && z.net != null) diger += a.net - z.net; }
    const digerSa = (o.gecSa - ((o.sip[id] || {}).T > 0.05 ? o.sip[id].T : 0)) - (o0.gecSa - ((o0.sip[id] || {}).T > 0.05 ? o0.sip[id].T : 0));
    return { secenek: x.ad, termin: tmYaz(x.t), bitis: b.C == null ? null : b.C, gecikmeSaat: b.T == null ? null : b.T, tutar: b.tutar == null ? null : b.tutar, netKar: b.net == null ? null : b.net,
      digerKarFarki: diger, digerGecikmeFarki: digerSa, toplamKar: b.net == null ? null : b.net + diger }; });
  return { siparisId: id, havuz: !!s.havuz, taban, yerlesti: true, satirlar };
}
function pdUzatma(gun) {
  const p = S.plan;
  const gec = S.D.siparisler.filter(s => !s.havuz && !s.iptal && (p.J[s.id] || {}).T > 0.05 && parseT(S.D, s.termin) != null)
    .map(s => ({ s, b: agGecTL(agBedel(S.D, s), p.J[s.id].T) })).sort((a, b) => b.b - a.b).slice(0, 6);
  if (!gec.length) return { gun, satirlar: [] };
  const yeni = {}; for (const { s } of gec) yeni[s.id] = tmYaz(parseT(S.D, s.termin) + gun * 24);
  const r = pdCalistir([{ id: 'taban', st: dengeKilit(stOf()) }, ...gec.map(({ s }) => ({ id: s.id, st: pdSt(s.id, yeni[s.id]) }))]);
  const t = r.find(x => x.id === 'taban'); const o0 = pdOzet(t.k, t.st);
  const satirlar = r.filter(x => x.id !== 'taban').map(x => { const o = pdOzet(x.k, x.st); const a = o0.sip[x.id] || {}, b = o.sip[x.id] || {};
    return { siparisId: x.id, yeniTermin: yeni[x.id], gecikmeSimdi: a.T == null ? null : a.T, gecikmeUzatinca: b.T == null ? null : b.T, netKarFarki: o.eksik === o0.eksik ? o.net - o0.net : null,
      gecikmeSaatFarki: o0.gecSa - o.gecSa, gecikenFarki: o0.late - o.late }; })
    .sort((a, b) => (b.netKarFarki ?? b.gecikmeSaatFarki) - (a.netKarFarki ?? a.gecikmeSaatFarki));
  return { gun, satirlar };
}

/* ---------- malzeme ve fason terminleri (zv-termin tmMalzeme), öne çekme (zz7) ---------- */
const TM_DURUM = { 'hızlandır': 'hizlandir', 'plan önce istiyor': 'plan-once-istiyor', 'ertelenebilir': 'ertelenebilir', 'uygun': 'uygun', 'bağlı iş yok': 'bagli-is-yok', 'sipariş yok': 'siparis-yok' };
/* satın alma satırının termini: girilmiş (siparişte ya da Satın Alma'da), termini beklenen (554 a: olması gereken tarihte gelmiş sayılır), sipariş verilmemiş */
const TM_TERMIN = { termin: 'termin', 'sa-termin': 'termin', 'termin-bekleniyor': 'termin-bekleniyor', 'siparis-yok': 'siparis-yok' };
const sonlu = x => x == null || !isFinite(x) ? null : x;
function tmMalzeme() {
  const p = S.plan; const cx = cxAl(); const D = cx.st.D; const now = cx.st.now;
  const L = satinalmaListe({ ops: p.ops, cx }, { D, now });
  let k = -1;
  return { satirlar: L.filter(r => r.tur === 'sa' || r.tur === 'eksik').map(r => { const sa = r.tur === 'sa'; if (sa) k++;
    const po = sa ? D.satinalma[k] || {} : null;
    return { tur: sa ? 'siparis' : 'eksik', satinalmaSira: sa && po.src != null ? po.src : null, termin: sa ? TM_TERMIN[po.tm || 'termin'] || 'termin' : 'siparis-yok', kod: r.kod, miktar: r.miktar, tedarikci: sa ? r.tedarikci || null : null, soz: sa ? sonlu(r.soz) : null,
      etkin: sa ? sonlu(r.etkin) : null, plan: sonlu(r.plan), enGec: sonlu(r.enGec), farkGun: sa ? sonlu(r.fark) : null, siparisEnGec: sa ? null : sonlu(r.siparisEnGec),
      durum: TM_DURUM[r.durum] || 'bagli-is-yok', isler: r.jobs.slice() }; }) };
}
const MO_GUN = [1, 3, 5];
function moAdaylar() {
  const cx = cxAl(); const D = cx.D || cx.st.D; const bag = {};
  for (const jid in cx.mat.res) for (const d of cx.mat.res[jid].det) for (const u of d.use) if (u.k === 'sa') (bag[u.i] = bag[u.i] || new Set()).add(jid);
  return Object.entries(bag).map(([i, js]) => { const po = (D.satinalma || [])[+i]; if (!po) return null; const soz = parseT(D, po.gelis);
    return { i: +i, src: po.src == null ? null : po.src, kod: po.kod, ted: po.tedarikci, soz, isler: [...js] }; }).filter(a => a && a.soz != null && a.soz > 0);
}
function moOlc(a, X) {
  const st = stOf(); if (a) st.D.satinalma[a.i].gelis = a.soz - X * 24;
  stHazirla(st); const cx = compile(st); const p = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true);
  const e = evaluate(p, st, null, true);
  const T = {}; for (const j of (a ? a.isler : Object.keys(e.J))) T[j] = e.J[j] ? e.J[j].T : null;
  return { tl: tlToplam(e), wT: e.wT, sumT: e.sumT, late: e.late, fail: (p.fail || []).length, T };
}
function moHesapla() {
  const t = moOlc(null, 0);
  const satirlar = moAdaylar().map(a => ({ satinalmaSira: a.src, kod: a.kod, tedarikci: a.ted || null, soz: a.soz, isler: a.isler, kazanc: MO_GUN.map(X => { const o = moOlc(a, X);
    const kur = a.isler.filter(j => t.T[j] > 0.05 && (o.T[j] ?? 1e9) < 0.05);
    /* erken gelen malzeme eski planı bozmaz: aynı sırayla çözüm daha kötüyse eski plan geçerli kalır, kazanç sıfırdır */
    const iyi = o.fail <= t.fail && o.tl < t.tl;
    return iyi ? { gun: X, tl: t.tl - o.tl, saat: Math.max(0, t.sumT - o.sumT), geciken: t.late - o.late, kurtulan: kur } : { gun: X, tl: 0, saat: 0, geciken: 0, kurtulan: [] }; }) }));
  return { gunler: MO_GUN.slice(), taban: { tl: t.tl, gecikmeSaat: t.sumT, geciken: t.late, yerlesmeyen: t.fail }, satirlar };
}

/* ---------- partiyi böl (zz4, zz10) ---------- */
function darbogazAdimi(jid) {
  const cx = cxAl(); if (!cx || !cx.jobs[jid]) return null;
  const BEK = new Set(['tezgah', 'personel', 'yetkin', 'ayarci', 'aparat']);
  let dar = null, enW = -1;
  for (const o of cx.jobs[jid].ops) { const r = S.plan.ops[o.id]; if (!r || r.fas || r.done || r.act) continue;
    let hazir = r.S; if (r.why && BEK.has(r.why.t)) { let cp = -Infinity; for (const [p] of o.pr) { const q = S.plan.ops[p]; if (q) cp = Math.max(cp, q.C); } hazir = isFinite(cp) ? cp : r.S; }
    const w = r.S - hazir + r.run * 0.01; if (w > enW) { enW = w; dar = { o, r }; } }
  if (!dar) return null;
  const alt = dar.o.c.filter(c => !c.fas && !c.opt && c.m !== dar.r.m).sort((x, y) => (x.run + x.su) - (y.run + y.su)).map(c => c.m);
  return { ...dar, alt };
}
function partiBol(jid, dagitim, adetler) {
  const dar = darbogazAdimi(jid);
  const darbogaz = dar ? { adim: dar.o.id.slice(dar.o.id.lastIndexOf('.') + 1), makineId: dar.r.m, alternatifler: dar.alt.slice() } : null;
  if (!adetler) return { siparisId: jid, darbogaz, sonuc: null };
  const s = S.D.siparisler.find(x => x.id === jid);
  const opId = dar ? dar.o.id : Object.keys(S.plan.ops).find(id => S.plan.ops[id].job === jid);
  const tez = dar ? [dar.r.m, ...dar.alt] : [];
  const parcalar = adetler.map((n, i) => ({ n, m: dagitim === 'dag' && tez.length > 1 && i % tez.length ? tez[i % tez.length] : null }));
  const k = opId.slice(opId.lastIndexOf('.') + 1);
  const yeni = parcalar.map((x, i) => siparisParcasi(s, `${jid}/${i + 1}`, x.n)); const eski = S.D.siparisler;
  S.D.siparisler = eski.flatMap(x => x.id === jid ? yeni : [x]);
  let st; try { st = stOf(); } finally { S.D.siparisler = eski; }
  const ops = {}; const pref = jid + '.';
  for (const [id, r] of Object.entries(S.plan.ops)) {
    if (!id.startsWith(pref)) { ops[id] = r; continue; }
    const kk = id.slice(pref.length);
    parcalar.forEach((x, i) => { const j = `${jid}/${i + 1}`; ops[`${j}.${kk}`] = { ...r, id: `${j}.${kk}`, job: j, S: r.S + i * 1e-3, m: x.m && kk === k ? x.m : r.m }; });
  }
  for (const id of Object.keys(st.locks)) if (id.startsWith(pref)) { const kk = id.slice(pref.length), l = st.locks[id]; delete st.locks[id]; parcalar.forEach((x, i) => { st.locks[`${jid}/${i + 1}.${kk}`] = { ...l }; }); }
  const r0 = S.plan.ops[opId];
  parcalar.forEach((x, i) => { if (x.m) st.locks[`${jid}/${i + 1}.${k}`] = { m: x.m, S: r0 ? r0.S : st.now }; });
  stHazirla(st); const cx = compile(st);
  const p = kisaArama(st, cx, lnsDecode(st, { ops, fail: S.plan.fail || [] }, [], cx, true), 500);
  const kayit = planKaydi(p, st, null);
  let T = 0, C = -1e9; for (const y of yeni) { const J = kayit.J[y.id] || {}; T = Math.max(T, J.T || 0); C = Math.max(C, J.C ?? 1e9); }
  return { siparisId: jid, darbogaz, sonuc: {
    partiler: parcalar.map((x, i) => ({ siparisId: `${jid}/${i + 1}`, adet: x.n, makineId: x.m })),
    gecikmeOnce: (S.plan.J[jid] || {}).T || 0, gecikmeSonra: T, bitisSonra: C >= 1e9 ? null : C, tl: tlToplam(evaluate(p, st, null, true)),
    siparisler: yeni, plan: { ...kayit, dataVer: S.dataVer } } };
}

/* ---------- planı kur (e-coz coz 'sifir', ISCI_KODU) ----------
   Kural tabanlı ilk plan, kalan bütçede LNS. Dondurma bölgesi plan dengesine göre kilitlenir (dengeKilit). Bütçe çalışmanın çözüm süresidir
   (S.w.sure sn, sabit adımlı saatle). Kayıtlı planı iyileştirme burada yok (579 b: HiGHS gelene kadar). Canlı plana göre değişim (ozet.chg)
   burada ölçülmez: null. */
function planKur() {
  const st = stHazirla(dengeKilit(stOf())); const cx = compile(st); const ms = (+S.w.sure || 10) * 1000; const t0 = Date.now();
  let cur = schedule(st, 'dagit', null, { cx }); slack(cur, cx);
  let E = evaluate(cur, st, null, true); const ilk = E.wT;
  const lbx = lowerBound(st, cx); const lbC = {}; for (const j in lbx.C) lbC[j] = isFinite(lbx.C[j]) ? lbx.C[j] : null;
  let seed = 17, durgun = 0;
  while (Date.now() - t0 < ms && durgun < 4) {
    const L = lns(st, cur, null, { ms: Math.max(250, Math.min(1500, ms - (Date.now() - t0))), seed: seed++, free: true });
    if (cmpEv(L.e, E) > 0) { cur = L.plan; E = L.e; durgun = 0; } else durgun++;
  }
  return { plan: { ...planKaydi(cur, st, null), lb: lbx.wT, lbC, ilk, dataVer: S.dataVer } };
}

/* Bekleyen değişikliği uygula (755 a; sayfanın eski 'onar' kipi): kayıtlı plan taban ve başvurudur. Etkilenmeyen siparişin işleri o
   plandaki yerinde geçici kilitlenir; yalnız etkilenen siparişlerin işleri yeniden dizilir ('*': hepsi). Kilitli ve donuk işler yerinde. */
function planUygula(isler) {
  const hepsi = isler.includes('*'), etk = new Set(isler);
  const st = stHazirla(dengeKilit(stOf())); const var_ = new Set(st.D.siparisler.map(s => s.id));
  if (!hepsi) for (const r of Object.values(S.plan.ops)) if (!etk.has(r.job) && var_.has(r.job) && !st.locks[r.id] && !r.fas && !r.done && isFinite(r.S)) st.locks[r.id] = { m: r.m, S: r.S, gecici: 1 };
  const cx = compile(st); const ms = (+S.w.sure || 10) * 1000; const t0 = Date.now(); const ref = { ops: S.plan.ops };
  let cur = lnsDecode(st, { ops: S.plan.ops, fail: [] }, [], cx, false); slack(cur, cx);
  let E = evaluate(cur, st, ref, true); const ilk = E.wT;
  let seed = 17, durgun = 0;
  while (Date.now() - t0 < ms && durgun < 4) {
    const L = lns(st, cur, ref, { ms: Math.max(250, Math.min(1500, ms - (Date.now() - t0))), seed: seed++, free: false });
    if (cmpEv(L.e, E) > 0) { cur = L.plan; E = L.e; durgun = 0; } else durgun++;
  }
  return { plan: { ...planKaydi(cur, st, ref), ilk, dataVer: S.dataVer } };
}

/* ---------- önizlemeli hamleler (2129-1 b; sayfanın c-masa hamleDene, hamleKur, oneAlAdaylari) ----------
   Kayıtlı plan taban alınır; sonuç yazılmaz, ekran kabul ederse çalışmaya yazar. Kullanıcının kilitleri yerinde kalır: öne al kilitli
   adımı taşımaz (sayfa taşınan adımın kilidini kaldırırdı; burada kilit yalnız elle kalkar). */
const HAMLE_DEGISEN_EN_COK = 200;
function hamleFarki(k) {
  const l = [];
  for (const j of Object.keys(k.J)) {
    const a = S.plan.J[j] ? S.plan.J[j].C : null, b = k.J[j].C;
    if (a == null && b == null) continue;
    const d = (b == null ? 1e4 : b) - (a == null ? 1e4 : a);
    if (Math.abs(d) < 0.05) continue;
    const ta = S.plan.J[j] ? S.plan.J[j].T : null, tb = k.J[j].T;
    const durum = (ta == null || ta > 0.01) && tb != null && tb <= 0.01 ? 'zamanina-girdi' : (ta != null && ta <= 0.01) && (tb == null || tb > 0.01) ? 'gecikmeye-dustu' : 'ayni';
    l.push({ siparisId: j, once: a, sonra: b, durum, d: Math.abs(d) });
  }
  return l.sort((x, y) => y.d - x.d).slice(0, HAMLE_DEGISEN_EN_COK).map(({ d, ...x }) => x);
}
/* kayıtlı planın gecikmesi aynı ölçüyle yeniden hesaplanır: kayıttaki özet eski bir hesaptan kalmış olabilir */
function kayitliGecikme() { const st = stHazirla(stOf()); const cx = compile(st); return evaluate(lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, false), st, null, true).wT; }

/* İyileştirme ara: kayıtlı plan çözülür, çalışmanın çözüm bütçesinde LNS; kayıtlı plana göre değişim bedeli sayılır. Daha iyisi yoksa plan null. */
function planIyilestir() {
  const st = stHazirla(dengeKilit(stOf())); const cx = compile(st); const ms = (+S.w.sure || 10) * 1000; const t0 = Date.now(); const ref = { ops: S.plan.ops };
  let cur = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, false); slack(cur, cx);
  const E0 = evaluate(cur, st, ref, true); let E = E0, bulundu = false;
  let seed = 17, durgun = 0;
  while (Date.now() - t0 < ms && durgun < 4) {
    const L = lns(st, cur, ref, { ms: Math.max(250, Math.min(1500, ms - (Date.now() - t0))), seed: seed++, free: true });
    if (cmpEv(L.e, E) > 0 && (L.plan.fail || []).length <= (cur.fail || []).length) { cur = L.plan; E = L.e; durgun = 0; bulundu = true; } else durgun++;
  }
  if (!bulundu) return { plan: null, gecikmeOnce: E0.wT, gecikmeSonra: null, degisen: [] };
  const k = planKaydi(cur, st, ref);
  return { plan: { ...k, ilk: E0.wT, dataVer: S.dataVer }, gecikmeOnce: E0.wT, gecikmeSonra: k.ozet.wT, degisen: hamleFarki(k) };
}

/* Elle hamle (c-masa hamleDene): taşınan adımlar [id, tezgâh, anahtar saat] ile kod çözülür; öncülünü bekleyen adımlar yeniden anahtarlanır,
   taşınanlar yerinde tutulup çevre kısa süre toparlanır, yalnız daha iyiyse alınır. */
function dgHamle(mods) {
  const st = stHazirla(stOf());
  const cx = compile(st); let p = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, mods, cx, true, true);
  const tas = +cx.A.tasimaSaat || 0, tasinan = new Set(mods.map(x => x[0]));
  for (let i = 0; i < 4; i++) {
    const yeni = [];
    for (const r of Object.values(p.ops)) {
      if (tasinan.has(r.id) || r.fas || !r.why || r.why.t !== 'tezgah') continue;
      const o = cx.byId[r.id]; let hazir = 7; const j = cx.jobs[r.job]; if (j.rel != null) hazir = Math.max(hazir, j.rel);
      for (const [pid, ty] of o.pr) { const q = p.ops[pid]; if (q) hazir = Math.max(hazir, (ty === 'o' && !q.fas ? q.lot1 : q.C) + (q.fas ? 0 : tas)); }
      if (hazir < r.S - 1) yeni.push([r.id, r.m, hazir]);
    }
    if (!yeni.length) break;
    const q = lnsDecode(st, p, yeni, cx, true, true);
    if (cmpEv(evaluate(q, st, null, true), evaluate(p, st, null, true)) > 0) p = q; else break;
  }
  slack(p, cx);
  if (mods.length) {
    const stR = { ...st, locks: { ...st.locks } };
    for (const [id] of mods) { const r = p.ops[id]; if (r) stR.locks[id] = { m: r.m, S: r.S }; }
    const cxR = compile(stR); const pR = lnsDecode(stR, p, [], cxR, true);
    const L = lns(stR, pR, null, { ms: 450, seed: 7, free: true });
    const e0 = evaluate(p, st, null, true);
    const geri = mods.map(([id]) => p.ops[id] && [id, p.ops[id].m, p.ops[id].S - 1e-3]).filter(Boolean);
    const p2 = lnsDecode(stR, L.plan, geri, cxR, true, true); slack(p2, cxR);
    const e1 = evaluate(p2, st, null, true);
    const yerinde = geri.every(([id]) => { const a = p.ops[id], b = p2.ops[id]; return a && b && b.S <= a.S + 0.25; });
    if (yerinde && cmpEv(e1, e0) > 0 && (p2.fail || []).length <= (p.fail || []).length) p = p2;
  }
  return { p, st };
}

/* Siparişi öne al (c-masa oneAl): her adım kapasitesiz en erken başlama anının hemen önüne, üç yolla denenir (yalnız kaynak bekleyenler,
   bütün adımlar aynı tezgâhta, bütün adımlar en hızlı tezgâhta); sipariş için daha erken biten, eşitse toplam gecikmesi az olan seçilir. */
const ONE_AL_YOLLARI = [[false, true, 'yalnız kaynak bekleyen adımlar'], [false, false, 'bütün adımlar, aynı tezgâhlarda'], [true, false, 'bütün adımlar, en hızlı tezgâhlarda']];
function oneAl(jid) {
  const bos = neden => ({ siparisId: jid, plan: null, yol: null, neden, bitisOnce: S.plan.J[jid] ? S.plan.J[jid].C : null, bitisSonra: null, gecikmeOnce: kayitliGecikme(), gecikmeSonra: null, degisen: [] });
  const cx = cxAl(); if (!cx.jobs[jid]) return bos('Sipariş planda değil.');
  const st = stOf(); const HT = lbHeadsTails(st, cx); const p = S.plan; const kilit = S.locks || {};
  const byM = {}; for (const r of Object.values(p.ops)) if (isFinite(r.C)) (byM[r.m] = byM[r.m] || []).push(r);
  for (const m in byM) byM[m].sort((a, b) => a.S - b.S);
  const BEKLEME = new Set(['tezgah', 'personel', 'yetkin', 'ayarci', 'aparat']);
  const modsOf = (hizli, yalnizBekleyen) => cx.jobs[jid].ops.map(o => {
    const r = p.ops[o.id]; if (!r || r.done || r.act || kilit[o.id] || !isFinite(HT.head[o.id])) return null;
    if (yalnizBekleyen && !(r.why && BEKLEME.has(r.why.t))) return null;
    let m = r.m;
    if (hizli && !r.fas) { const ms = o.c.filter(c => !c.fas && !c.opt); if (ms.length) m = ms.reduce((a, b) => (b.run + b.su < a.run + a.su ? b : a)).m; }
    const tgt = Math.max(7, HT.head[o.id]); const q = (byM[m] || []).filter(z => z.id !== o.id);
    let i = q.findIndex(z => z.S >= tgt - 1e-9); if (i < 0) i = q.length;
    while (i > 0 && kilit[q[i - 1].id] && q[i - 1].S >= tgt) i--;
    const lo = i > 0 ? q[i - 1].S : 7, hi = i < q.length ? q[i].S : lo + 48;
    return [o.id, m, i < q.length ? Math.min(hi - 1e-3, Math.max(lo, tgt)) : Math.max(lo, tgt) + 1e-3];
  }).filter(Boolean);
  const c0 = p.J[jid] ? (p.J[jid].C ?? 1e9) : 1e9; let en = null;
  for (const [hizli, yb, ad] of ONE_AL_YOLLARI) {
    const mods = modsOf(hizli, yb); if (!mods.length) continue;
    const { p: q, st: stq } = dgHamle(mods); const k = planKaydi(q, stq, null);
    const c = k.J[jid] ? (k.J[jid].C ?? 1e9) : 1e9; const x = { c, k, ad, iyi: c < c0 - 0.05 };
    if (!en || (x.iyi && !en.iyi) || (x.iyi === en.iyi && (x.c < en.c - 0.05 || (Math.abs(x.c - en.c) <= 0.05 && x.k.ozet.wT < en.k.ozet.wT - 0.05)))) en = x;
  }
  if (!en) return bos('Öne alınacak adım yok: adımlar başlamış, kilitli ya da bitmiş.');
  if (!en.iyi) return bos('Sipariş daha erken bitirilemiyor; asıl bekleme kilitli ya da başlamış işlerde.');
  return { siparisId: jid, plan: { ...en.k, dataVer: S.dataVer }, yol: en.ad, neden: null, bitisOnce: p.J[jid] ? p.J[jid].C : null, bitisSonra: en.k.J[jid] ? en.k.J[jid].C : null,
    gecikmeOnce: kayitliGecikme(), gecikmeSonra: en.k.ozet.wT, degisen: hamleFarki(en.k) };
}

/* Tezgâh sırası (2149; c-masa pmSirala, v20 sıra Uygula, kuyrukta bir öne/arkaya): `sira` adımların bu tezgâhtaki istenen sırasıdır.
   Tezgâhtaki adımlar kendi sıra anahtarlarını yeni sırayla paylaşır (kuyruğun geri kalanı yerinde kalır); başka tezgâhtan gelen adım
   komşularının arasına anahtarlanır. Sabit (kilitli) adım sıradaki yerini korumalıdır; başlamış, bitmiş, fason adım oynamaz.
   Kişinin hamlesidir: plan kötüleşse de önizlenir; motor istenen sırayı tutamazsa (öncül bekleyişi) plan null. */
function siraDegistir(m, sira) {
  const p = S.plan; const kilit = S.locks || {};
  const mevcut = () => Object.values(p.ops).filter(r => r.m === m && isFinite(r.S) && !r.done).sort((a, b) => a.S - b.S).map(r => r.id);
  const bos = neden => ({ tezgah: m, sira: mevcut(), plan: null, neden, gecikmeOnce: kayitliGecikme(), gecikmeSonra: null, degisen: [] });
  const cx = cxAl(); const st = stOf();
  if (m.startsWith('@') || !cx.M[m]) return bos('Tezgâh planda yok ya da fason.');
  for (const id of sira) {
    const r = p.ops[id], o = cx.byId[id];
    if (!r || !o) return bos(`${id} planda yok.`);
    if (!isFinite(r.S)) return bos(`${id} planlanmadı; önce plana girmeli.`);
    if (r.done || r.act || r.fas || (S.gercek && S.gercek[id])) return bos(`${id} başlamış, bitmiş ya da fason; yeri değişmez.`);
    if (r.m !== m) {
      if (kilit[id]) return bos(`${id} sabit; başka tezgâha taşınmaz.`);
      if (!o.c.some(c => c.m === m && !c.fas)) return bos(`${id} bu tezgâhta yapılamaz.`);
      if (st.pref && st.pref[id] && st.pref[id] !== m) return bos(`${id} başka tezgâha bağlı.`);
    }
  }
  const yerli = sira.filter(id => p.ops[id].m === m);
  const eski = yerli.slice().sort((a, b) => p.ops[a].S - p.ops[b].S);
  for (const id of yerli) if (kilit[id] && yerli.indexOf(id) !== eski.indexOf(id)) return bos(`${id} sabit; sıradaki yeri değişmez.`);
  if (yerli.length === sira.length && yerli.every((id, i) => id === eski[i])) return bos('Sıra değişmedi.');
  const anahtar = {}; eski.forEach((id, i) => { anahtar[yerli[i]] = p.ops[id].S; });
  const diger = mevcut().filter(x => !sira.includes(x)).map(x => p.ops[x].S);
  sira.forEach((id, i) => {
    if (anahtar[id] != null) return;
    const once = sira.slice(0, i).reverse().find(x => anahtar[x] != null), sonra = sira.slice(i + 1).find(x => anahtar[x] != null);
    const a = once != null ? anahtar[once] : null, b = sonra != null ? anahtar[sonra] : null;
    if (a != null && b != null) anahtar[id] = (a + b) / 2;
    else if (a != null) { const n = diger.find(v => v > a + 1e-9); anahtar[id] = n != null ? (a + n) / 2 : a + 1e-3; }
    else if (b != null) { const n = diger.filter(v => v < b - 1e-9).pop(); anahtar[id] = n != null ? (n + b) / 2 : b - 1e-3; }
    else anahtar[id] = p.ops[id].S;
  });
  const mods = sira.map(id => [id, m, anahtar[id]]);
  const { p: q, st: stq } = dgHamle(mods); const k = planKaydi(q, stq, null);
  const sonuc = Object.values(q.ops).filter(r => r.m === m && isFinite(r.S) && sira.includes(r.id)).sort((a, b) => a.S - b.S).map(r => r.id);
  if (sonuc.length !== sira.length || sonuc.some((id, i) => id !== sira[i])) return bos('Motor bu sırayı tutamadı: öne alınan adım öncülünü bekliyor ya da tezgâh kısıtı var.');
  const tum = Object.values(q.ops).filter(r => r.m === m && isFinite(r.S) && !r.done).sort((a, b) => a.S - b.S).map(r => r.id);
  return { tezgah: m, sira: tum, plan: { ...k, dataVer: S.dataVer }, neden: null, gecikmeOnce: kayitliGecikme(), gecikmeSonra: k.ozet.wT, degisen: hamleFarki(k) };
}

/* ---------- giriş ----------
   calisma, kayit ve kaynak planlama çalışması ucunun birleştirdiği girdidir (288 a); an: sunucunun şimdisi (ms); istek: sözleşmedeki tur ve alanları.
   Hata { hata: 'plan-yok' | 'siparis-yok' | 'adet' | 'basladi' }: çağıran uygun koda çevirir. */
const DG_PLANLI = new Set(['plan-uygula', 'termin-uzatma', 'malzeme-terminleri', 'malzeme-one-cekme', 'parti-bolme', 'plan-iyilestir', 'one-al', 'sira-degistir']);
/* Hamle kayıtlı planı taban alır: plan veriden eskiyse önce bekleyen değişiklik uygulanır. */
const DG_GUNCEL = new Set(['plan-iyilestir', 'one-al', 'sira-degistir']);
function degerlendir(calisma, kayit, kaynak, bugun, an, istek) {
  S = null; U = {}; DG_CX = null;
  const g = girdiKur(calisma, kayit, kaynak, bugun); if (!g) return null;
  S = g.S; const k = kayit && kayit.items ? kayit : null;
  DG_BITEN = tmiBitenler((kaynak && kaynak.durum && kaynak.durum.emirler) || k, S.D);
  const n = tmiSaat(S.D, an); if (n != null && n >= 0) S.simdi = Math.floor(n * 4) / 4;
  saatSabitle(an, cxAl().ops.length);
  const zarf = sonuc => ({ dataVer: S.dataVer, baslangic: (S.D.meta && S.D.meta.baslangic) || null, simdi: cxAl().st.now, sonuc: { tur: istek.tur, ...sonuc } });
  if (DG_PLANLI.has(istek.tur) && !(S.plan && S.plan.ops)) return { hata: 'plan-yok' };
  if (DG_GUNCEL.has(istek.tur) && !planGuncel()) return { hata: 'plan-bayat' };
  if (istek.siparisId != null) { const s = S.D.siparisler.find(x => x.id === istek.siparisId); if (!s) return { hata: 'siparis-yok' };
    if (istek.tur === 'parti-bolme') {
      if (!S.plan.J[s.id] || basladiMi(s.id)) return { hata: 'basladi' };
      if (istek.adetler && (istek.adetler.reduce((a, x) => a + x, 0) !== s.adet || istek.adetler.some(x => !(x >= 1)))) return { hata: 'adet' };
    } }
  if (istek.tur === 'plan-kur') return zarf(planKur());
  if (istek.tur === 'plan-uygula') return zarf(planUygula(istek.isler));
  if (istek.tur === 'plan-secenekleri') return zarf(pdSecenekler(istek.sira));
  if (istek.tur === 'termin-secenekleri') return zarf(pdTeklif(istek.siparisId));
  if (istek.tur === 'termin-uzatma') return zarf(pdUzatma(istek.gun));
  if (istek.tur === 'malzeme-terminleri') return zarf(tmMalzeme());
  if (istek.tur === 'malzeme-one-cekme') return zarf(moHesapla());
  if (istek.tur === 'parti-bolme') return zarf(partiBol(istek.siparisId, istek.dagitim, istek.adetler));
  if (istek.tur === 'plan-iyilestir') return zarf(planIyilestir());
  if (istek.tur === 'one-al') return zarf(oneAl(istek.siparisId));
  if (istek.tur === 'sira-degistir') return zarf(siraDegistir(istek.tezgah, istek.sira));
  return null;
}
