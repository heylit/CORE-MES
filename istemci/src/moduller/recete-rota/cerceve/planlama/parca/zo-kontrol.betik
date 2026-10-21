/* ---------- Tahta kontrolleri, harita açıklaması, Çizelge ve Yapılacaklar ----------
   Yakınlık sınırlıdır: en uzak hâl bütün atölyenin biraz dışı, en yakın hâl bir tezgâhın okunur olduğu ölçüdür; tekerlek adımı sabittir.
   Özet'te tekerlek sayfayı kaydırır, harita yalnız Ctrl (ya da iki parmak) ile yakınlaşır; böylece sayfa kaydırılırken harita kaçmaz.
   Çizelge düğmesi eski plan masasının haftalık tezgâh çizelgesini açar; masanın ikinci menüsü yalnız çizelge sekmelerine iner.
   Sağ alttaki kayan 3B penceresinin yerini Yapılacaklar alır: sayıya basınca kararlar ve hazır olmayan emirler listelenir. */

/* ---- yakınlık ---- */
function atSigK() { if (!AT.cv || !AT.kam) return 0.4; const kam = AT.kam; atSigdir(AT.cv.clientWidth, AT.cv.clientHeight); const k = AT.kam.k; AT.kam = kam; return k; }
function atZumSinir() { const f = atSigK(); return [Math.max(0.12, f * 0.7), Math.max(1.6, f * 1.3)]; }
function atZumla(oran, sx, sy) {
  if (!AT.kam || !AT.cv) return; const [a, b] = atZumSinir();
  if (sx == null) { sx = AT.cv.clientWidth / 2; sy = AT.cv.clientHeight / 2; }
  const [wx, wy] = atDunya(sx, sy); AT.kam.k = Math.max(a, Math.min(b, AT.kam.k * oran)); const [nx, ny] = atDunya(sx, sy);
  AT.kam.x += wx - nx; AT.kam.y += wy - ny; atTetikle(); zumYaz();
}
function zumYaz() { const el = document.querySelector('.pm-oz-zum b'); if (el && AT.kam) el.textContent = '%' + Math.round(AT.kam.k / atSigK() * 100); }
let zumIpZ = null;
function zumIpucu() { const y = document.querySelector('.pm-oz-yer'); if (!y) return; y.setAttribute('data-ipucu', ''); clearTimeout(zumIpZ); zumIpZ = setTimeout(() => y.removeAttribute('data-ipucu'), 1400); }
document.addEventListener('wheel', e => {
  if (!U.tkTam || !AT.cv || e.target !== AT.cv) return;
  if (ozAcik() && !e.ctrlKey && !e.metaKey) { e.stopImmediatePropagation(); zumIpucu(); return; }
  e.preventDefault(); e.stopImmediatePropagation();
  let d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY; d = Math.max(-120, Math.min(120, d));
  const r = AT.cv.getBoundingClientRect(); atZumla(Math.exp(-d * 0.0018), e.clientX - r.left, e.clientY - r.top);
}, { capture: true, passive: false });

/* ---- harita açıklaması: çizgiler, hareket ve renkler ---- */
const AT_LEJANT = [
  ['yay', 'Çizgi', 'iş bir tezgâhtan sonrakine geçer; kalın çizgi daha çok iş'],
  ['akis', 'Akan noktalar', 'akışın yönü'],
  ['parca', 'Renkli top', 'iki adım arasında yolda olan parça, siparişin renginde; kırmızı halka geç sipariş'],
  ['fark', 'Sarı kesik', 'önceki plana göre değişen akış'],
  ['serit', 'Kartın üst şeridi', 'yeşil çalışıyor, gri boşta ya da fason, kırmızı arıza'],
  ['nabiz', 'Kırmızı parıltı', 'tezgâh bugün %97\'den çok dolu (darboğaz)'],
  ['gun', 'Yedi çubuk', 'haftanın günlerinde doluluk: yeşil, sarı %75 üstü, kırmızı %97 üstü; altı çizili gün bugün'],
  ['sira', 'SIRA', 'tezgâhta bekleyen işler, siparişin renginde']
];
function atLejant() { return `<ul class="pm-lj" aria-label="Haritanın açıklaması">${AT_LEJANT.map(([k, b, m]) => `<li><i class="pm-lj-i" data-lj="${k}" aria-hidden="true"></i><b>${esc(b)}</b><span>${esc(m)}</span></li>`).join('')}</ul>`; }
U.hlAcik = false;
const koKatEski = brKatman;
brKatman = function () {
  if (ozHarita() && !document.querySelector('.pm-od')) return `<div class="pm-br-katman" id="br-katman" data-lejant><div class="pm-hl" ${U.hlAcik ? 'data-acik' : ''}><button type="button" data-act="hl-ac" aria-expanded="${!!U.hlAcik}">${ic('help', 'k')}<span>Haritayı okuma</span>${ic('down', 'k')}</button>${U.hlAcik ? atLejant() : ''}</div></div>`;
  const h = koKatEski(); if (!h || !ozAcik()) return h;
  const zum = `<span class="pm-oz-zum" role="group" aria-label="Yakınlık">${dugme('', 'at-zoom', { kucuk: true, hayalet: true, simge: 'minus', ad: 'Uzaklaş', veri: 'data-v="-1"' })}<b class="mono" title="Bütün atölyeye göre yakınlık">%100</b>${dugme('', 'at-zoom', { kucuk: true, hayalet: true, simge: 'plus', ad: 'Yakınlaş', veri: 'data-v="1"' })}${dugme('', 'at-sigdir', { kucuk: true, hayalet: true, simge: 'fit', ad: 'Sığdır' })}</span>`;
  return h.replace('<small>tekerlekle ya da iki parmakla yakınlaşır; tezgâha dokun, seç</small>', `<small>Ctrl + tekerlek ya da iki parmakla yakınlaşır; tezgâha dokun, seç</small>${zum}`)
    .replace('<div class="pm-oz-yer"></div>', `<details class="pm-oz-lj"><summary>${ic('help', 'k')}Haritayı okuma: çizgiler, hareket ve renkler</summary>${atLejant()}</details><div class="pm-oz-yer"><span class="pm-oz-ipucu" aria-hidden="true">Yakınlaştırmak için Ctrl + tekerlek</span></div>`);
};

