/* ---------- Gün, hafta, ay, yıl her çizelgede ve grafikte (kullanıcı 19.10 17:50) ----------
   Tek ayar U.olcek kalır; burada ona uymayan görünümler bağlanır:
   - Zaman çizelgesi (Siparişler merceği ve Zaman sayfası): ölçek saat başına piksel olur; ayda gün başlığı, yılda ay başlığı ve hafta çizgisi.
     Plan ufku 63 gündür; yıl görünümü bütün planı tek ekrana sığdırır, ufkun ötesi Yıllık plan sayfasının işidir.
   - Matris: sütun seçili kırılımdır (gün, hafta, ay, yıl); günde eski 7/14 gün seçimi kalır.
   - Odak tahtası: pencere gün sayısı ölçekten gelir (1, 7, 30, 364), elle seçilen gün sayısı önceliklidir.
   - Sevkiyat: kendi dönem düğmesi aynı ayarı yazar; sayfalar arası geçişte ölçek tutarlı kalır.
   - Özet ve Keşfet ısı tablosu: günde tek sütun yerine üçer saatlik sekiz sütun. */
const OL_PX = { gun: 40, hafta: 10, ay: 2.5, yil: 0.6 };
const olPx = () => OL_PX[U.olcek] || 10;
const olSegHtml = () => `<div class="pm-seg" role="group" aria-label="Ölçek (V)">${OLCEK.map(([k, n]) => `<button type="button" data-act="ol-sec" data-v="${k}" aria-pressed="${U.olcek === k}">${n}</button>`).join('')}</div>`;
const ESKI_OLCEK_RE = /<div class="pm-seg" role="group" aria-label="Ölçek">[\s\S]*?<\/div>/;
{ const za0 = zamanAraclari; zamanAraclari = function () { return za0.apply(this, arguments).replace(ESKI_OLCEK_RE, ''); }; }
{ const ma0 = masaAraclari; masaAraclari = function () { return ma0.apply(this, arguments).replace(ESKI_OLCEK_RE, olSegHtml()); }; }

