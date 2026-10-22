/* ---------- Ufuk: plan, malzeme, öngörü ----------
   Motorun ufku 63 gündür; bu sayfa 26 ya da 52 haftaya bakar ve motoru çalıştırmaz. Üç katman aynı hafta ızgarasına konur:
   - Plan: gösterilen plandaki işlemler (ayar + işleme saati, işlemin başı ile sonu arasına takvim süresiyle bölünür). Başlamış işlemin kalanı.
   - Plan dışı: planda işlemi olmayan sipariş (havuzda ya da planlanamamış). Terminden geriye zamanlanır: adımlar rota sırasının tersiyle,
     her adım en hızlı tezgâhında (ayar + adet × çevrim) ÷ verim saat, tezgâhın günlük açık saatine bölünüp iş günü olarak; üstüne adım başı
     bekleme. Fason adım fasoncunun süresi + çıkış gününe ortalama bekleme. Başlangıç bugünden önceye düşerse zincir bugüne kaydırılır ve
     sipariş "termine yetişmiyor" sayılır. Bağ, örtüşme ve tezgâh yarışı yok: kaba yüktür, sıra değildir.
   - Öngörü: Yıllık plan sayfasının tahmin ayarı. "Geçmişten": talepHizi (kapanmış ve açık siparişlerin giriş tarihinden hız); 12 haftadan
     az giriş varsa hız düşük güvenlidir ve sayfa bunu söyler; hiç giriş yoksa öngörü üretilmez. "Elle":
     aylık aile tahmini ürüne bölünür. Aynı ürün ve aydaki siparişler tahmini tüketir
     (ay tahmini − ay siparişi, sıfırdan küçükse sıfır), kalan ay sonu terminli tek parti olarak aynı geriye zamanlamayla yüke girer. Motora girmez (karar 43 a).
   Kapasite: tezgâhın vardiya ve çalışma günü takviminden, tatil düşülerek, × kullanılabilirlik (Genel gider sayfasındaki verim). Kişi sınırı yok.
   Malzeme: ihtiyaç ilk adımın başlangıcında. Stok ve açık satın alma (söz + tedarikçi gecikmesi + muayene) zaman sırasıyla düşülür; eksik önce
   sonra gelecek açık siparişin öne çekilmesiyle, kalanı yeni alımla karşılanır. En geç talep = ihtiyaç − muayene − tedarik süresi.
   Öngörü malzemeye ayarla girer (varsayılan girmez). Sayfa yazmaz; talebi satın alma modülü açar (bağlamada). TL yalnız müdür ve yönetici görür. */
const UF_KAT = [['plan', 'Plan', 'var(--grafik)'], ['kaba', 'Plan dışı sipariş', 'var(--grafik-2)'], ['ongoru', 'Öngörü', 'var(--idle)']];
const UF_KAT_AD = Object.fromEntries(UF_KAT.map(([k, a]) => [k, a]));
U.ufGor = U.ufGor || 'yuk'; if (U.ufOngoru == null) U.ufOngoru = true;
function ufAyar(D = S.D) { return (D.ufuk = D.ufuk || { hafta: 52, kuyruk: 1, ongoruMalzeme: false }); }
const ufAnah = p => [p === S.plan ? 'p' : 'o', S.dataVer, JSON.stringify(ufAyar()), JSON.stringify(ylAyar()), (msSis().verim || 85)].join('|');