/* ---- Çizelge: eski masanın haftalık tezgâh çizelgesi; masanın kendi menüsü yalnız çizelge sekmelerine iner ---- */
for (let i = MERCEKLER.length - 1; i >= 0; i--) if (['tahta', '3b', 'ag'].includes(MERCEKLER[i][0])) MERCEKLER.splice(i, 1);
const MASA_AD = { gun: 'Tezgâhlar', zaman: 'Siparişler', kuyruk: 'Kuyruk', matris: 'Matris' };
for (const m of MERCEKLER) if (MASA_AD[m[0]]) m[1] = MASA_AD[m[0]];
function masaSecici() {
  const g = (v, ad, sm, act, basili, ip) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${basili}" title="${esc(ip)}">${ic(sm, 'k')}<span>${esc(ad)}</span></button>`;
  return `<div class="pm-sg pm-sg-masa" role="toolbar" aria-label="Görünüm"><div class="pm-sg-sec">${g('genel', 'Özet', 'expand', 'sg-don', false, 'Göstergeler, tezgâh haritası ve grafikler')}${g('atolye', 'Harita', 'fit', 'sg-don', false, 'Tezgâhlar ve aralarındaki iş akışı')}${g('', 'Çizelge', 'gantt', 'sg-cizelge', true, 'Tezgâh başına gün gün çizelge')}${g('kesif', 'Keşfet', 'eye', 'sg-don', false, 'Pay şeridi, sipariş hatları, hazırlık, planı anlat')}</div></div>`;
}
const koAracEski = tbAracCubugu;
tbAracCubugu = function (mk, p) { const h = koAracEski(mk, p); if (U.tkTam) return h; return h.replace('<div class="pm-tbk-arac" role="toolbar" aria-label="Plan araçları">', '<div class="pm-tbk-arac" role="toolbar" aria-label="Plan araçları">' + masaSecici()); };
/* tam görünümde masa arkada kalır; seçici yalnız Çizelge'de çizilir, böylece aynı düğme iki yerde olmaz */
const koSgEski = sgHtml;
sgHtml = function () { return koSgEski().replace('data-act="od-ac" data-v="auto"', 'data-act="sg-cizelge"').replace(/Çizelge: [^"]*"/, 'Çizelge: tezgâh başına gün gün çizelge; işleri sürükleyerek taşı"'); };
/* masa menüsünün "Menüleri göster" satırı kalkar: aynı yer artık Çizelge */
const koMenuEski = sgMenu;
sgMenu = function () { const h = koMenuEski(); return h && h.replace(/<button[^>]*data-act="tk-tam"[^>]*>[\s\S]*?<\/button>/, ''); };

/* ---- Yapılacaklar: kayan 3B penceresinin yerinde, sayıya basınca açılan liste ---- */
U.ypAcik = false;
fbYuzenKur = function () { document.querySelectorAll('.pm-fb-yuzen, .pm-fb-fab').forEach(x => x.remove()); };
function ypVeri() {
  const p = typeof gosterilen === 'function' ? gosterilen() : S.plan; if (!p) return null;
  const sor = sorunlar(p); const v = brVeri(); const now = rsSimdi();
  const hz = v ? v.sip.map(s => ({ s, d: hzDurum(s, now) })).filter(o => !o.d.kesin).sort((a, b) => a.s.S - b.s.S) : [];
  return { sor, hz, n: sor.filter(x => x.ton === 'hata').length + hz.filter(o => o.d.kalan < 48).length };
}
function ypHtml() {
  if (!S.plan || kim().rol === 'operator') return '';
  const d = ypVeri(); if (!d) return '';
  const fab = `<button type="button" class="pm-yp-fab" data-act="yp-ac" aria-expanded="${!!U.ypAcik}" ${d.n ? 'data-ton="hata"' : ''} title="Yapılacaklar: kararlar ve hazır olmayan emirler">${ic('check', 'k')}<span>Yapılacaklar</span><b class="mono">${d.n}</b></button>`;
  if (!U.ypAcik) return fab;
  const kar = d.sor.slice(0, 6).map(x => { const [ad, act, v] = (x.eylem || [])[0] || [];
    return `<li data-ton="${x.ton}">${ic(x.simge || 'alert', 'k')}<div><b>${x.html ? x.baslik : esc(x.baslik)}</b>${ad ? `<button type="button" class="pm-at-link" data-act="${esc(act)}" data-v="${esc(v || '')}">${esc(ad)}</button>` : ''}</div></li>`; }).join('');
  const hz = d.hz.slice(0, 5).map(o => `<li data-ton="${o.d.kalan < 48 ? 'hata' : 'uyari'}">${ic('check', 'k')}<div><b class="mono">${esc(o.s.id)}</b><small>${HZ_MADDE.filter(x => o.d.m[x[0]] === false).map(x => esc(x[1])).join(', ')}${o.d.kalan < 48 ? ' · 48 saatte başlıyor' : ''}</small></div></li>`).join('');
  return `<section class="pm-yp" role="dialog" aria-label="Yapılacaklar"><header><b>${ic('check', 'k')}Yapılacaklar</b>${dugme('', 'yp-ac', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat (Esc)' })}</header>
    ${kar ? `<small>Kararlar</small><ul>${kar}</ul>` : '<p>Karar bekleyen konu yok.</p>'}
    ${hz ? `<small>Hazır olmayan emirler <em>deneme verisi</em></small><ul>${hz}</ul><button type="button" class="pm-at-link" data-act="ks-hazir-ac">Hazırlık listesini aç</button>` : ''}</section>${fab}`;
}
function ypKur() {
  document.querySelectorAll('.pm-yp-kap').forEach(x => x.remove());
  const h = ypHtml(); if (!h) return;
  const k = document.createElement('div'); k.className = 'pm-yp-kap'; k.innerHTML = h; document.body.appendChild(k);
}
window.addEventListener('keydown', e => { if (e.key === 'Escape' && U.ypAcik) { U.ypAcik = false; ypKur(); e.stopImmediatePropagation(); } }, true);
document.addEventListener('pointerdown', e => { if (U.ypAcik && !(e.target.closest && e.target.closest('.pm-yp-kap'))) { U.ypAcik = false; ypKur(); } }, true);

/* ---- kabuğun ölçüsü: sol menü genişleyip daralınca tam görünümün sınırı da izler; arkadaki masa görünmez ---- */
const koRo = typeof ResizeObserver === 'function' ? new ResizeObserver(() => skAlan()) : null; let koIzlenen = null;

const koRenderEski = render;
render = function () {
  koRenderEski();
  ypKur();
  const ki = document.querySelector('.tc-kabuk-icerik'); if (koRo && ki && ki !== koIzlenen) { if (koIzlenen) koRo.unobserve(koIzlenen); koRo.observe(ki); koIzlenen = ki; }
  if (ozAcik()) requestAnimationFrame(zumYaz);
};
const koTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'at-zoom' && U.tkTam) { atZumla(+v > 0 ? 1.25 : 0.8); return true; }
  if (act === 'at-sigdir') { const r = koTekEski(act, v, el, e); zumYaz(); return r; }
  if (act === 'hl-ac') { U.hlAcik = !U.hlAcik; render(); return true; }
  if (act === 'sg-cizelge') { U.sgMenu = false; if (document.querySelector('.pm-od')) odKapat(); tkTamDegistir(false); mercekSec('gun'); return true; }
  if (act === 'sg-don') { U.sgGor = v; U.sdCikti = false; U.mercek = 'resim'; U.tbAg = false; U.agGun = null; tkTamDegistir(true); return true; }
  if (act === 'git' && v === 'tahta' && U.sayfa === 'tahta' && !U.tkTam) { U.sdCikti = false; U.mercek = 'resim'; tkTamDegistir(true); return true; }
  if (act === 'yp-ac') { U.ypAcik = !U.ypAcik; ypKur(); return true; }
  if (U.ypAcik && el && el.closest && el.closest('.pm-yp')) { U.ypAcik = false; }
  return koTekEski(act, v, el, e);
};