{ const g0 = gantt; gantt = function (p) {
  U.zoom = olPx(); const px = U.zoom; let h = g0.apply(this, arguments);
  if (px >= 1) return h;
  /* yılda günlük başlık okunmaz: ay adları ve hafta başı çizgileri */
  const D = S.D; const ops = Object.values(p.ops);
  const Cmax = Math.max(p.ozet.Cmax || 24, ...ops.map(r => r.C).filter(isFinite));
  const gunN = Math.min(HDAYS, Math.ceil(Cmax / 24) + 1);
  let bas = '', ay0 = null;
  const ayBas = []; for (let d = 0; d <= gunN; d++) { const g = fmtDT(D, d * 24); const ay = g.slice(3, 5); if (ay !== ay0) { ayBas.push([d, +ay]); ay0 = ay; } }
  ayBas.forEach(([d, ay], i) => { const s = i + 1 < ayBas.length ? ayBas[i + 1][0] : gunN; if (s > d) bas += `<div class="pm-g-gun" style="left:${d * 24 * px}px;width:${(s - d) * 24 * px}px">${esc(OL_AY[ay - 1])}</div>`; });
  const pzt = new Set(); for (let d = 0; d < gunN; d++) if (fmtDT(D, d * 24).slice(6, 9).startsWith('Pzt')) pzt.add(String(d * 24 * px));
  h = h.replace(/(<div class="pm-g-zaman" style="width:[^"]*">)[\s\S]*?<\/div><\/div>/, `$1${bas}</div>`);
  return h.replace(/<i class="pm-g-gunc" style="left:([\d.]+)px"><\/i>/g, (m, l) => pzt.has(l) ? m : '');
}; }
/* dönem okları çizelgeyi seçili dönemin başına kaydırır */
let olGanttAnah = null;
{ const r0 = render; render = function () {
  const r = r0.apply(this, arguments);
  const g = document.querySelector('.pm-gantt'); const an = olAnah();
  if (g && olGanttAnah !== an) { olGanttAnah = an; if (U.olKay) { try { g.scrollLeft = Math.max(0, olAralik().a * U.zoom - 40); } catch (e) { /* plan yok */ } } }
  return r; }; }

/* ---------- Matris: sütun kırılımı ---------- */
function mtKovalar(d0, gunSon) {
  if (U.olcek === 'gun') { const n = U.mGun || 7; return Array.from({ length: n }, (_, i) => ({ a: d0 + i, b: d0 + i + 1 })); }
  const l = []; let k = mpKova((d0 * 24) + 1);
  while (k < gunSon * 24 && l.length < 60) { const s = mpKovaSonraki(k); l.push({ a: Math.max(d0, Math.floor(k / 24)), b: Math.min(gunSon, Math.ceil(s / 24)), k, ad: mpKovaAd(k, false) }); k = s; }
  return l.filter(x => x.b > x.a);
}
{ const sm0 = sMatris; sMatris = function () {
  if (!S.plan || U.olcek === 'gun') return sm0.apply(this, arguments).replace('aria-label="Gün sayısı"', 'aria-label="Gün sayısı (günlük kırılım)"');
  const p = gosterilen(); const v = gunlukDagilim(p); if (!v) return sm0.apply(this, arguments);
  const kov = mtKovalar(v.d0, v.d0 + HDAYS);
  /* gün hücreleri kovaya toplanır; sMatris'in kendi çizimi aynen kullanılır: kova numarası gün numarası yerine geçer */
  const topla = o => { const r = {}; for (const [id, gl] of Object.entries(o)) { const y = {}; kov.forEach((kv, i) => { let h = null; for (let d = kv.a; d < kv.b; d++) { const x = gl[d]; if (!x) continue; h = h || { adet: 0, mesgul: 0, isler: [] }; h.adet += x.adet; h.mesgul += x.mesgul; h.isler.push(...x.isler); } if (h) y[v.d0 + i] = h; }); r[id] = y; } return r; };
  const v2 = { ...v, tez: topla(v.tez), kisi: topla(v.kisi), sip: topla(v.sip) };
  const cx = v.cx; const M0 = cx.M; const days0 = cx.days;
  /* kapasite ve kapalı gün de kovaya göre okunur */
  const Mk = {}; for (const [m, M] of Object.entries(M0)) Mk[m] = { ...M, rw: M.rw };
  const daysK = {}; kov.forEach((kv, i) => { let ac = false; for (let d = kv.a; d < kv.b; d++) if (((days0[d] || {}).vard || []).length) ac = true; daysK[v.d0 + i] = { vard: ac ? [1] : [] }; });
  const wi0 = workIn; const fmt0 = fmtDT; const gd0 = GUNLUK_ON.get(p); const mg0 = U.mGun;
  const kovaGun = d => kov[d - v.d0];
  try {
    GUNLUK_ON.set(p, v2); U.mGun = kov.length; cx.days = daysK;
    workIn = function (W, a, b) { const i = Math.round(a / 24); const kv = kovaGun(i); if (kv && Math.abs(b - a - 24) < 1e-6) return wi0(W, kv.a * 24, kv.b * 24); return wi0(W, a, b); };
    fmtDT = function (D, t) { const i = Math.round(t / 24); const kv = kovaGun(i); if (kv && Math.abs(t - i * 24) < 1e-6) { return (kv.ad + '        ').slice(0, 6) + '   '; } return fmt0(D, t); };
    let h = sm0.apply(this, arguments);
    h = h.replace(/<div class="pm-seg" role="tablist" aria-label="Gün sayısı">[\s\S]*?<\/div>/, `<span class="pm-kucuk">Kırılım: <b>${esc(MP_KIRILIM[U.olcek])}</b></span>`);
    h = h.replace(/o gün üretilen/g, 'o dönemde üretilen').replace(/o günkü çalışma/g, 'o dönemki çalışma').replace(/o gün biten/g, 'o dönemde biten');
    return h;
  } finally { workIn = wi0; fmtDT = fmt0; if (gd0) GUNLUK_ON.set(p, gd0); else GUNLUK_ON.delete(p); U.mGun = mg0; cx.days = days0; }
}; }

/* ---------- Odak tahtası ---------- */
const OL_GUN = { gun: 1, hafta: 7, ay: 30, yil: 364 };
{ const op0 = odPencere; odPencere = function () { if (U.odGun) return op0.apply(this, arguments); const g = OL_GUN[U.olcek] || 7; U.odGun = g; try { return op0.apply(this, arguments); } finally { U.odGun = null; } }; }

/* ---------- Sevkiyat aynı ayarı kullanır ---------- */
try { Object.defineProperty(U, 'svDonem', { get() { return U.olcek; }, set(v) { if (OLCEK.some(x => x[0] === v)) { U.olcek = v; U.olKay = 0; } }, configurable: true }); } catch (e) { /* U donmuşsa sevkiyat kendi ayarında kalır */ }

/* ---------- Özet ve Keşfet: günde üçer saat ---------- */
{ const bv0 = brVeri; brVeri = function () {
  const v = bv0.apply(this, arguments); if (!v || U.olcek !== 'gun' || !(ozAcik() || ksAcik()) || v.kova !== 1) return v;
  if (BR.vg && BR.vg.v === v) return BR.vg.w;
  const a = v.T0, n = 8, L = 3; const cx = v.cx;
  const yuk = v.yuk.map(y => { const W = cx.M && cx.M[y.m] && cx.M[y.m].rw; const acikS = (x, z) => z <= x ? 0 : (W ? workIn(W, x, z) : z - x);
    const g = Array.from({ length: n }, (_, d) => { const x = a + d * L, z = x + L; const acik = acikS(x, z); if (acik < 0.01) return null; let busy = 0; for (const r of v.ops) if (r.m === y.m) busy += acikS(Math.max(x, r.S), Math.min(z, r.C)); return busy / acik; });
    return { ...y, g }; });
  const gunAd = Array.from({ length: n }, (_, d) => String((d * L) % 24).padStart(2, '0') + ':00');
  const w = { ...v, gun: n, kova: L / 24, gunAd, yuk };
  BR.vg = { v, w }; return w;
}; }
for (const k of KB_KISAYOL[0][1]) if (k[0] === 'V') k[1] = 'Ölçek: gün, hafta, ay, yıl (çizelge, matris, odak, özet, sevkiyat, malzeme planı)';
