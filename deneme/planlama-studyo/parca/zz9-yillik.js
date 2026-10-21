/* ---------- Yıllık plan (HiGHS, toplu üretim planı) ----------
   Motorun ufku 63 gündür; bu sayfa bir yıla bakar. Ayrıntı yerine aile ve tezgâh grubu düzeyinde çalışır:
   - Dönem: önce 13 hafta haftalık, sonra bir yıla kadar aylık.
   - Aile rotadan çıkar: ürünün en çok süre tutan adımının ayar ailesi. Birim saat, aile ürünlerinin talep ağırlıklı ortalamasıdır.
   - Talep: açık siparişler termin dönemine konur; tahmin ya "geçmiş" (sipariş defterinin haftalık hızı, büyüme oranıyla) ya da elle girilir.
     Dönem talebi = max(sipariş, tahmin): sipariş tahmini tüketir, üstüne eklenmez.
   - Karar: dönem üretimi, stok, birikmiş sipariş (geç teslim), grup başına ek mesai, istenirse tezgâh yatırımı (grup başına en çok bir, en erken 3. aydan).
   - Amaç: stok taşıma + geç teslim + ek mesai primi + yatırımın aylık bedeli. Malzeme, fason ve ayar sırası yok sayılır; bir dönemin üretimi
     bütün gruplardan aynı dönemde geçer. Bu yüzden sonuç kaba kapasite planıdır, sıra değildir.
   - Gölge fiyat: yatırım kararı sabitlenip doğrusal model yeniden çözülür; her grup ve dönemde çok pahalı "acil kapasite" sütunu vardır,
     sütunun indirgenmiş maliyetinden bir saat ek kapasitenin değeri okunur (değer = bedel − indirgenmiş maliyet).
   - Hedef: motor ufkundaki haftalar için ailenin kümülatif üretim hedefi motora küçük bedelle verilebilir (eksik adet × bedel TL toplamına eklenir).
   Kurallar: TL yalnız müdür ve yönetici görür; ayarları plan.kilitle yetkisi değiştirir. Uydurma veride geçmiş sipariş yok; "geçmiş" tahmini
   eldeki sipariş defterinin hızıdır (VARSAYIM, uygulamada kapanmış siparişlerden okunmalı). */