/* takvim: plan başından gün sırası; tezgâhın o günkü açık saati ve iş günü */
function ufTakvim(D) {
  const vs = {}; for (const v of D.vardiyalar || []) { let h = hm(v.bit) - hm(v.bas); if (h <= 0) h += 24; vs[v.id] = h; }
  const tatil = new Set((D.tatiller || []).map(s => Math.floor(parseT(D, s) / 24)));
  const gun = d => tatil.has(d) ? [] : (D.calismaGunleri[wdOf(D, d)] || []);
  const tezSaat = (m, d) => { const own = m.vardiyalar && m.vardiyalar.length ? m.vardiyalar : null; return gun(d).filter(s => !own || own.includes(s)).reduce((a, s) => a + (vs[s] || 0), 0); };
  return { isGunu: d => gun(d).length > 0, tezSaat };
}
/* t saatinden geriye n iş günü (iş günü tam gün sayılır); tatil ve kapalı gün atlanır */
function ufGeriGun(cal, t, n) {
  let kal = n, x = t; let g = 0;
  while (kal > 1e-9 && g++ < 2000) { const d = Math.ceil(x / 24 - 1e-9) - 1; const pay = x / 24 - d; if (cal.isGunu(d)) { const al = Math.min(kal, pay); kal -= al; x -= al * 24; if (kal > 1e-9) x = d * 24; } else x = d * 24; }
  return x;
}
/* bir ürün partisini terminden geriye zamanlar: [{o, m, g, a, b, h, fas}], bas = ilk adımın başı */
function ufGeri(D, cal, u, adet, due, kuyruk, tezOf, fsOf, gunH) {
  const adim = []; let t = due;
  for (const o of [...(u.rota || [])].reverse()) {
    const ts = (o.tezgahlar || []).filter(x => tezOf[x.id]);
    if (o.fason || !ts.length) { const f = fsOf[o.fason]; const gun = f ? (+f.sureGun || 0) + 7 / Math.max(1, (f.cikisGunleri || []).length) / 2 : 2;
      const a = t - gun * 24; adim.push({ o, fas: o.fason || '?', a, b: t, h: 0 }); t = ufGeriGun(cal, a, kuyruk); continue; }
    const en = ts.reduce((b, x) => { const s = (+x.cevrim || 0) / (+tezOf[x.id].verim || 1); return !b || s < b.s ? { s, x } : b; }, null);
    const h = ((+en.x.ayar || 0) + adet * (+en.x.cevrim || 0)) / 60 / (+tezOf[en.x.id].verim || 1);
    const a = ufGeriGun(cal, t, h / Math.max(1, gunH[en.x.id] || 8));
    adim.push({ o, m: en.x.id, g: tezOf[en.x.id].grup || en.x.id, a, b: t, h }); t = ufGeriGun(cal, a, kuyruk);
  }
  adim.reverse();
  return { bas: adim.length ? adim[0].a : due, adim };
}
/* ürün ve ay başına öngörü: Yıllık plan ayarından; sipariş tüketir */
function ufOngoru(D, aylar, now, gec) {
  const A = ylAyar(); const out = [];
  const sip = D.siparisler.map(s => ({ s, t: parseT(D, s.termin) })).filter(x => x.t != null);
  if (A.tahmin !== 'elle' && !gec.hiz) return out;
  const hiz = gec.hiz || {};
  let aile = null, pay = null;
  if (A.tahmin === 'elle') { const v = ylVeri(); aile = v ? v.urunAile : {}; pay = {};
    for (const u of D.urunler) { const f = aile[u.id]; const q = D.siparisler.filter(s => s.urun === u.id).reduce((a, s) => a + (+s.adet || 0), 0); pay[u.id] = q; }
    const fTop = {}; for (const u of D.urunler) { const f = aile[u.id]; fTop[f] = (fTop[f] || 0) + pay[u.id]; }
    for (const u of D.urunler) { const f = aile[u.id]; const n = D.urunler.filter(x => aile[x.id] === f).length; pay[u.id] = fTop[f] > 0 ? pay[u.id] / fTop[f] : 1 / Math.max(1, n); } }
  for (const u of D.urunler) for (const ay of aylar) {
    let tah = 0; const gunAy = (ay.b - ay.a) / 24;
    if (A.tahmin === 'elle') { const m = ((A.elle || {})[aile[u.id]] || {})[ay.k]; if (m == null) continue; tah = m * pay[u.id] * ay.kesir; }
    else tah = (hiz[u.id] || 0) * gunAy / 7 * Math.pow(1 + (A.buyume || 0) / 100, ((ay.a + ay.b) / 2 - now) / 24 / 365);
    const fir = sip.filter(x => x.s.urun === u.id && x.t >= ay.a && x.t < ay.b).reduce((a, x) => a + (+x.s.adet || 0), 0);
    const net = Math.round(Math.max(0, tah - fir));
    if (net > 0) out.push({ urun: u.id, ay, tah, fir, net, due: ay.b - 7 });
  }
  return out;
}
function ufVeri() {
  const p = gosterilen(); if (!p || !p.ops) return null; const cx = cxAl(); if (!cx) return null;
  const anah = ufAnah(p); if (U.ufV && U.ufV.p === p && U.ufV.anah === anah) return U.ufV;
  const D = S.D, A = ufAyar(), now = cx.st.now; const cal = ufTakvim(D); const verim = (msSis().verim || 85) / 100;
  const tezOf = Object.fromEntries(D.tezgahlar.map(t => [t.id, t])); const fsOf = Object.fromEntries((D.fasoncular || []).map(f => [f.id, f]));
  const grupOf = id => (tezOf[id] || {}).grup || id;
  /* haftalar: bugünün haftasının pazartesisinden */
  const g0 = Math.floor(now / 24); const pzt = g0 - ((new Date(baseMs(D) + g0 * 864e5).getUTCDay() + 6) % 7);
  const H = []; for (let k = 0; k < A.hafta; k++) { const a = (pzt + 7 * k) * 24; H.push({ k, a, b: a + 168, ad: fmtDT(D, a).slice(0, 5), plan: a < HDAYS * 24 }); }
  const son = H[H.length - 1].b; const wOf = t => t < H[0].a ? 0 : Math.min(H.length - 1, Math.floor((t - H[0].a) / 168));
  /* kapasite: grup × hafta */
  const gunH = {}; const kap = {}; const gruplar = [...new Set(D.tezgahlar.map(t => t.grup || t.id))];
  for (const g of gruplar) kap[g] = H.map(() => 0);
  for (const m of D.tezgahlar) { let top = 0, n = 0;
    for (const w of H) { for (let d = w.a / 24; d < w.b / 24; d++) { if (d < g0) continue; const s = cal.tezSaat(m, d); kap[m.grup || m.id][w.k] += s * verim; if (s > 0) { top += s; n++; } } }
    gunH[m.id] = n ? top / n : 0; }
  /* yük kaydı: [a, b) aralığına h saat, haftalara takvim süresiyle */
  const yuk = []; const hucre = {}; for (const g of gruplar) hucre[g] = H.map(() => ({ plan: 0, kaba: 0, ongoru: 0 }));
  const ekle = (g, kat, a, b, h, ref) => { if (!(h > 0) || !hucre[g]) return; const aa = Math.max(a, H[0].a), bb = Math.min(b, son); if (bb <= aa) { if (a >= son) return; const w = wOf(aa); hucre[g][w][kat] += h; yuk.push({ g, kat, w0: w, w1: w, h, ...ref }); return; }
    const L = b - a; let w0 = null, w1 = null; for (let w = wOf(aa); w < H.length && H[w].a < bb; w++) { const o = Math.min(bb, H[w].b) - Math.max(aa, H[w].a); if (o <= 0) continue; hucre[g][w][kat] += h * o / Math.max(1e-9, L); if (w0 == null) w0 = w; w1 = w; }
    yuk.push({ g, kat, w0, w1, h: h * (bb - aa) / Math.max(1e-9, L), ...ref }); };
  /* 1. plan */
  const planli = new Set(); const ilk = {}; let fasN = 0;
  for (const r of Object.values(p.ops)) { if (!isFinite(r.S) || !isFinite(r.C)) continue; planli.add(r.job); if (r.done) continue; if (ilk[r.job] == null || r.S < ilk[r.job]) ilk[r.job] = r.S;
    if (r.C <= now) continue; const h0 = (+r.su || 0) + (+r.run || 0); let a = r.S, h = h0; if (a < now) { h = h0 * (r.C - now) / Math.max(1e-9, r.C - r.S); a = now; }
    if (String(r.m).startsWith('@')) { fasN++; continue; } ekle(grupOf(r.m), 'plan', a, r.C, h, { j: r.job, op: r.id }); }
  const failJ = new Set((p.fail || []).map(id => String(id).split('.')[0]).filter(j => planli.has(j)));
  /* 2. plan dışı: geriye zamanlama */
  const urunOf = Object.fromEntries(D.urunler.map(u => [u.id, u])); const kaba = [];
  for (const s of D.siparisler) { if (planli.has(s.id)) continue; const u = urunOf[s.urun]; const due = parseT(D, s.termin); if (!u || due == null) continue;
    let r = ufGeri(D, cal, u, +s.adet || 0, due, A.kuyruk, tezOf, fsOf, gunH); let gec = 0;
    if (r.bas < now) { const dt = now - r.bas; for (const x of r.adim) { x.a += dt; x.b += dt; } gec = r.adim.length ? r.adim[r.adim.length - 1].b - due : 0; r = { ...r, bas: now }; }
    kaba.push({ s, r, gec, havuz: !!s.havuz }); for (const x of r.adim) if (!x.fas) ekle(x.g, 'kaba', x.a, x.b, x.h, { j: s.id, adim: x.o.k, ad: x.o.ad }); }
  /* 3. öngörü */
  const aylar = []; { const d0 = new Date(baseMs(D) + H[0].a * 36e5); let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    for (let i = 0; i < 14; i++) { const a0 = (Date.UTC(y, m, 1) - baseMs(D)) / 36e5, b = (Date.UTC(y, m + 1, 1) - baseMs(D)) / 36e5; if (a0 >= son) break;
      const a = Math.max(a0, now); if (b > now) aylar.push({ k: `${y}-${String(m + 1).padStart(2, '0')}`, ad: `${OL_AY[m]} ${String(y).slice(2)}`, a0, a, b: Math.min(b, son), kesir: (Math.min(b, son) - a) / (b - a0) });
      m++; if (m > 11) { m = 0; y++; } } }
  const gec = talepHizi(D, now); const ong = U.ufOngoru ? ufOngoru(D, aylar, now, gec) : [];
  for (const o of ong) { const u = urunOf[o.urun]; let r = ufGeri(D, cal, u, o.net, Math.min(o.due, son - 1), A.kuyruk, tezOf, fsOf, gunH); if (r.bas < now) { const dt = now - r.bas; for (const x of r.adim) { x.a += dt; x.b += dt; } r = { ...r, bas: now }; }
    o.r = r; for (const x of r.adim) if (!x.fas) ekle(x.g, 'ongoru', x.a, x.b, x.h, { j: `Öngörü ${u.id} ${o.ay.ad}`, adim: x.o.k, ad: x.o.ad, ongoru: true }); }
  /* malzeme: ürün başına birim miktar en son siparişten (uygulamada rota bileşeninden) */
  const birimMal = {}; for (const s of D.siparisler) if ((s.malzeme || []).length) birimMal[s.urun] = s.malzeme;
  const olay = [];
  for (const s of D.siparisler) { const t = planli.has(s.id) ? ilk[s.id] : null; const kb = kaba.find(x => x.s.id === s.id); const need = t != null ? t : kb ? kb.r.bas : null; if (need == null || need >= son) continue;
    for (const r of s.malzeme || []) olay.push({ kod: r.kod, t: need, q: (+r.miktar || 0) * (+s.adet || 0), kat: t != null ? 'plan' : 'kaba', j: s.id }); }
  const malzemesiz = new Set();
  for (const o of ong) { const l = birimMal[o.urun]; if (!l) { malzemesiz.add(o.urun); continue; } if (o.r.bas >= son) continue; for (const r of l) olay.push({ kod: r.kod, t: o.r.bas, q: (+r.miktar || 0) * o.net, kat: 'ongoru', j: `Öngörü ${o.urun} ${o.ay.ad}` }); }
  const mal = ufMalzeme(D, olay, now, A.ongoruMalzeme, wOf, H, cal);
  /* özet */
  const sat = gruplar.map(g => ({ g, n: D.tezgahlar.filter(t => (t.grup || t.id) === g).length, w: H.map(w => { const c = hucre[g][w.k]; const k = kap[g][w.k]; const top = c.plan + c.kaba + c.ongoru; return { ...c, top, kap: k, o: k > 0 ? top / k : top > 0 ? Infinity : 0, oK: k > 0 ? (c.plan + c.kaba) / k : 0 }; }) }))
    .filter(x => x.w.some(c => c.kap > 0 || c.top > 0));
  U.ufV = { p, anah, gec, H, sat, yuk, kaba, ong, aylar, mal, now, fasN, failJ, malzemesiz, son };
  return U.ufV;
}
/* malzeme netleştirme: olaylar zaman sırasıyla; stok, açık sipariş (etkin geliş), öne çekme, yeni alım */
function ufMalzeme(D, olay, now, ongoruDahil, wOf, H, cal) {
  const isGunuOnce = t => { let d = Math.floor(t / 24); let g = 0; while (!cal.isGunu(d) && g++ < 30) d--; return d * 24 + 8; };
  const mats = Object.fromEntries((D.malzemeler || []).map(m => [m.kod, m])); const ted = Object.fromEntries((D.tedarikciler || []).map(t => [t.id, t]));
  const kodlar = [...new Set([...olay.map(o => o.kod), ...(D.satinalma || []).map(p => p.kod)])].filter(k => olay.some(o => o.kod === k));
  return kodlar.map(kod => { const m = mats[kod] || { kod, ad: kod, birim: '' }; const mu = (+m.muayeneGun || 0) * 24, td = (+m.tedarikGun || 0) * 24;
    const po = (D.satinalma || []).map((x, i) => ({ ...x, i })).filter(x => x.kod === kod).map(x => { const soz = parseT(D, x.gelis); const tt = ted[x.tedarikci]; return { i: x.i, ted: x.tedarikci, q: +x.miktar || 0, kalan: +x.miktar || 0, t: soz == null ? 1e9 : soz + (tt ? +tt.ortGecikmeGun || 0 : 0) * 24 + mu, soz }; }).sort((a, b) => a.t - b.t);
    let eld = +m.stok || 0; const yeni = [], one = []; const satir = H.map(() => ({ plan: 0, kaba: 0, ongoru: 0, gelen: 0, yeni: 0, talep: 0, son: null }));
    const l = olay.filter(o => o.kod === kod).sort((a, b) => a.t - b.t); let pi = 0;
    const gelenAl = t => { while (pi < po.length && po[pi].t <= t) { const x = po[pi++]; eld += x.kalan; if (x.kalan > 0) satir[wOf(Math.max(x.t, now))].gelen += x.kalan; x.kalan = 0; } };
    for (const o of l) { satir[wOf(o.t)][o.kat] += o.q; if (o.kat === 'ongoru' && !ongoruDahil) continue; gelenAl(o.t);
      let eks = o.q - eld; eld = Math.max(0, eld - o.q); if (eks <= 1e-9) continue;
      for (let k = pi; k < po.length && eks > 1e-9; k++) { const x = po[k]; if (x.kalan <= 1e-9) continue; const q = Math.min(x.kalan, eks); x.kalan -= q; eks -= q; one.push({ po: x.i, ted: x.ted, q, ihtiyac: o.t, geli: x.t, j: o.j }); satir[wOf(Math.max(o.t, now))].gelen += q; }
      if (eks > 1e-9) { const talep = isGunuOnce(o.t - mu - td); yeni.push({ q: eks, ihtiyac: o.t, talep, j: o.j, kat: o.kat }); satir[wOf(o.t)].yeni += eks; satir[wOf(Math.max(talep, now))].talep += eks; } }
    gelenAl(Infinity);
    /* hafta sonu eldeki: stok + gelen − tüketilen (öngörü ayara göre) */
    let e = +m.stok || 0; for (const s of satir) { e += s.gelen + s.yeni - s.plan - s.kaba - (ongoruDahil ? s.ongoru : 0); s.son = e; }
    const brut = k => l.filter(o => o.kat === k).reduce((a, o) => a + o.q, 0);
    const ilkTalep = yeni.length ? Math.min(...yeni.map(y => y.talep)) : null;
    return { kod, m, ad: m.ad || kod, birim: m.birim || '', stok: +m.stok || 0, yol: po.reduce((a, x) => a + x.q, 0), plan: brut('plan'), kaba: brut('kaba'), ongoru: brut('ongoru'), yeni, one, satir,
      yeniQ: yeni.reduce((a, y) => a + y.q, 0), ilkTalep, gec: ilkTalep != null && ilkTalep < Math.floor(now / 24) * 24, yakin: ilkTalep != null && ilkTalep >= now && ilkTalep < now + 7 * 24, fiyat: m.birimFiyat == null ? null : +m.birimFiyat };
  }).sort((a, b) => (a.ilkTalep ?? 1e12) - (b.ilkTalep ?? 1e12));
}

