/* ---------- Tam sayfa çalışma ----------
   Uygulamanın menüsü, üst çubuklar ve yan paneller kapanır; ekranda yalnız tahta, solda araç rafı, üstte etki satırı,
   altta zaman kalır. Kartlar ve seçim kartı aynı şekilde tahtada çalışır. Esc ile çıkılır. */
U.tkTam = false;
function tkTamUygula() { document.documentElement.toggleAttribute('data-tk-tam', !!U.tkTam); }
function tkTamDegistir(ac) {
  U.tkTam = ac == null ? !U.tkTam : !!ac; U.tkAra = false; tkTamUygula(); render();
  requestAnimationFrame(() => { if (AT.cv) { atSigdir(AT.cv.clientWidth, AT.cv.clientHeight); atTetikle(); } });
}
/* kartları görünen alanın sağına düzgün bir sütun halinde dizer; çakışan kartları ayırır */
function tkToparla() {
  const l = (U.tkKart || []).filter(k => !k.kucuk); if (!l.length || !AT.kam) return;
  const W = AT.boyut ? AT.boyut[0] : 1000, H = AT.boyut ? AT.boyut[1] : 700; const k = AT.kam.k;
  const rayE = document.querySelector('.pm-tk-ray'); const sol0 = rayE ? rayE.offsetWidth + 24 : 16;
  let sx = W - 16, sy = 96, kolW = 0;
  for (const c of l.slice().reverse()) {
    const w = TK_TUR[c.tur][3], h = Math.min(420, H - 140);
    if (sy + h > H - 60 && sy > 96 && sx - kolW - 16 - w >= sol0) { sx -= kolW + 16; sy = 96; kolW = 0; }
    kolW = Math.max(kolW, w); [c.x, c.y] = atDunya(Math.max(sol0, sx - w), sy); c.k = k; sy += h + 16;
  }
  (U.tkKart || []).filter(c => c.kucuk).forEach((c, i) => { [c.x, c.y] = atDunya(16, H - 120 - i * 52); c.k = k; });
  tkKaydet(); render();
}
function tkRaf() {
  const kart = Object.entries(TK_TUR).map(([id, [ad, sm]], i) => `<button type="button" class="pm-tk-ray-d" data-act="tk-ac" data-v="${id}" aria-pressed="${(U.tkKart || []).some(k => k.tur === id)}" title="${esc(ad)} (${i + 1})">${ic(sm, 'k')}<span>${esc(ad)}</span></button>`).join('');
  const d = (act, sm, ad, v, ek) => `<button type="button" class="pm-tk-ray-d" data-act="${act}" ${v != null ? `data-v="${esc(v)}"` : ''} ${ek || ''} title="${esc(ad)}">${ic(sm, 'k')}<span>${esc(ad)}</span></button>`;
  const a = U.taslak && U.taslak.adimlar;
  const ara = U.tkAra ? `<label class="pm-tk-ray-ara">${ic('search', 'k')}<input type="search" list="at-sip-l" placeholder="Sipariş bul" data-at-ara aria-label="Sipariş bul"></label>` : '';
  return `<nav class="pm-tk-ray" aria-label="Araçlar">
    <div class="pm-tk-ray-g" role="group" aria-label="Kartlar"><small>Kart</small>${kart}</div>
    <div class="pm-tk-ray-g" role="group" aria-label="Görünüm"><small>Görünüm</small>
      ${d('tk-ara', 'search', 'Sipariş bul (/)', null, `aria-pressed="${!!U.tkAra}"`)}${d('at-sigdir', 'fit', 'Sığdır (F)')}${d('at-zoom', 'plus', 'Yakınlaş (+)', 1)}${d('at-zoom', 'minus', 'Uzaklaş (-)', -1)}
      ${d('rs-fark', 'eye', 'Önceki planla fark', null, `aria-pressed="${!!U.rsFark}"`)}${d('km-mercek', 'chart', 'Gecikme kaynağı', 'etki', `aria-pressed="${U.atMercek === 'etki'}"`)}${d('tk-toparla', 'grid', 'Kartları bölgelere diz')}${d('tk-hepsi', 'expand', 'Atölye ve kartların hepsini göster')}</div>
    <div class="pm-tk-ray-g" role="group" aria-label="Plan"><small>Plan</small>
      ${a && a.length ? d('taslak-don', 'rotate', 'Son adımı geri al (Ctrl Z)', a.length - 1) : `<button type="button" class="pm-tk-ray-d" disabled title="Geri alınacak adım yok">${ic('rotate', 'k')}<span>Geri al</span></button>`}
      ${yetkili('plan.yaz') ? d('coz', 'bolt', 'Planı iyileştir') : ''}${d('at-kilavuz', 'help', 'Nasıl okunur', null, `aria-pressed="${!!AT.kilavuz}"`)}</div>
    <div class="pm-tk-ray-g pm-tk-ray-son">${d('tk-tam', 'x', 'Tam sayfadan çık (Esc)')}</div>
    ${ara}</nav>`;
}
const tdAtEski = sAtolye;
sAtolye = function (p) {
  let h = tdAtEski(p);
  const tam = `<button type="button" class="tc-dugme tc-dugme-kucuk ${U.tkTam ? '' : 'tc-dugme-birincil'} pm-tk-tam-d" data-act="tk-tam" aria-pressed="${!!U.tkTam}" title="${U.tkTam ? 'Tam sayfadan çık (Esc)' : 'Tam sayfa: yalnız tahta ve araçlar'}">${ic('expand', 'k')}<span>Tam sayfa</span></button>`;
  h = h.replace('<div class="pm-at-arac">', `<div class="pm-at-arac">${tam}`);
  if (U.tkTam) { const i = h.lastIndexOf('</div>'); h = h.slice(0, i) + tkRaf() + h.slice(i); h = h.replace('<div class="pm-at" id="pm-at"', '<div class="pm-at" id="pm-at" data-tam'); }
  return h;
};
const tdTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'tk-tam': tkTamDegistir(); return true;
    case 'tk-toparla': tkToparla(); return true;
    case 'tk-ara': U.tkAra = !U.tkAra; render(); if (U.tkAra) requestAnimationFrame(() => { const i = document.querySelector('.pm-tk-ray-ara input'); if (i) i.focus(); }); return true;
  }
  return tdTekEski(act, v, el, e);
};
/* başka sayfaya geçilince tam sayfa kapanır */
const tdRenderEski = render;
render = function () {
  if (U.tkTam && !(U.sayfa === 'tahta' && mercekAl() === 'resim' && U.rsKip !== 'pano')) U.tkTam = false;
  tkTamUygula(); tdRenderEski();
};
/* klavye: yazı alanında değilken tahtada */
document.addEventListener('keydown', e => {
  if (!document.getElementById('pm-at') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]')) { if (e.key === 'Escape' && U.tkAra) { U.tkAra = false; render(); } return; }
  const k = e.key; let ok = true;
  if (k === 'Escape' && U.tkTam) { if (U.gySec || U.rsTez || U.secJob) { U.gySec = null; U.rsTez = null; U.secJob = null; render(); } else tkTamDegistir(false); }
  else if (/^[1-8]$/.test(k)) { const id = Object.keys(TK_TUR)[+k - 1]; if ((U.tkKart || []).some(c => c.tur === id)) tkKapat(id); else tkAc(id); }
  else if (k === 'f' || k === 'F') tekEylem('at-sigdir');
  else if (k === '+' || k === '=') tekEylem('at-zoom', '1');
  else if (k === '-') tekEylem('at-zoom', '-1');
  else if (k === '/') { e.preventDefault(); if (U.tkTam) tekEylem('tk-ara'); else { const i = document.querySelector('[data-at-ara]'); if (i) i.focus(); } return; }
  else ok = false;
  if (ok) e.preventDefault();
});
