/* ---------- Özet sabit ölçüde ----------
   Grafikler ve göstergeler yakınlaşan tahtanın üstünde ölçeklenmez: Özet'te gerçek boyda bir ızgarada durur, sayfa gibi kayar.
   Tezgâh haritası ızgaranın bir hücresidir; yalnız o hücre yakınlaşır ve kayar. Harita görünümünde bölgeler gizlenir, harita bütün alanı alır. */
const OZ = { boy: '' };
function ozAcik() { return !!U.tkTam && U.sayfa === 'tahta' && U.sgGor === 'genel' && !document.querySelector('.pm-od') && !U.odak; }
function ozHarita() { return !!U.tkTam && U.sayfa === 'tahta' && U.sgGor === 'atolye'; }
const ozKatEski = brKatman;
brKatman = function () {
  if (ozHarita()) return '';
  const h = ozKatEski(); if (!h || !ozAcik()) return h;
  return h.replace(/<\/div>\s*$/, '') + `<section class="pm-oz-harita" data-b="harita" aria-label="Tezgâh haritası"><header>${ic('cpu', 'k')}<b>Tezgâh haritası</b><small>tekerlekle ya da iki parmakla yakınlaşır; tezgâha dokun, seç</small>${dugme('Büyüt', 'sg-gor', { kucuk: true, hayalet: true, simge: 'fit', veri: 'data-v="atolye"' })}</header><div class="pm-oz-yer"></div></section></div>`;
};
/* sığdırma yalnız tezgâhları hesaba katar; bölgeler artık tahtanın içinde değil */
const ozKutuEski = tkAtolyeKutu;
tkAtolyeKutu = function () { return ozAcik() || ozHarita() ? brAtolyeEski() : ozKutuEski(); };
const ozKonEski = brKonumla;
brKonumla = function () { if (ozAcik()) { const kat = document.getElementById('br-katman'); if (kat) for (const el of kat.children) { el.style.transform = ''; el.removeAttribute('data-uzak'); el.style.height = ''; } return; } return ozKonEski(); };
const ozRenderEski = render;
render = function () {
  ozRenderEski();
  const at = document.getElementById('pm-at'); if (!at) return;
  const oz = ozAcik(); at.toggleAttribute('data-ozet', oz); at.toggleAttribute('data-harita', ozHarita());
  const yer = oz && at.querySelector('.pm-oz-yer'); const cv = document.getElementById('at-cv');
  if (yer && cv && cv.parentElement !== yer) yer.appendChild(cv);
  if (oz && cv) requestAnimationFrame(() => { const imza = cv.clientWidth + 'x' + cv.clientHeight; if (imza !== OZ.boy) { OZ.boy = imza; atSigdir(cv.clientWidth, cv.clientHeight); } atTetikle(); });
  else OZ.boy = '';
};
addEventListener('resize', () => { if (ozAcik()) { OZ.boy = ''; render(); } });
/* Özet ızgarasında tekerlek sayfayı kaydırır; yalnız harita hücresinde yakınlaştırır */
document.addEventListener('wheel', e => { if (!ozAcik()) return; const k = e.target.closest && e.target.closest('.pm-br-katman'); if (k && !e.target.closest('.pm-oz-yer')) e.stopImmediatePropagation(); }, true);
/* Özet hücresinde tuvalin üstünde çubuk ve oynatıcı yoktur; sığdırma bütün hücreyi kullanır. Tam görünümde yan panel tahtayı zaten daralttığı için ayrıca panel payı düşülmez. */
const ozSigEski = atSigdir;
atSigdir = function (W, H) {
  const oz = ozAcik(); if (!oz && !ozHarita()) return ozSigEski(W, H);
  /* Harita'da üstte görünüm seçici, altta oynatıcı durur; gerçek kaplamaları düşülür */
  let ust = 0, alt = 0;
  if (!oz) { const at = document.getElementById('pm-at').getBoundingClientRect(); const sg = document.querySelector('.pm-at > .pm-sg'); const oy = document.querySelector('.pm-at > .pm-at-alt');
    if (sg) ust = Math.max(0, sg.getBoundingClientRect().bottom - at.top); if (oy && oy.offsetHeight) alt = Math.max(0, at.bottom - oy.getBoundingClientRect().top); if (alt > H / 2) alt = 0; }
  const s = atSahne(); if (!s || !s.bolge || !s.bolge.length || !W || !H) return;
  const x0 = Math.min(...s.bolge.map(b => b.x)) - 10, x1 = Math.max(...s.bolge.map(b => b.x + b.w)) + 10, y0 = Math.min(...s.bolge.map(b => b.y)) - 6, y1 = Math.max(...s.bolge.map(b => b.y + b.h)) + 6;
  const k = Math.max(0.15, Math.min(1.5, Math.min((W - 24) / (x1 - x0), (H - ust - alt - 24) / (y1 - y0))));
  AT.kam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (ust - alt) / 2 / k, k };
};
const ozPanelEski = atPanelW;
atPanelW = function () { return U.tkTam ? 0 : ozPanelEski(); };
/* kartlar artık yan panelde durur; Özet ve Harita'da sığdırma yalnız tezgâhlara bakar */
const ozHepsiEski = tkSigdirHepsi;
tkSigdirHepsi = function () { if ((ozAcik() || ozHarita()) && AT.cv) { atSigdir(AT.cv.clientWidth, AT.cv.clientHeight); atTetikle(); return; } return ozHepsiEski(); };
const ozTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'at-sigdir' && (ozAcik() || ozHarita()) && AT.cv) { atSigdir(AT.cv.clientWidth, AT.cv.clientHeight); atTetikle(); return true; }
  const r = ozTekEski(act, v, el, e);
  if (act === 'sg-gor' && v === 'genel') { OZ.boy = ''; render(); }
  return r;
};