const YL_ACIL = 1e5;
const YL_GUN = 364;
function ylAyar(D = S.D) {
  return (D.yillik = D.yillik || { tahmin: 'gecmis', buyume: 10, elle: {}, mesaiMaks: 15, gecTL: 0.43, stokTL: 3.9, yatirim: true, teslimAy: 3, hedef: null });
}
/* dönemler: gün cinsinden [a, b) */
function ylDonemler() {
  const l = []; for (let w = 0; w < 13; w++) l.push({ a: w * 7, b: w * 7 + 7, tur: 'hafta' });
  let a = 91; while (a < YL_GUN) { const d = new Date(baseMs(S.D) + a * 864e5); const son = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - baseMs(S.D)) / 864e5); const b = Math.min(YL_GUN, son); if (b - a >= 7 || !l.length) l.push({ a, b, tur: 'ay' }); else l[l.length - 1].b = b; a = b; }
  for (const p of l) { const d = new Date(baseMs(S.D) + p.a * 864e5); p.ad = p.tur === 'hafta' ? `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}` : `${OL_AY[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; p.uzun = p.tur === 'hafta' ? `${p.ad} haftası` : `${OL_AY[d.getUTCMonth()]} ${d.getUTCFullYear()}${p.b - p.a < 25 ? ` (${p.b - p.a} gün)` : ''}`; }
  return l;
}
/* ürün → aile, aile birim saatleri, haftalık hız */
function ylVeri() {
  const D = S.D; const cx = cxAl(); if (!cx) return null; const A = ylAyar();
  const grupOf = {}; for (const t of D.tezgahlar) grupOf[t.id] = t.grup || t.id;
  const urunAile = {}, urunSaat = {};
  for (const u of D.urunler) { const say = {}, h = {};
    for (const o of u.rota || []) { const ts = (o.tezgahlar || []).filter(t => grupOf[t.id]); if (!ts.length) continue;
      const en = ts.reduce((a, t) => { const m = D.tezgahlar.find(x => x.id === t.id) || {}; const s = (+t.cevrim || 0) / 60 / (+m.verim || 1); return !a || s < a.s ? { s, t, g: grupOf[t.id] } : a; }, null);
      h[en.g] = (h[en.g] || 0) + en.s; h[en.g + '|ayar'] = (h[en.g + '|ayar'] || 0) + (+en.t.ayar || 0) / 60;
      if (o.aile) say[o.aile] = (say[o.aile] || 0) + en.s; }
    const b = Object.entries(say).sort((x, y) => y[1] - x[1])[0]; urunAile[u.id] = b ? b[0] : u.id; urunSaat[u.id] = h; }
  const now = cx.st.now / 24;
  const sip = D.siparisler.map(s => ({ s, t: (parseT(D, s.termin) ?? cx.st.now) / 24 }));
  const ilk = Math.min(now, ...sip.map(x => (parseT(D, x.s.serbest) ?? cx.st.now) / 24)); const son = Math.max(now + 14, ...sip.map(x => x.t));
  const haftalik = {}, deger = {}, adetTop = {};
  for (const { s } of sip) { const f = urunAile[s.urun]; if (!f) continue; haftalik[f] = (haftalik[f] || 0) + s.adet / ((son - ilk) / 7); if (s.gelir != null && s.adet) { deger[f] = (deger[f] || 0) + s.gelir; adetTop[f] = (adetTop[f] || 0) + s.adet; } }
  const aileler = [...new Set(Object.values(urunAile))].filter(f => D.siparisler.some(s => urunAile[s.urun] === f) || (A.elle[f] && Object.values(A.elle[f]).some(x => x > 0)));
  const birimDeger = {}; const ort = Object.values(deger).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(adetTop).reduce((a, b) => a + b, 0));
  for (const f of aileler) birimDeger[f] = adetTop[f] ? deger[f] / adetTop[f] : ort || 1000;
  /* aile birim saati: aile ürünlerinin sipariş adedi ağırlıklı ortalaması; ayar ortalama parti adedine bölünür */
  const saat = {}; const gruplar = new Set();
  for (const f of aileler) { const us = D.urunler.filter(u => urunAile[u.id] === f); let w = 0; const h = {};
    for (const u of us) { const sp = D.siparisler.filter(s => s.urun === u.id); const q = sp.reduce((a, s) => a + s.adet, 0) || 1; const parti = sp.length ? q / sp.length : 20;
      for (const [k, v] of Object.entries(urunSaat[u.id])) { if (k.endsWith('|ayar')) continue; const g = k; gruplar.add(g); h[g] = (h[g] || 0) + q * (v + (urunSaat[u.id][g + '|ayar'] || 0) / parti); } w += q; }
    saat[f] = Object.fromEntries(Object.entries(h).map(([g, v]) => [g, v / w])); }
  /* grup kapasitesi: motor ufkundaki açık saatlerin haftalık ortalaması × kullanılabilirlik */
  const verim = (msSis().verim || 85) / 100; const kapH = {}, tezH = {}, tezN = {};
  for (const m in cx.M) { const g = grupOf[m]; if (!g) continue; const M = cx.M[m]; const h = M.rw ? workIn(M.rw, 0, HDAYS * 24) / (HDAYS / 7) : 0; kapH[g] = (kapH[g] || 0) + h * verim; tezH[g] = (tezH[g] || 0) + h * verim; tezN[g] = (tezN[g] || 0) + 1; }
  const yeniH = Object.fromEntries(Object.keys(tezH).map(g => [g, tezH[g] / tezN[g]]));
  /* personel sınırı: grubun kişi saati ÷ ortalama operatör oranı; birden çok gruptaki kişi saatini eşit böler. Tezgâh mı kişi mi dar, ayrı gösterilir */
  const vSaat = {}; for (const x of D.vardiyalar || []) { const [a1, a2] = String(x.bas).split(':').map(Number), [b1, b2] = String(x.bit).split(':').map(Number); let h = (b1 + b2 / 60) - (a1 + a2 / 60); if (h <= 0) h += 24; vSaat[x.id] = h; }
  const gunN = v => Object.values(D.calismaGunleri || {}).filter(l => (l || []).includes(v)).length;
  const kisiH = {}; for (const p of D.personel || []) { const gs = (p.gruplar || []).filter(g => kapH[g] > 0); if (!gs.length) continue; const h = (vSaat[p.vardiya] || 8) * gunN(p.vardiya); for (const g of gs) kisiH[g] = (kisiH[g] || 0) + h / gs.length; }
  const opOr = g => { const tz = D.tezgahlar.filter(t => t.grup === g); return tz.length ? tz.reduce((a, t) => a + (t.opOran ?? 1), 0) / tz.length : 1; };
  const tezKap = { ...kapH }; const sinir = {};
  for (const g in kapH) { if (kisiH[g] == null) { sinir[g] = 'tezgah'; continue; } const k = kisiH[g] / opOr(g); if (k < kapH[g]) { kapH[g] = k; sinir[g] = 'kisi'; } else sinir[g] = 'tezgah'; }
  return { urunAile, aileler, saat, gruplar: [...gruplar].filter(g => kapH[g] > 0), kapH, tezKap, kisiH, sinir, yeniH, haftalik, birimDeger, sip, now };
}
function ylTalep(v, P) {
  const A = ylAyar(); const fir = {}, tah = {};
  for (const f of v.aileler) { fir[f] = P.map(() => 0); tah[f] = P.map(() => 0); }
  for (const { s, t } of v.sip) { const f = v.urunAile[s.urun]; if (!fir[f]) continue; const i = Math.max(0, P.findIndex(p => t < p.b)); if (i >= 0 && t < P[P.length - 1].b) fir[f][i] += s.adet; }
  P.forEach((p, i) => { const d = new Date(baseMs(S.D) + p.a * 864e5); const ay = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const f of v.aileler) {
      if (A.tahmin === 'elle') { const m = (A.elle[f] || {})[ay]; if (m != null) { const gun = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); tah[f][i] = m * (p.b - p.a) / gun; } }
      else tah[f][i] = (v.haftalik[f] || 0) * (p.b - p.a) / 7 * Math.pow(1 + (A.buyume || 0) / 100, ((p.a + p.b) / 2) / 365); } });
  const d = {}; for (const f of v.aileler) d[f] = P.map((_, i) => Math.max(fir[f][i], tah[f][i]));
  return { fir, tah, d };
}
function ylMesaiSaatTL(g) { const m = mesSis(); const s = msGrupSaat(g); const tz = S.D.tezgahlar.filter(t => t.grup === g); const op = tz.length ? tz.reduce((a, t) => a + (t.opOran ?? 1), 0) / tz.length : 1; return s == null ? null : s * op * (m.carp.hi || 1.5) + (m.kisiEk || 0) / 8 * op; }
function ylYatirimTL(g) { const M = msSis(); const tz = S.D.tezgahlar.filter(t => t.grup === g); if (!tz.length) return null;
  const am = tz.reduce((a, t) => { const z = M.tez[t.id] || {}; return a + (z.bedel > 0 && z.omur > 0 ? z.bedel * (1 - (z.hurda || 0) / 100) / z.omur / 12 : 0); }, 0) / tz.length;
  const op = tz.reduce((a, t) => a + (t.opOran ?? 1), 0) / tz.length; const s = msGrupSaat(g); const m = mesSis();
  return am + (s == null ? 0 : s * m.aylikSaat * op * 2); }
/* LP yazımı: CPLEX LP biçimi; adlar yalnız harf, rakam ve alt çizgi */
function ylModel(v, P, T, o) {
  const A = ylAyar(); const F = v.aileler, G = v.gruplar; const fi = f => 'f' + F.indexOf(f), gi = g => 'g' + G.indexOf(g);
  const obj = [], R = [], bnd = [], bin = [];
  const ter = (c, x) => c ? `${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(6)} ${x}` : '';
  P.forEach((p, t) => { const gun = p.b - p.a; const son = t === P.length - 1;
    for (const f of F) { const bd = v.birimDeger[f];
      obj.push(ter(bd * A.stokTL / 100 * gun / 30, `I_${fi(f)}_${t}`), ter(bd * A.gecTL / 100 * gun * (son ? 4 : 1), `B_${fi(f)}_${t}`));
      R.push(`d_${fi(f)}_${t}: x_${fi(f)}_${t} - I_${fi(f)}_${t} + B_${fi(f)}_${t}${t ? ` + I_${fi(f)}_${t - 1} - B_${fi(f)}_${t - 1}` : ''} = ${T.d[f][t].toFixed(4)}`); }
    for (const g of G) { const kap = v.kapH[g] * gun / 7; const mt = ylMesaiSaatTL(g) ?? 1500;
      obj.push(ter(mt, `o_${gi(g)}_${t}`), ter(YL_ACIL, `e_${gi(g)}_${t}`)); bnd.push(` 0 <= o_${gi(g)}_${t} <= ${(kap * A.mesaiMaks / 100).toFixed(3)}`);
      const yuk = F.map(f => (v.saat[f][g] || 0) > 0 ? ter(v.saat[f][g], `x_${fi(f)}_${t}`) : '').filter(Boolean).join(' ');
      const yat = o.yat ? P.slice(0, t + 1).map((q, s) => o.yatAday(g, s) ? ter(-(v.yeniH[g] * gun / 7), `y_${gi(g)}_${s}`) : '').filter(Boolean).join(' ') : '';
      R.push(`k_${gi(g)}_${t}: ${yuk || '0 x_' + fi(F[0]) + '_' + t} - o_${gi(g)}_${t} - e_${gi(g)}_${t} ${yat} <= ${kap.toFixed(3)}`); } });
  if (o.yat) for (const g of G) { const l = P.map((p, s) => o.yatAday(g, s) ? s : null).filter(s => s != null); if (!l.length) continue; const ay = ylYatirimTL(g) || 0;
    for (const s of l) { const ayS = (YL_GUN - P[s].a) / 30.4; obj.push(ter(ay * ayS, `y_${gi(g)}_${s}`)); if (o.sabit) { const val = o.sabit[`y_${gi(g)}_${s}`] > 0.5 ? 1 : 0; bnd.push(` ${val} <= y_${gi(g)}_${s} <= ${val}`); } else { bnd.push(` 0 <= y_${gi(g)}_${s} <= 1`); bin.push(`y_${gi(g)}_${s}`); } }
    R.push(`tek_${gi(g)}: ${l.map(s => `+ y_${gi(g)}_${s}`).join(' ')} <= 1`); }
  const lp = 'Minimize\n obj: ' + obj.filter(Boolean).join(' ') + '\nSubject To\n ' + R.join('\n ') + '\nBounds\n' + bnd.join('\n') + '\n' + (bin.length ? 'Binary\n ' + bin.join(' ') + '\n' : '') + 'End\n';
  const want = []; P.forEach((p, t) => { for (const f of F) want.push(`x_${fi(f)}_${t}`, `I_${fi(f)}_${t}`, `B_${fi(f)}_${t}`); for (const g of G) want.push(`o_${gi(g)}_${t}`, `e_${gi(g)}_${t}`); });
  if (o.yat) for (const g of G) P.forEach((p, s) => { if (o.yatAday(g, s)) want.push(`y_${gi(g)}_${s}`); });
  return { lp, want, fi, gi };
}
async function ylCoz() {
  const v = ylVeri(); if (!v) { bildir('Önce veri derlenmeli.', 'hata'); return; }
  const A = ylAyar(); const P = ylDonemler(); const T = ylTalep(v, P);
  if (!v.aileler.length || !v.gruplar.length) { bildir('Yıllık plan için sipariş ya da tahmin gerekiyor.', 'hata'); return; }
  const anah = ylAnah(); U.yl = { durum: 'hesap', anah, adim: 'Model kuruluyor' }; render();
  const yatAday = (g, s) => A.yatirim && P[s].tur === 'ay' && P[s].a >= (A.teslimAy || 3) * 30.4 && ylYatirimTL(g) != null;
  const t0 = performance.now();
  try {
    const yaz = m => { if (U.yl && U.yl.anah === anah) { U.yl.adim = m; render(); } };
    yaz('Yatırımsız plan çözülüyor');
    const m0 = ylModel(v, P, T, { yat: false }); const r0 = await hsCoz(m0.lp, 30, m0.want);
    let r1 = r0, m1 = m0;
    if (A.yatirim) { yaz('Yatırım adaylarıyla çözülüyor'); m1 = ylModel(v, P, T, { yat: true, yatAday }); r1 = await hsCoz(m1.lp, 60, m1.want); }
    yaz('Gölge fiyatlar hesaplanıyor');
    const m2 = A.yatirim ? ylModel(v, P, T, { yat: true, yatAday, sabit: r1.val }) : m0; const r2 = A.yatirim ? await hsCoz(m2.lp, 30, m2.want) : r0;
    if (U.yl && U.yl.anah !== anah) return;
    U.yl = { durum: 'bitti', anah, v, P, T, r0, r1, r2, m: m1, sn: (performance.now() - t0) / 1000, sonuc: ylSonuc(v, P, T, r1, r2, m1, r0) };
  } catch (e) { U.yl = { durum: 'hata', anah, hata: String(e.message || e) }; }
  render();
}
function ylSonuc(v, P, T, r, rd, m, r0) {
  const val = n => Math.max(0, (r.val || {})[n] || 0);
  const F = v.aileler, G = v.gruplar; const aile = {}, grup = {}, yat = [];
  for (const f of F) aile[f] = P.map((p, t) => ({ d: T.d[f][t], fir: T.fir[f][t], tah: T.tah[f][t], x: val(`x_${m.fi(f)}_${t}`), I: val(`I_${m.fi(f)}_${t}`), B: val(`B_${m.fi(f)}_${t}`) }));
  for (const g of G) grup[g] = P.map((p, t) => { const kap = v.kapH[g] * (p.b - p.a) / 7; let ek = 0; for (const [n, x] of Object.entries(r.val || {})) { const mm = n.match(/^y_g(\d+)_(\d+)$/); if (mm && G[+mm[1]] === g && +mm[2] <= t && x > 0.5) ek += v.yeniH[g] * (p.b - p.a) / 7; }
    const yuk = F.reduce((a, f) => a + (v.saat[f][g] || 0) * val(`x_${m.fi(f)}_${t}`), 0); const e = val(`e_${m.gi(g)}_${t}`);
    const rc = rd.dual ? rd.dual[`e_${m.gi(g)}_${t}`] : null; const golge = e > 1e-6 ? YL_ACIL : rc == null ? null : Math.max(0, YL_ACIL - rc);
    return { kap: kap + ek, ek, yuk, o: val(`o_${m.gi(g)}_${t}`), e, golge }; });
  for (const [n, x] of Object.entries(r.val || {})) { const mm = n.match(/^y_g(\d+)_(\d+)$/); if (mm && x > 0.5) yat.push({ g: G[+mm[1]], t: +mm[2], ay: ylYatirimTL(G[+mm[1]]) }); }
  return { aile, grup, yat, tl: r.ob, tl0: r0.ob, durum: r.s };
}
const ylAnah = () => [S.dataVer, JSON.stringify(ylAyar())].join('|');
/* ---------- hedef: motor ufkundaki haftalar ---------- */
function ylHedefKur() {
  const y = U.yl; if (!y || !y.sonuc) return null; const v = y.v; const H = [];
  /* hedef yalnız öne üretimdir: yıllık plan bir aileyi termininden önce stoğa üretiyorsa (stok > 0) o hafta sonuna kadar
     termini gelmiş siparişler + öne üretilen adet bitmiş olmalı. Öne üretim yoksa hedef termin ile aynıdır, motora ayrıca verilmez. */
  for (const f of v.aileler) { let fir = 0, enC = 0; const top = S.D.siparisler.filter(s => v.urunAile[s.urun] === f).reduce((a, s) => a + (+s.adet || 0), 0);
    y.P.forEach((p, t) => { if (p.tur !== 'hafta' || p.b > HDAYS) return; const x = y.sonuc.aile[f][t]; fir += x.fir; if (x.I > 0.5) { enC = Math.max(enC, Math.min(top, Math.round(fir + x.I))); H.push([f, p.b * 24 - 0.01, enC]); } }); }
  return { aile: v.urunAile, hedef: H };
}
/* Hedef motora sanal termin olarak girer: öne üretilecek siparişlerin tampon termini (dueB) hedef haftanın sonuna çekilir. Böylece kural
   (ATCS) onları öne alır, aşılırsa tampon ihlali bedeli işler (gecikme bedelinin %25'i, TL toplamında). Adet başına ceza denendi;
   arama gecikmeye bakan komşuluklarla çalıştığı için planı hiç değiştirmedi (t120: 5 ve 100 TL/adet aynı plan). */
function hedefUygula() {
  if (self.__yHedef) return; self.__yHedef = 1;
  const c0 = compile;
  compile = function (st) {
    const cx = c0.apply(this, arguments); const H = st && st.yHedef; if (!H || !cx || !cx.jobs) return cx;
    const aileler = {}; for (const [aile, t, k] of H.hedef) (aileler[aile] = aileler[aile] || []).push([t, k]);
    for (const aile in aileler) { const l = aileler[aile].sort((a, b) => a[0] - b[0]);
      const isler = Object.keys(H.isler).filter(j => H.isler[j][0] === aile && cx.jobs[j]).sort((a, b) => (cx.jobs[a].due ?? 1e9) - (cx.jobs[b].due ?? 1e9));
      let top = 0, i = 0;
      for (const j of isler) { top += H.isler[j][1]; while (i < l.length && l[i][1] < top - H.isler[j][1] + 1e-9) i++; if (i >= l.length) break;
        const jo = cx.jobs[j]; const t = l[i][0]; const d = jo.dueB == null ? jo.due : jo.dueB; if (d == null || t < d) { jo.dueB = t; jo.yHedef = t; } } }
    return cx;
  };
}
hedefUygula();
ISCI_EK.push(`${hedefUygula}\nhedefUygula();`);
{ const s0 = stOf; stOf = function () { const st = s0.apply(this, arguments); const A = ylAyar(); const h = A.hedef;
  if (h && h.hedef && h.hedef.length) { const isler = {}; for (const s of st.D.siparisler) { const f = h.aile[s.urun]; if (f) isler[s.id] = [f, +s.adet || 0]; } st.yHedef = { hedef: h.hedef, isler }; }
  return st; }; }
function ylPlanUretim(f, t, h0) { const p = S.plan; if (!p || !p.J) return null; const A = ylAyar(); const h = h0 || A.hedef || ylHedefKur(); if (!h) return null; let k = 0;
  for (const s of S.D.siparisler) { if (h.aile[s.urun] !== f) continue; const j = p.J[s.id]; if (j && j.C != null && j.C <= t) k += +s.adet || 0; } return k; }

/* ---------- sayfa ---------- */
const ylSayi = (k, v, ad, o = {}) => ymSayi('yl-' + k, v, ad, o);
function sYillik() {
  const A = ylAyar(); const fg = agFiyatGorur(); const yaz = yetkili('plan.kilitle'); const y = U.yl; const bayat = y && y.anah !== ylAnah();
  const dg = dugme(y && y.durum === 'bitti' && !bayat ? 'Yeniden çöz' : 'Yıllık planı çöz', 'yl-coz', { birincil: true, simge: 'cpu' });
  const seg = (k, l) => `<div class="pm-seg" role="group">${l.map(([v, n]) => `<button type="button" data-act="yl-sec" data-k="${k}" data-v="${v}" aria-pressed="${String(A[k]) === v}" ${yaz ? '' : 'disabled'}>${n}</button>`).join('')}</div>`;
  const al = (k, ad, o) => `<label class="pm-ym-alan"><span>${ad}</span>${ylSayi('ayar', A[k], ad, { ...o, veri: `data-k="${k}" ${yaz ? '' : 'disabled'}` })}</label>`;
  const ayarK = kart(`${ic('gear', 'k')} Varsayımlar`, `<div class="pm-sira"><span class="pm-kucuk">Talep tahmini</span>${seg('tahmin', [['gecmis', 'Geçmişten'], ['elle', 'Elle']])}<span class="pm-kucuk">Yatırım adayları</span>${seg('yatirim', [['true', 'Dene'], ['false', 'Deneme']])}</div>
    <div class="pm-ym-alanlar">${A.tahmin === 'gecmis' ? al('buyume', 'Yıllık büyüme %', { adim: 1, min: -50, max: 200 }) : ''}${al('mesaiMaks', 'Ek mesai sınırı, kapasitenin %', { adim: 1, max: 60 })}
      ${fg ? al('gecTL', 'Geç teslim bedeli, değerin %/gün', { adim: 0.01, max: 5 }) + al('stokTL', 'Stok taşıma, değerin %/ay', { adim: 0.1, max: 20 }) + al('teslimAy', 'Yeni tezgâhın en erken geliş ayı', { adim: 1, min: 1, max: 12 }) : ''}</div>
    <p class="pm-kucuk">Kaba kapasite planıdır: aile ve tezgâh grubu düzeyinde, sırasız; malzeme, fason ve ayar sırası yok. Kapasite tezgâhın motor ufkundaki açık saatlerinin haftalık ortalaması × kullanılabilirlik %${msSis().verim || 85}; gruptaki kişilerin vardiya saati ÷ operatör oranı daha azsa o. ${A.tahmin === 'gecmis' ? 'Geçmiş tahmini: uydurma veride kapanmış sipariş yok; eldeki sipariş defterinin haftalık hızı kullanıldı.' : 'Elle tahmin aşağıdaki tablodan, aylık adet.'} Bir dönemin talebi sipariş ile tahminin büyüğüdür.</p>`, dg);
  let govde = '';
  if (!y || bayat) govde = kart(`${ic('chart', 'k')} Yıllık plan`, `${bayat ? `<p class="pm-ag-uyari">${ic('alert', 'k')} Veri ya da varsayım değişti; yeniden çözülmeli.</p>` : ''}<p class="pm-kucuk">13 hafta haftalık, sonra bir yıla kadar aylık. HiGHS sayfanın içinde çözer.</p>`);
  else if (y.durum === 'hesap') govde = kart(`${ic('chart', 'k')} Yıllık plan`, `<p class="pm-kucuk" role="status">${ic('cpu', 'k')} ${esc(y.adim || 'Çözülüyor')}…</p>`);
  else if (y.durum === 'hata') govde = kart(`${ic('chart', 'k')} Yıllık plan`, `<p class="pm-ag-uyari">${ic('alert', 'k')} HiGHS çözemedi: ${esc(y.hata)}</p>`);
  else govde = ylSonucHtml(y, fg, yaz);
  const elle = A.tahmin === 'elle' ? ylElleKart(yaz) : '';
  return `<div class="pm-ym-sayfa pm-yl">${ayarK}${elle}${govde}</div>`;
}
function ylElleKart(yaz) {
  const v = ylVeri(); if (!v) return ''; const A = ylAyar(); const ay = []; const b = new Date(baseMs(S.D));
  for (let i = 0; i < 13; i++) { const d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + i, 1)); ay.push([`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, `${OL_AY[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`]); }
  const sat = v.aileler.map(f => `<tr>${td('Aile', `<b>${esc(f)}</b><small class="pm-ag-not">geçmiş hızı ${sayi((v.haftalik[f] || 0) * 4.33, 0)}/ay</small>`)}${ay.map(([k, ad]) => td(ad, ylSayi('elle', ((A.elle[f] || {})[k]) ?? '', `${f} ${ad} tahmini`, { adim: 1, max: 1e6, yer: sayi((v.haftalik[f] || 0) * 4.33, 0), veri: `data-f="${esc(f)}" data-ay="${k}" ${yaz ? '' : 'disabled'}` }), 'pm-num')).join('')}</tr>`).join('');
  return kart(`${ic('edit', 'k')} Elle tahmin <span class="pm-kucuk">aylık adet; boş ay tahminsiz sayılır</span>`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Aile</th>${ay.map(([, ad]) => `<th class="pm-num">${ad}</th>`).join('')}</tr></thead><tbody>${sat}</tbody></table></div>`, yaz ? dugme('Geçmiş hızını kopyala', 'yl-elle-kopya', { simge: 'download', kucuk: true }) : '');
}
function ylSonucHtml(y, fg, yaz) {
  const { v, P, sonuc: s } = y; const G = v.gruplar, F = v.aileler; const D = S.D;
  const topD = F.reduce((a, f) => a + s.aile[f].reduce((b, x) => b + x.d, 0), 0);
  const gecAdet = F.reduce((a, f) => a + s.aile[f].reduce((b, x) => b + x.B, 0), 0);
  const zamaninda = topD > 0 ? 1 - F.reduce((a, f) => a + s.aile[f].reduce((b, x, t) => b + Math.max(0, x.B - (t ? s.aile[f][t - 1].B : 0)), 0), 0) / topD : null;
  const mesai = G.reduce((a, g) => a + s.grup[g].reduce((b, x) => b + x.o, 0), 0); const acil = G.reduce((a, g) => a + s.grup[g].reduce((b, x) => b + x.e, 0), 0);
  const kpi = ymKpi([
    ['box', 'Yıllık talep', `${sayi(topD, 0)} adet`, `${F.length} aile, ${P.length} dönem`],
    ['check', 'Zamanında karşılanan', zamaninda == null ? '—' : `%${sayi(zamaninda * 100, 1)}`, 'dönem talebinin kendi döneminde üretilen payı', zamaninda != null && zamaninda < 0.95 ? 'uyari' : 'tamam'],
    ['clock', 'Ek mesai', `${sayi(mesai, 0)} sa`, `sınır kapasitenin %${ylAyar().mesaiMaks}'i`],
    ['alert', 'Kapasite açığı', `${sayi(acil, 0)} sa`, acil > 0.5 ? 'mesai ve yatırımla da karşılanmayan yük' : 'yok', acil > 0.5 ? 'hata' : 'tamam'],
    ...(fg ? [['lira', 'Plan bedeli', agTL(s.tl - acil * YL_ACIL), 'stok, geç teslim, mesai primi, yatırım']] : []),
  ]);
  /* yük ısı tablosu: satır grup, sütun dönem */
  const yukH = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo pm-yl-isi"><thead><tr><th>Grup</th>${P.map(p => `<th class="pm-num" title="${esc(p.uzun)}">${esc(p.ad)}</th>`).join('')}</tr></thead><tbody>${G.map(g => `<tr>${td('Grup', `<b>${esc(g)}</b>`)}${s.grup[g].map((x, t) => { const o = x.kap > 0 ? (x.yuk) / x.kap : 0;
    const ton = x.e > 0.5 ? 'hata' : o > 1.0001 ? 'uyari' : o > 0.85 ? 'dolu' : ''; return td(P[t].uzun, `<span class="pm-yl-h" ${ton ? `data-ton="${ton}"` : ''} title="${esc(`${P[t].uzun}: yük ${sayi(x.yuk, 0)} sa, kapasite ${sayi(x.kap, 0)} sa${x.o > 0.5 ? `, ek mesai ${sayi(x.o, 0)} sa` : ''}${x.golge != null && x.golge > 0.5 && fg ? `, 1 saat ek kapasitenin değeri ${agTL(x.golge)}` : ''}`)}">%${sayi(o * 100, 0)}</span>`, 'pm-num'); }).join('')}</tr>`).join('')}</tbody></table></div>`;
  const darbogaz = G.map(g => { const l = s.grup[g]; const enY = l.reduce((a, x, t) => x.kap > 0 && x.yuk / x.kap > a.o ? { o: x.yuk / x.kap, t } : a, { o: 0, t: 0 }); const gm = Math.max(0, ...l.map(x => x.golge || 0)); const gD = l.filter(x => (x.golge || 0) > 0.5).length;
    return { g, enY, gm, gD, o: l.reduce((a, x) => a + x.o, 0), ort: l.reduce((a, x) => a + x.yuk, 0) / Math.max(1, l.reduce((a, x) => a + x.kap, 0)) }; }).sort((a, b) => b.gm - a.gm || b.ort - a.ort);
  const dbH = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Grup</th><th class="pm-num">Ortalama yük</th><th>En yüklü dönem</th><th class="pm-num">Ek mesai</th>${fg ? '<th class="pm-num">1 saat ek kapasitenin değeri</th>' : ''}<th class="pm-num">Dar dönem</th></tr></thead><tbody>${darbogaz.map(x => `<tr ${x.gD ? 'data-ton="uyari"' : ''}>${td('Grup', `<b>${esc(x.g)}</b> <span class="pm-kucuk">${D.tezgahlar.filter(t => t.grup === x.g).length} tezgâh · ${v.sinir[x.g] === 'kisi' ? `kişi dar (${sayi(v.kapH[x.g], 0)} / ${sayi(v.tezKap[x.g], 0)} sa/hafta)` : `${sayi(v.kapH[x.g], 0)} sa/hafta`}</span>`)}${td('Ortalama yük', `%${sayi(x.ort * 100, 0)}`, 'pm-num')}${td('En yüklü dönem', `${esc(P[x.enY.t].uzun)} · %${sayi(x.enY.o * 100, 0)}`)}${td('Ek mesai', `${sayi(x.o, 0)} sa`, 'pm-num')}${fg ? td('1 saat ek kapasitenin değeri', x.gm >= YL_ACIL ? '<span data-ton="hata">kapasite yetmiyor</span>' : x.gm > 0.5 ? `<b class="mono">${esc(agTL(x.gm))}</b><small class="pm-ag-not">en yüksek dönem</small>` : '<span class="pm-kucuk">0</span>', 'pm-num') : ''}${td('Dar dönem', `${x.gD} / ${P.length}`, 'pm-num')}</tr>`).join('')}</tbody></table></div>
    <p class="pm-kucuk">"1 saat ek kapasitenin değeri" gölge fiyattır: o grupta o dönem bir saat daha olsaydı yıllık plan bedeli bu kadar düşerdi. Sıfırsa kapasite bağlayıcı değil; ek mesai primine eşitse plan mesaiyle kapatıyor; daha büyükse mesai sınırı da dolmuş. Dar dönem: gölge fiyatı sıfırdan büyük dönem sayısı.</p>`;
  const yatH = !ylAyar().yatirim ? '' : kart(`${ic('cpu', 'k')} Tezgâh yatırımı`, s.yat.length ? `<ul class="pm-ms-veri">${s.yat.map(x => `<li><span><b>${esc(x.g)}</b> grubuna bir tezgâh, ${esc(P[x.t].uzun)} başından</span>${fg ? `<b class="mono">${agTL(x.ay)}/ay</b>` : ''}</li>`).join('')}</ul>${fg ? `<p>Yatırımla yıllık plan bedeli <b>${agTL(s.tl0 - s.tl)}</b> düşüyor (yatırımsız ${agTL(s.tl0)}, yatırımlı ${agTL(s.tl)}; aylık bedel dahil).</p>` : ''}`
    : `<p>${ic('check', 'k')} Hiçbir grupta yatırım bedelini karşılayacak kadar kapasite açığı yok.</p>`) + '';
  const yatNot = ylAyar().yatirim ? `<p class="pm-kucuk">Aylık bedel: Genel gider sayfasındaki tezgâh bedeli, ömrü ve hurdasından amortisman + iki vardiya operatör maliyeti (grubun kişi saat maliyeti × aylık saat × operatör oranı × 2). Kapasite grubun ortalama tezgâhı kadar. En erken ${ylAyar().teslimAy}. aydan.</p>` : '';
  /* aile tablosu */
  const aileH = F.map(f => { const l = s.aile[f]; const birik = Math.max(...l.map(x => x.B)); const stok = Math.max(...l.map(x => x.I));
    return `<details class="pm-yl-aile"><summary><b>${esc(f)}</b> <span class="pm-kucuk">${esc(D.urunler.filter(u => v.urunAile[u.id] === f).map(u => u.id).join(', '))} · yıllık ${sayi(l.reduce((a, x) => a + x.d, 0), 0)} adet${birik > 0.5 ? ` · en çok ${sayi(birik, 0)} adet geride` : ''}${stok > 0.5 ? ` · en çok ${sayi(stok, 0)} adet önceden` : ''}</span></summary>
      <div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Dönem</th><th class="pm-num">Sipariş</th><th class="pm-num">Tahmin</th><th class="pm-num">Üretim</th><th class="pm-num">Stok</th><th class="pm-num">Geride</th></tr></thead><tbody>${l.map((x, t) => `<tr ${x.B > 0.5 ? 'data-ton="uyari"' : ''}>${td('Dönem', esc(P[t].uzun))}${td('Sipariş', sayi(x.fir, 0), 'pm-num')}${td('Tahmin', sayi(x.tah, 0), 'pm-num')}${td('Üretim', `<b>${sayi(x.x, 0)}</b>`, 'pm-num')}${td('Stok', sayi(x.I, 0), 'pm-num')}${td('Geride', sayi(x.B, 0), 'pm-num')}</tr>`).join('')}</tbody></table></div></details>`; }).join('');
  /* motor hedefi */
  const A = ylAyar(); const h = A.hedef || ylHedefKur(); const verildi = !!A.hedef;
  const hw = P.map((p, t) => ({ p, t })).filter(x => x.p.tur === 'hafta' && x.p.b <= HDAYS);
  const hedefSat = h ? F.map(f => { const hh = h.hedef.filter(x => x[0] === f); if (!hh.length) return ''; return `<tr>${td('Aile', `<b>${esc(f)}</b>`)}${hw.map(({ p }) => { const x = hh.find(q => Math.abs(q[1] - (p.b * 24 - 0.01)) < 0.1); if (!x) return td(p.uzun, '·', 'pm-num'); const yp = ylPlanUretim(f, x[1]); const eks = yp != null && yp < x[2];
    return td(p.uzun, `<span class="pm-mo-h"><b>${sayi(x[2], 0)}</b><small ${eks ? 'data-ton="uyari"' : ''}>plan ${yp == null ? '—' : sayi(yp, 0)}</small></span>`, 'pm-num'); }).join('')}</tr>`; }).join('') : '';
  const hedefK = kart(`${ic('target', 'k')} Motora haftalık hedef <span class="pm-kucuk">motor ufkundaki haftalar, kümülatif adet</span>`,
    `<p class="pm-kucuk">${verildi ? 'Hedef motorda: öne üretilecek siparişlerin tampon termini hedef haftanın sonuna çekildi. Kural onları öne alır; hedef aşılırsa tampon ihlali bedeli (gecikme bedelinin dörtte biri) işler, gerçek gecikme her zaman daha pahalıdır. Plan yeniden çözülünce etkisi görünür.' : 'Hedef henüz motorda değil. Hedef yalnız öne üretimdir: yıllık plan ileride kapasite yetmediği için bir aileyi termininden önce üretiyorsa, o hafta sonuna kadar termini gelenler ve öne üretilecek adet bitmiş olmalı. Verilince bu siparişlerin tampon termini hedef haftaya çekilir. Eldeki siparişlerle sınırlıdır.'}</p>
    ${hedefSat ? `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Aile</th>${hw.map(({ p }) => `<th class="pm-num">${esc(p.ad)}</th>`).join('')}</tr></thead><tbody>${hedefSat}</tbody></table></div>` : '<p class="pm-kucuk">Motor ufkunda öne üretim yok: siparişler terminlerine göre üretilebiliyor, motora ayrıca hedef gerekmiyor.</p>'}`,
    yaz ? (verildi ? dugme('Hedefi kaldır', 'yl-hedef', { simge: 'x', veri: 'data-v="0"' }) : dugme('Hedefi motora ver', 'yl-hedef', { simge: 'target', veri: 'data-v="1"', birincil: true })) : '');
  return kart(`${ic('chart', 'k')} Yıllık plan <span class="pm-kucuk">${esc(P[0].uzun)} – ${esc(P[P.length - 1].uzun)} · HiGHS ${sayi(y.sn, 1)} sn · ${esc(HS_DURUM[s.durum] || String(s.durum))}</span>`, `${kpi}<h3 class="pm-yl-alt">Grup yükü, kapasitenin %'si</h3>${yukH}<p class="pm-kucuk">Yük %100'ü geçiyorsa ek mesai ya da yeni tezgâhla karşılanıyor; kırmızı hücrede onlar da yetmiyor.</p>`)
    + kart(`${ic('gauge', 'k')} Darboğaz ve gölge fiyat`, dbH) + yatH.replace('</section>', `${yatNot}</section>`) + hedefK
    + kart(`${ic('layers', 'k')} Aileler <span class="pm-kucuk">aile rotadan: ürünün en çok süre tutan adımının ayar ailesi</span>`, aileH);
}
{ const i = YAN.findIndex(x => x[0] === 'denge'); YAN.splice(i < 0 ? YAN.length : i + 1, 0, ['yillik', 'Yıllık plan', 'chart']); YAN_ID.add('yillik'); SAYFA_AD.yillik = 'Yıllık plan'; EKRAN_OF.yillik = 'plan'; YM_GORUNUM.yillik = sYillik; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'yl-coz') { ylCoz(); return true; }
  if (act === 'yl-sec') { const k = el.dataset.k; const A = ylAyar(); const val = k === 'yatirim' ? v === 'true' : v; if (A[k] === val) return true;
    degistir('Yıllık plan ayarı', `${k}: ${v}`, () => { A[k] = val; }, 'plan.kilitle', { planKoru: true }); return true; }
  if (act === 'yl-elle-kopya') { const vv = ylVeri(); if (!vv) return true; const b = new Date(baseMs(S.D));
    degistir('Elle tahmin', 'geçmiş hızından kopyalandı', () => { const A = ylAyar(); for (const f of vv.aileler) { A.elle[f] = A.elle[f] || {}; for (let i = 0; i < 13; i++) { const d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + i, 1)); A.elle[f][`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`] = Math.round((vv.haftalik[f] || 0) * 4.33); } } }, 'plan.kilitle', { planKoru: true }); return true; }
  if (act === 'yl-hedef') { const A = ylAyar(); if (v === '1') { const h = ylHedefKur(); if (!h || !h.hedef.length) { bildir('Önce yıllık plan çözülmeli.', 'hata'); return true; }
      degistir('Yıllık hedef motora verildi', `${h.hedef.length} hafta-aile hedefi`, () => { A.hedef = h; }, 'plan.kilitle'); }
    else degistir('Yıllık hedef kaldırıldı', '', () => { A.hedef = null; }, 'plan.kilitle'); return true; }
  return te0(act, v, el, e); }; }
document.addEventListener('change', e => {
  const el = e.target; const c = el.dataset && el.dataset.chg; if (!c || !c.startsWith('yl-')) return;
  e.stopImmediatePropagation(); const A = ylAyar(); const v = el.value === '' ? null : +el.value;
  if (v != null && (!isFinite(v) || v < +(el.min || 0) || (el.max && v > +el.max))) { bildir('Geçerli bir sayı girin.', 'hata'); render(); return; }
  if (c === 'yl-ayar') { const k = el.dataset.k; if (v == null) { render(); return; } degistir('Yıllık plan ayarı', `${k}: ${A[k]} → ${v}`, () => { A[k] = v; }, 'plan.kilitle', { planKoru: true }); return; }
  if (c === 'yl-elle') { const f = el.dataset.f, ay = el.dataset.ay; degistir('Elle tahmin', `${f} ${ay}: ${v ?? 'boş'}`, () => { A.elle[f] = A.elle[f] || {}; if (v == null) delete A.elle[f][ay]; else A.elle[f][ay] = v; }, 'plan.kilitle', { planKoru: true }); }
}, true);