/* ---------- sayfa ---------- */
const ufMiktar = (q, b) => `${sayi(q, q < 10 ? 1 : 0)} ${esc(b || '')}`;
const ufTarih = t => esc(fmtDT(S.D, t).slice(0, 9));
function sUfuk() {
  const v = ufVeri(); if (!v) return kart(`${ic('chart', 'k')} Ufuk`, '<p class="pm-kucuk">Önce plan kurulmalı.</p>');
  const A = ufAyar(), Y = ylAyar(); const fg = agFiyatGorur(); const yaz = yetkili('plan.kilitle');
  const kaynak = v.p === S.plan ? 'Atölyedeki plan' : 'Önizlenen plan';
  const tab = `<div class="pm-seg" role="group" aria-label="Görünüm">${[['yuk', 'Yük', 'gauge'], ['malzeme', 'Malzeme', 'box']].map(([k, a, sm]) => `<button type="button" data-act="uf-gor" data-v="${k}" aria-pressed="${U.ufGor === k}">${ic(sm, 'k')} ${a}</button>`).join('')}</div>`;
  const hafta = `<div class="pm-seg" role="group" aria-label="Ufuk">${[[26, '26 hafta'], [52, '52 hafta']].map(([k, a]) => `<button type="button" data-act="uf-hafta" data-v="${k}" aria-pressed="${A.hafta === k}" ${yaz ? '' : 'disabled'}>${a}</button>`).join('')}</div>`;
  const ong = `<label class="pm-uf-anahtar"><input type="checkbox" data-chg="uf-ongoru" ${U.ufOngoru ? 'checked' : ''}> Öngörüyü göster</label>`;
  const lejl = `<ul class="pm-br-lejl">${UF_KAT.filter(([k]) => k !== 'ongoru' || U.ufOngoru).map(([k, ad, r]) => `<li><i style="background:${r}"></i><span>${ad}</span></li>`).join('')}<li><i class="pm-uf-lejl-kaba"></i><span>63. günden sonrası kaba</span></li></ul>`;
  const ust = `<div class="pm-mp-ust">${tab}${hafta}${ong}</div>`;
  const govde = U.ufGor === 'malzeme' ? ufMalzemeHtml(v, fg) : ufYukHtml(v, lejl);
  const notlar = [`Kaynak: ${kaynak}; ilk ${Math.round(HDAYS / 7)} hafta ondan, ötesi kaba.`,
    v.kaba.length ? `Planda olmayan ${v.kaba.length} sipariş (${v.kaba.filter(x => x.havuz).length} havuzda) terminden geriye zamanlandı.` : 'Bütün siparişler planda.',
    v.failJ.size ? `Planda adımı planlanamayan ${v.failJ.size} sipariş var; o adımlar yüke girmedi.` : '',
    v.fasN ? `Fason işlemler (${v.fasN}) tezgâh yükü değildir, sayılmadı.` : '',
    U.ufOngoru ? (Y.tahmin === 'elle' ? 'Öngörü: elle girilen aylık aile tahmini, ürüne sipariş payıyla bölündü; aynı ay ve üründeki sipariş tahmini tüketir. Ayarı Yıllık plan sayfasındadır.'
      : v.gec.hiz ? `Öngörü: kapanmış ve açık siparişlerin ${v.gec.dusuk ? `${sayi(v.gec.hafta, 0)} haftalık girişi, en az ${TALEP_GECMIS_ENAZ} haftaya bölündü (düşük güven, giriş geldikçe düzelir)` : `son ${sayi(v.gec.hafta, 0)} haftalık giriş hızı`}, yıllık büyüme %${sayi(Y.buyume || 0, 0)}; aynı ay ve üründeki sipariş tahmini tüketir. Termin ve plan hız sayılmaz. Ayarı Yıllık plan sayfasındadır.`
      : 'Öngörü yok: sipariş girişi yok. Termin ve plan hız sayılmaz. Yıllık plan sayfasında "Elle" seçip aylık tahmin girin.') : 'Öngörü gizli.',
  ].filter(Boolean).join(' ');
  const ayarK = kart(`${ic('gear', 'k')} Varsayımlar`, `<div class="pm-ym-alanlar"><label class="pm-ym-alan"><span>Adım başı bekleme, iş günü</span>${ymSayi('uf-kuyruk', A.kuyruk, 'Adım başı bekleme, iş günü', { adim: 0.5, max: 10, veri: yaz ? '' : 'disabled' })}</label>
    <div class="pm-ym-alan"><span>Öngörü malzeme talebine</span><div class="pm-seg" role="group" aria-label="Öngörü malzeme talebine">${[['false', 'Girmesin'], ['true', 'Girsin']].map(([k, a]) => `<button type="button" data-act="uf-ongmal" data-v="${k}" aria-pressed="${String(A.ongoruMalzeme) === k}" ${yaz ? '' : 'disabled'}>${a}</button>`).join('')}</div></div></div>
    <p class="pm-kucuk">Plan dışı sipariş ve öngörü partisi terminden geriye zamanlanır: her adım en hızlı tezgâhında, tezgâhın günlük açık saatine bölünerek; üstüne adım başı bekleme. Gerçekleşen akış süreleri gelince bu bekleme ölçümden alınacak. Kapasite vardiya takviminden, tatil düşülerek, × kullanılabilirlik %${msSis().verim || 85}; kişi sınırı ve arıza payı yok.</p>`,
    dugme('Yıllık plan', 'git', { simge: 'chart', kucuk: true, veri: 'data-v="yillik"' }));
  return `<div class="pm-ym-sayfa pm-uf">${kart(`${ic('route', 'k')} Ufuk`, `${ust}${govde}<p class="pm-kucuk">${notlar}</p>`, '', `<span class="pm-kucuk">${esc(v.H[0].ad)} – ${esc(fmtDT(S.D, v.son - 1).slice(0, 5))} · ${A.hafta} hafta · ${esc(kaynak)}</span>`)}${U.ufGor === 'yuk' ? ufSecimHtml(v) : ''}${ayarK}</div>`;
}
function ufYukHtml(v, lejl) {
  const on = U.ufOngoru; const asim = v.sat.reduce((a, s) => a + s.w.filter(c => c.o > 1.0001).length, 0);
  const enDolu = v.sat.map(s => { const w = s.w.reduce((b, c, i) => (c.o > b.o ? { o: c.o, i } : b), { o: -1, i: 0 }); return { g: s.g, ...w }; }).sort((a, b) => b.o - a.o)[0];
  const top = k => v.sat.reduce((a, s) => a + s.w.reduce((b, c) => b + c[k], 0), 0);
  const gec = v.kaba.filter(x => x.gec > 0.05);
  const kpi = ymKpi([
    ['gantt', 'Plan yükü', `${sayi(top('plan'), 0)} sa`, `ilk ${Math.round(HDAYS / 7)} hafta, motorun planı`],
    ['list', 'Plan dışı sipariş', `${sayi(top('kaba'), 0)} sa`, `${v.kaba.length} sipariş, kaba`],
    ...(on ? [ylAyar().tahmin !== 'elle' && !v.gec.hiz ? ['chart', 'Öngörü', 'giriş yok', 'sipariş girişi yok; Yıllık planda elle girilebilir', 'uyari'] : ylAyar().tahmin !== 'elle' && v.gec.dusuk ? ['chart', 'Öngörü', `${sayi(top('ongoru'), 0)} sa`, `düşük güven: ${sayi(v.gec.hafta, 0)} hafta giriş`, 'uyari'] : ['chart', 'Öngörü', `${sayi(top('ongoru'), 0)} sa`, `${v.ong.length} ürün-ay partisi`]] : []),
    ['alert', 'Kapasiteyi aşan', `${asim} hücre`, enDolu && enDolu.o > 0 ? `en dolu: ${esc(enDolu.g)} ${esc(v.H[enDolu.i].ad)} haftası %${sayi(enDolu.o * 100, 0)}` : 'yok', asim ? 'uyari' : 'tamam'],
    ['clock', 'Termine yetişmeyen', `${gec.length} sipariş`, gec.length ? 'plan dışı; bugün başlasa bile' : 'plan dışı siparişlerde yok', gec.length ? 'hata' : 'tamam'],
  ]);
  const sec = U.ufSec || {}; const sinir = v.H.findIndex(w => !w.plan);
  const bas = `<th scope="col">Grup</th>${v.H.map((w, i) => `<th scope="col" class="pm-num" ${w.plan ? '' : 'data-kaba'} ${i === sinir ? 'data-sinir' : ''} title="${esc(w.ad)} haftası${w.plan ? ', plan ufkunda' : ', kaba'}">${esc(w.ad)}</th>`).join('')}`;
  const sat = v.sat.map(s => `<tr><th scope="row"><b>${esc(s.g)}</b><small class="pm-ag-not">${s.n} tezgâh</small></th>${s.w.map((c, i) => {
    const o = c.o; const ton = !isFinite(o) || o > 1.0001 ? 'hata' : o > 0.85 ? 'uyari' : o > 0.6 ? 'dolu' : '';
    const pay = k => c.kap > 0 ? Math.min(100, c[k] / c.kap * 100) : 0; const bos = c.top < 0.05;
    const t = `${s.g}, ${v.H[i].ad} haftası: plan ${sayi(c.plan, 0)} sa, plan dışı ${sayi(c.kaba, 0)} sa${on ? `, öngörü ${sayi(c.ongoru, 0)} sa` : ''}; kapasite ${sayi(c.kap, 0)} sa`;
    return `<td class="pm-num" ${i === sinir ? 'data-sinir' : ''}><button type="button" class="pm-uf-h" data-act="uf-sec" data-v="${esc(s.g)}|${i}" ${ton ? `data-ton="${ton}"` : ''} ${v.H[i].plan ? '' : 'data-kaba'} aria-pressed="${sec.g === s.g && sec.w === i}" title="${esc(t)}" aria-label="${esc(t)}"><span>${bos ? '·' : isFinite(o) ? `%${sayi(o * 100, 0)}` : 'kapasite yok'}</span>${bos ? '' : `<i class="pm-uf-cubuk">${UF_KAT.filter(([k]) => k !== 'ongoru' || on).map(([k, , r]) => pay(k) > 0 ? `<i style="width:${pay(k).toFixed(1)}%;background:${r}"></i>` : '').join('')}</i>`}</button></td>`; }).join('')}</tr>`).join('');
  return `${kpi}<div class="tc-tablo-kap pm-uf-kap"><table class="tc-tablo pm-uf-isi"><thead><tr>${bas}</tr></thead><tbody>${sat}</tbody></table></div>${lejl}
    <p class="pm-kucuk">Hücre: haftanın yükü, kapasitenin %'si; alttaki çizgi katmanların payı. Taralı sütunlar motorun ufku dışıdır. Hücreye basınca o haftanın işleri aşağıda listelenir.</p>`;
}
function ufSecimHtml(v) {
  const s = U.ufSec; if (!s) return ''; const r = v.sat.find(x => x.g === s.g); if (!r || !r.w[s.w]) return ''; const c = r.w[s.w]; const w = v.H[s.w];
  const l = v.yuk.filter(y => y.g === s.g && y.w0 != null && y.w0 <= s.w && y.w1 >= s.w && (U.ufOngoru || y.kat !== 'ongoru'));
  const gr = {}; for (const y of l) { const k = y.kat + '|' + y.j; const x = gr[k] = gr[k] || { kat: y.kat, j: y.j, h: 0, adim: new Set() }; const pay = y.w1 > y.w0 ? 1 / (y.w1 - y.w0 + 1) : 1; x.h += y.h * pay; x.adim.add(y.op ? y.op.split('.').slice(1).join('.') : y.adim); }
  const satir = Object.values(gr).sort((a, b) => b.h - a.h).map(x => { const sp = S.D.siparisler.find(q => q.id === x.j);
    return `<tr>${td('Katman', `<span class="pm-uf-kat" style="--uf-r:${UF_KAT.find(k => k[0] === x.kat)[2]}"></span>${esc(UF_KAT_AD[x.kat])}`)}${td('İş', `<b class="mono">${esc(x.j)}</b>${sp ? ` <span class="pm-kucuk">${esc(urunAd(sp.urun))} · ${sp.adet} adet · termin ${esc(String(sp.termin || '—').slice(0, 10))}</span>` : ''}`)}${td('Adım', `<span class="mono">${[...x.adim].filter(Boolean).map(esc).join(', ')}</span>`)}${td('Saat', `${sayi(x.h, 1)} sa`, 'pm-num')}</tr>`; }).join('');
  const gec = v.kaba.filter(x => x.gec > 0.05 && x.r.adim.some(a => a.g === s.g));
  return kart(`${ic('list', 'k')} ${esc(s.g)} · ${esc(w.ad)} haftası <span class="pm-kucuk">${w.plan ? 'plan ufkunda' : 'kaba'} · yük ${sayi(c.top, 0)} sa / kapasite ${sayi(c.kap, 0)} sa</span>`,
    `${satir ? `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Katman</th><th>İş</th><th>Adım</th><th class="pm-num">Saat</th></tr></thead><tbody>${satir}</tbody></table></div>` : '<p class="pm-kucuk">Bu hafta bu grupta iş yok.</p>'}
    ${gec.length ? `<p class="pm-ag-uyari">${ic('alert', 'k')} Termine yetişmeyen plan dışı sipariş: ${gec.map(x => `<b class="mono">${esc(x.s.id)}</b> (${sayi(x.gec / 24, 1)} gün)`).join(', ')}.</p>` : ''}`,
    dugme('', 'uf-sec', { simge: 'x', kucuk: true, hayalet: true, ad: 'Kapat', veri: 'data-v=""' }));
}
function ufMalzemeHtml(v, fg) {
  const A = ufAyar(); const M = v.mal; const gec = M.filter(m => m.gec), yakin = M.filter(m => m.yakin);
  const tl = l => l.some(m => m.fiyat == null && m.yeniQ > 0) ? null : l.reduce((a, m) => a + (m.fiyat || 0) * m.yeniQ, 0);
  const one = M.reduce((a, m) => a + m.one.length, 0);
  const kpi = ymKpi([
    ['box', 'Malzeme', `${M.length} kalem`, 'ufuktaki siparişlerin ve öngörünün'],
    ['cart', 'Yeni alım', fg ? agTL(tl(M)) : `${M.filter(m => m.yeniQ > 0).length} kalem`, A.ongoruMalzeme ? 'öngörü dahil' : 'yalnız siparişler; öngörü dahil değil', 'uyari'],
    ['truck', 'Öne çekilecek açık sipariş', `${one}`, 'söz tarihi ihtiyaçtan sonra'],
    ['alert', 'Talep tarihi geçmiş', `${gec.length} kalem`, gec.length ? 'tedarik süresi yetmiyor' : 'yok', gec.length ? 'hata' : 'tamam'],
    ['clock', 'Bu hafta talep', `${yakin.length} kalem`, 'en geç talep 7 gün içinde', yakin.length ? 'uyari' : 'tamam'],
  ]);
  const ac = U.ufMal;
  const sat = M.map(m => { const dur = m.gec ? rozet('gecikti', 'hata') : m.yakin ? rozet('bu hafta', 'uyari') : m.yeniQ > 0 ? rozet('ileride', '') : rozet('yeterli', 'tamam');
    return `<tr ${m.gec ? 'data-ton="hata"' : ''}>${td('Malzeme', `<button type="button" class="pm-uf-mal" data-act="uf-mal" data-v="${esc(m.kod)}" aria-expanded="${ac === m.kod}">${ic(ac === m.kod ? 'down' : 'chev-right', 'k')}<b class="mono">${esc(m.kod)}</b></button><small class="pm-ag-not">${esc(m.ad)}</small>`)}
      ${td('Plan', ufMiktar(m.plan, m.birim), 'pm-num')}${td('Plan dışı', ufMiktar(m.kaba, m.birim), 'pm-num')}${U.ufOngoru ? td('Öngörü', `<span class="pm-uf-ong">${ufMiktar(m.ongoru, m.birim)}</span>`, 'pm-num') : ''}
      ${td('Eldeki', ufMiktar(m.stok, m.birim), 'pm-num')}${td('Yoldaki', ufMiktar(m.yol, m.birim), 'pm-num')}${td('Yeni alım', `<b>${ufMiktar(m.yeniQ, m.birim)}</b>${fg && m.yeniQ > 0 ? `<br><small>${m.fiyat == null ? '<span data-ton="uyari">fiyat yok</span>' : esc(agTL(m.fiyat * m.yeniQ))}</small>` : ''}`, 'pm-num')}
      ${td('En geç talep', m.ilkTalep == null ? '<span class="pm-kucuk">—</span>' : `<span class="mono">${ufTarih(m.ilkTalep)}</span>`)}${td('Durum', dur)}</tr>${ac === m.kod ? `<tr class="pm-uf-ac"><td colspan="${U.ufOngoru ? 9 : 8}">${ufMalAyrinti(v, m, fg)}</td></tr>` : ''}`; }).join('');
  return `${kpi}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Malzeme</th><th class="pm-num">Plan</th><th class="pm-num">Plan dışı</th>${U.ufOngoru ? '<th class="pm-num">Öngörü</th>' : ''}<th class="pm-num">Eldeki</th><th class="pm-num">Yoldaki</th><th class="pm-num">Yeni alım</th><th>En geç talep</th><th>Durum</th></tr></thead><tbody>${sat || `<tr><td colspan="9" class="pm-kucuk">Ufukta malzeme ihtiyacı yok.</td></tr>`}</tbody></table></div>
    <p class="pm-kucuk">İhtiyaç ilk adımın başındadır. Eldeki ve yoldaki zaman sırasıyla düşülür; yoldaki, söz tarihi + tedarikçinin ortalama gecikmesi + muayeneyle gelir. Yetmezse önce sonra gelecek açık sipariş öne çekilir, kalanı yeni alımdır. En geç talep = ihtiyaç − muayene − tedarik süresi. ${A.ongoruMalzeme ? 'Öngörü talebe girer.' : 'Öngörü yalnız görünür, talebe girmez (Varsayımlar).'}${v.malzemesiz.size ? ` Malzemesi bilinmeyen öngörü: ${[...v.malzemesiz].map(esc).join(', ')}.` : ''} Talep satın alma modülünde açılır; bağlamada bu satırdan.</p>`;
}
function ufMalAyrinti(v, m, fg) {
  const on = U.ufOngoru; const A = ufAyar();
  const kol = v.H.filter((w, i) => { const s = m.satir[i]; return s.plan || s.kaba || (on && s.ongoru) || s.gelen || s.yeni || s.talep; });
  const sat = (ad, f, cls = '', sifir = false) => `<tr ${cls}><th scope="row">${ad}</th>${kol.map(w => { const x = f(m.satir[w.k]); return `<td class="pm-num">${x == null || (!sifir && Math.abs(x) < 1e-6) ? '<span class="pm-mp-bos">·</span>' : sayi(x, x < 10 && x > -10 ? 1 : 0)}</td>`; }).join('')}</tr>`;
  const tablo = kol.length ? `<div class="tc-tablo-kap pm-uf-kap"><table class="tc-tablo pm-uf-mrp"><thead><tr><th scope="col">${esc(m.birim)}</th>${kol.map(w => `<th scope="col" class="pm-num" ${w.plan ? '' : 'data-kaba'}>${esc(w.ad)}</th>`).join('')}</tr></thead><tbody>
    ${sat('İhtiyaç, plan', s => s.plan)}${sat('İhtiyaç, plan dışı', s => s.kaba)}${on ? sat(`Öngörü${A.ongoruMalzeme ? '' : ' (talebe girmez)'}`, s => s.ongoru, 'class="pm-uf-ong"') : ''}${sat('Gelecek açık sipariş', s => s.gelen)}${sat('Yeni alım, ihtiyaç haftası', s => s.yeni)}${sat('Talep, en geç haftası', s => s.talep, 'data-ton="uyari"')}${sat('Hafta sonu eldeki', s => Math.abs(s.son) < 1e-6 ? 0 : s.son, '', true)}</tbody></table></div>` : '';
  const one = m.one.length ? `<p class="pm-kucuk">${ic('truck', 'k')} Öne çekilecek: ${m.one.map(o => `açık sipariş #${o.po + 1} (${esc((S.D.tedarikciler.find(t => t.id === o.ted) || {}).ad || o.ted || '—')}) ${ufMiktar(o.q, m.birim)}, gelişi ${ufTarih(o.geli)}, gereken ${ufTarih(o.ihtiyac)}`).join('; ')}.</p>` : '';
  const yeni = m.yeni.length ? `<ul class="pm-ms-veri">${m.yeni.slice(0, 12).map(y => `<li><span><b class="mono">${esc(y.j)}</b> <small>${esc(UF_KAT_AD[y.kat])}</small> · ihtiyaç ${ufTarih(y.ihtiyac)}</span><span>${ufMiktar(y.q, m.birim)} · talep en geç <b class="mono" ${y.talep < Math.floor(v.now / 24) * 24 ? 'data-ton="hata"' : ''}>${ufTarih(y.talep)}</b></span></li>`).join('')}${m.yeni.length > 12 ? `<li class="pm-kucuk">ve ${m.yeni.length - 12} satır daha</li>` : ''}</ul>` : '<p class="pm-kucuk">Yeni alım gerekmiyor.</p>';
  return `${tablo}${one}${yeni}<p class="pm-kucuk">Tedarik ${sayi(+m.m.tedarikGun || 0, 1)} gün, muayene ${sayi(+m.m.muayeneGun || 0, 1)} gün${fg && m.fiyat != null ? `, birim fiyat ${esc(agTL(m.fiyat))}` : ''}.</p>`;
}
{ const i = YAN.findIndex(x => x[0] === 'yillik'); YAN.splice(i < 0 ? YAN.length : i + 1, 0, ['ufuk', 'Ufuk', 'route']); YAN_ID.add('ufuk'); SAYFA_AD.ufuk = 'Ufuk'; EKRAN_OF.ufuk = 'plan'; YM_GORUNUM.ufuk = sUfuk; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'uf-gor') { U.ufGor = v; render(); return true; }
  if (act === 'uf-sec') { if (!v) U.ufSec = null; else { const [g, w] = v.split('|'); U.ufSec = U.ufSec && U.ufSec.g === g && U.ufSec.w === +w ? null : { g, w: +w }; } render(); return true; }
  if (act === 'uf-mal') { U.ufMal = U.ufMal === v ? null : v; render(); return true; }
  if (act === 'uf-hafta') { const A = ufAyar(); const n = +v; if (A.hafta === n) return true; degistir('Ufuk ayarı', `hafta: ${A.hafta} → ${n}`, () => { A.hafta = n; }, 'plan.kilitle', { planKoru: true }); U.ufSec = null; return true; }
  if (act === 'uf-ongmal') { const A = ufAyar(); const b = v === 'true'; if (A.ongoruMalzeme === b) return true; degistir('Ufuk ayarı', `öngörü malzeme talebine: ${b ? 'girsin' : 'girmesin'}`, () => { A.ongoruMalzeme = b; }, 'plan.kilitle', { planKoru: true }); return true; }
  return te0(act, v, el, e); }; }
document.addEventListener('change', e => {
  const el = e.target; const c = el.dataset && el.dataset.chg; if (!c || !c.startsWith('uf-')) return;
  e.stopImmediatePropagation();
  if (c === 'uf-ongoru') { U.ufOngoru = el.checked; U.ufV = null; render(); return; }
  if (c === 'uf-kuyruk') { const A = ufAyar(); const v = +el.value; if (el.value === '' || !isFinite(v) || v < 0 || v > 10) { bildir('0 ile 10 arasında bir sayı girin.', 'hata'); render(); return; }
    if (A.kuyruk === v) return; degistir('Ufuk ayarı', `adım başı bekleme: ${A.kuyruk} → ${v} iş günü`, () => { A.kuyruk = v; }, 'plan.kilitle', { planKoru: true }); }
}, true);
