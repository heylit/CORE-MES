/* ---------- Hız: büyük veride Siparişler ve Maliyetler çizimi ----------
   Bu sayfalarda aynı aramalar sipariş başına yeniden yapılıyordu: her sipariş için planın bütün adımları taranıyor
   (katkı payı, başladı mı, sipariş maliyeti), malzeme ve tezgâh satırı dizide aranıyordu; 500 siparişte çizim saniyeleri buluyordu.
   Dizinler yalnız bir çizim (render) süresince yaşar ve çizim bitince atılır: çizim sırasında veri ve plan değişmez, ama çizimler arasında
   yerinde değişebilir (adım gerçekleşmesi, düzeltme). Çizim içinde taslak uygulanıp veri sürümü ya da plan değişirse dizinler baştan kurulur.
   Böylece çıktı eski hesapla birebir aynı kalır; çizim dışındaki çağrılar eski yoldan gider. */
let hzOn = null, hzDerin = 0;
const hzYeni = () => ({ dv: S && S.dataVer, p: S && S.plan, is: new WeakMap(), ilk: new WeakMap(), alt: new WeakMap() });
const hzAcik = () => { if (!hzOn) return false; if (hzOn.dv !== S.dataVer || hzOn.p !== S.plan) hzOn = hzYeni(); return true; };
{ const r0 = render; render = function () {
  if (!hzDerin) hzOn = hzYeni();
  hzDerin++; try { return r0.apply(this, arguments); } finally { hzDerin--; if (!hzDerin) hzOn = null; } }; }
/* planın adımları sipariş başına, Object.values sırasıyla: [anahtar, adım] */
function hzIs(ops) {
  let ix = hzOn.is.get(ops); if (ix) return ix;
  ix = new Map(); for (const k of Object.keys(ops)) { const r = ops[k]; let l = ix.get(r.job); if (!l) ix.set(r.job, l = []); l.push([k, r]); }
  hzOn.is.set(ops, ix); return ix;
}
/* dizide ilk eşleşen satır; find(x => anahtar(x) === v) ile aynı sonuç (NaN anahtar hiç eşleşmez) */
function hzIlk(arr, ad, f) {
  let m = hzOn.ilk.get(arr); if (!m) hzOn.ilk.set(arr, m = {});
  let z = m[ad]; if (z && z.n === arr.length) return z.map;
  const map = new Map(); for (const x of arr) { const k = f(x); if (k === k && !map.has(k)) map.set(k, x); }
  m[ad] = { n: arr.length, map }; return map;
}
const hzBasladi = (ix, j) => (ix.get(j) || []).some(([, r]) => r.act || r.done || (S.gercek && S.gercek[r.id]));

{ const ak0 = agKatki; agKatki = function (s, D = S.D) {
  if (!hzAcik()) return ak0(s, D);
  if (s.gelir == null || !S || !S.plan) return null;
  let t = 0; const A = D.ayarlar || {};
  const mz = D.malzemeler ? hzIlk(D.malzemeler, 'kod', x => x.kod) : null;
  for (const r of (s.malzeme || [])) { const m = mz ? mz.get(r.kod) : undefined; if (!m || m.birimFiyat == null) return null; t += m.birimFiyat * r.miktar * s.adet; }
  const ops = hzIs(S.plan.ops).get(s.id); if (!ops || !ops.length) return null;
  for (const [, r] of ops) {
    if (r.fas) { const f = D.fasoncular ? hzIlk(D.fasoncular, 'fas', x => '@' + x.id).get(r.m) : undefined; if (!f || f.fiyat == null) return null; t += f.fiyat * s.adet; continue; }
    const m = hzIlk(D.tezgahlar, 'id', x => x.id).get(r.m); if (!m || m.ucret == null) return null;
    t += r.run * m.ucret + r.su * (m.ucret + (+A.ayarciUcret || 0));
  }
  return +s.gelir - t;
}; }

{ const eb0 = ebAdaylar; ebAdaylar = function () {
  if (!hzAcik()) return eb0(); if (!S.plan) return [];
  const ix = hzIs(S.plan.ops);
  return S.D.siparisler.filter(s => !s.havuz && s.adet >= 2 && ix.has(s.id) && !hzBasladi(ix, s.id))
    .sort((a, b) => ((S.plan.J[b.id] || {}).T || 0) - ((S.plan.J[a.id] || {}).T || 0) || a.id.localeCompare(b.id, 'tr'));
}; }

{ const or0 = orAdaylar; orAdaylar = function () {
  if (!hzAcik()) return or0(); if (!S.plan) return [];
  const A = orAcik(); const ix = hzIs(S.plan.ops); const ur = hzIlk(S.D.urunler, 'id', z => z.id);
  return S.D.siparisler.filter(s => !s.havuz && !s.ortus && !A[s.id] && !A[s.id.split('/')[0]] && !hzBasladi(ix, s.id) && (S.plan.J[s.id] || {}).T > 0.05).filter(s => {
    const u = ur.get(s.urun); return u && u.rota.some((o, i) => i && o.ortusebilir && rtTur(u, i) === 'b'); })
    .map(s => ({ s, w: S.plan.J[s.id].T * (PW[s.oncelik] || 1) })).sort((a, b) => b.w - a.w).slice(0, 6).map(x => x.s);
}; }

/* sipariş maliyeti yalnız o siparişin adımlarına bakar: plana o siparişin adımlarını aynı sırayla taşıyan bir görünüm verilir */
function hzAlt(p, j) {
  let m = hzOn.alt.get(p); if (!m) hzOn.alt.set(p, m = new Map());
  let q = m.get(j); if (q) return q;
  const ops = {}; for (const [k, r] of hzIs(p.ops).get(j) || []) ops[k] = r;
  q = { ...p, ops }; m.set(j, q); return q;
}
{ const sm0 = ymSipMaliyet; ymSipMaliyet = function (s, p, cx, W, MP) {
  if (p && p.ops && s && hzAcik()) return sm0.call(this, s, hzAlt(p, s.id), cx, W, MP);
  return sm0.apply(this, arguments);
}; }
