/* ---------- Yan panel: açılan her şey tahtanın yanında ----------
   Kartlar ve seçim kartı tahtanın üstünde yüzmez. Sağda tek bir panel kayarak açılır, tahta daralır ve tamamen görünür kalır;
   dar ekranda panel alttan açılır. Aynı anda tek içerik görünür; açık öteki kartlar panelin başında sekme olarak durur. */
U.dkOnce = false;
function dkAcik() { return !!U.tkTam && (!!dkSecimVar() || (U.tkKart || []).some(k => !k.kucuk)); }
function dkSecimVar() { const s = S.plan && atSahne(); if (!s) return false; return !!((U.gySec && S.plan.ops[U.gySec]) || (U.secJob && s.byJ[U.secJob]) || (U.rsTez && s.ist[U.rsTez])); }
function dkHtml(p) {
  const l = (U.tkKart || []).filter(k => !k.kucuk); const secim = tkSecim(p);
  const son = l[l.length - 1];
  const sek = l.length > (secim ? 0 : 1) ? `<nav class="pm-dk-sek" aria-label="Açık kartlar">${secim ? `<button type="button" aria-current="true">${ic('target', 'k')}<span>Seçim</span></button>` : ''}${l.map(k => `<button type="button" data-act="tk-ac" data-v="${k.tur}" ${!secim && k === son ? 'aria-current="true"' : ''}>${ic(TK_TUR[k.tur][1], 'k')}<span>${esc(TK_TUR[k.tur][0])}</span></button>`).join('')}</nav>` : '';
  const kapat = secim ? dugme('', 'dk-kapat', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat (Esc)' }) : '';
  const govde = secim || (son ? tkKartHtml(p, son, (U.tkKart || []).indexOf(son)) : '');
  return `<aside class="pm-dk${U.dkOnce ? '' : ' pm-dk-giris'}" aria-label="Yan panel"><div class="pm-dk-bas">${sek}${kapat}</div><div class="pm-dk-ic">${govde}</div></aside>`;
}
const dkKatEski = tkKatman;
tkKatman = function (p) {
  if (!dkAcik()) { U.dkOnce = false; return dkKatEski(p); }
  const h = `${tkHud()}<div class="pm-tk-katman" id="tk-katman"></div>${dkHtml(p)}`; U.dkOnce = true; return h;
};
/* panel tahtanın kabına taşınır: tahta (tuval, bölgeler, oynatıcı) panelin yanında daralır */
const dkRenderEski = render;
render = function () {
  dkRenderEski();
  const at = document.getElementById('pm-at'); const dk = at && at.querySelector(':scope > .pm-dk');
  document.querySelectorAll('.pm-tb-mercek > .pm-dk').forEach(x => { if (x !== dk) x.remove(); });
  if (at && dk) { at.parentElement.appendChild(dk); at.setAttribute('data-dock', ''); if (dk.classList.contains('pm-dk-giris')) at.setAttribute('data-dock-giris', ''); }
  if (at) requestAnimationFrame(() => { if (AT.cv) atTetikle(); });
};
const dkTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'dk-kapat') { U.gySec = null; U.secJob = null; U.rsTez = null; render(); return true; }
  return dkTekEski(act, v, el, e);
};
/* aynı tezgâha iki kez hızlıca dokunmak ona odaklanır (bölüm ve gün şeridi). Tuval ilk dokunuşta yeniden çizilebildiği için
   dblclick olayı yerine iki dokunuşun zamanı ve yeri karşılaştırılır. */
let dkSon = null;
document.addEventListener('pointerup', e => {
  const cv = e.target.closest && e.target.closest('#at-cv'); if (!cv || !U.tkTam || e.button > 0) return;
  const r = cv.getBoundingClientRect(); const h = atBul(e.clientX - r.left, e.clientY - r.top);
  if (!h || h.tur !== 'ist') { dkSon = null; return; }
  const t = performance.now();
  if (dkSon && dkSon.m === h.m && t - dkSon.t < 450 && Math.hypot(e.clientX - dkSon.x, e.clientY - dkSon.y) < 12) { dkSon = null; e.stopImmediatePropagation(); U.rsTez = h.m; odAc('m:' + h.m); return; }
  dkSon = { m: h.m, t, x: e.clientX, y: e.clientY };
}, true);
