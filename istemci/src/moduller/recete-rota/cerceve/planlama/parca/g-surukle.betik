
/* Sürükle bırak yalnız fareyle: dokunmatikte kaydırma ile çakışmasın; orada denetçideki "Taşı" ve sıra düğmeleri var. */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.pm-is[data-v]');
  if (!b || e.button !== 0 || e.pointerType !== 'mouse' || U.sayfa !== 'masa' || !yetkili('plan.yaz') || calisan) return;
  const r = b.getBoundingClientRect();
  surukle = { id: b.dataset.v, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, el: b, aktif: false };
});
document.addEventListener('pointermove', e => {
  const s = surukle; if (!s) return;
  if (!s.aktif) {
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
    const cx = cxAl(); const o = cx && cx.byId[s.id]; if (!o) { surukle = null; return; }
    s.aktif = true; s.izin = new Set(o.c.map(c => c.m));
    const h = s.el.cloneNode(true); h.classList.add('pm-hayalet'); h.removeAttribute('data-act');
    const r = s.el.getBoundingClientRect(); h.style.width = r.width + 'px'; h.style.height = r.height + 'px'; h.style.left = '0px'; h.style.top = '0px';
    h.insertAdjacentHTML('beforeend', '<em class="pm-hayalet-saat"></em>');
    document.body.appendChild(h); s.h = h;
    document.querySelectorAll('.pm-g-serit[data-m]').forEach(x => x.setAttribute(s.izin.has(x.dataset.m) ? 'data-izin' : 'data-yasak', ''));
    document.body.classList.add('pm-suruk');
  }
  s.h.style.transform = `translate(${e.clientX - s.dx}px, ${e.clientY - s.h.offsetHeight / 2}px)`;
  const serit = seritBul(e.clientX, e.clientY);
  document.querySelectorAll('.pm-g-serit[data-hedef]').forEach(x => { if (x !== serit) x.removeAttribute('data-hedef'); });
  const etiket = s.h.querySelector('.pm-hayalet-saat');
  if (serit) {
    serit.setAttribute('data-hedef', '');
    const t = Math.max(7, Math.round(((e.clientX - s.dx - serit.getBoundingClientRect().left) / U.zoom) * 4) / 4);
    etiket.textContent = s.izin.has(serit.dataset.m) ? `${serit.dataset.m.replace('@', '')} · ${fmtDT(S.D, t)}` : `${serit.dataset.m.replace('@', '')} bu adımı yapamaz`;
  } else etiket.textContent = '';
});
function seritBul(x, y) {
  const h = document.elementFromPoint(x, y); if (!h) return null;
  const s = h.closest('.pm-g-serit[data-m]'); if (s) return s;
  const satir = h.closest('.pm-g-satir'); return satir ? satir.querySelector('.pm-g-serit[data-m]') : null;
}
function surukleBitir() {
  document.querySelectorAll('.pm-g-serit[data-izin],.pm-g-serit[data-yasak],.pm-g-serit[data-hedef]').forEach(x => { x.removeAttribute('data-izin'); x.removeAttribute('data-yasak'); x.removeAttribute('data-hedef'); });
  document.body.classList.remove('pm-suruk');
  if (surukle && surukle.h) surukle.h.remove();
}
document.addEventListener('pointerup', e => {
  const s = surukle; if (!s) return;
  if (!s.aktif) { surukle = null; return; }
  const serit = seritBul(e.clientX, e.clientY);
  surukleBitir(); surukle = null; sonSurukleme = Date.now();
  if (!serit) return;
  const m = serit.dataset.m;
  if (!s.izin.has(m)) { bildir(`${m.replace('@', '')} bu adımı yapamaz; rotada uygun tezgâh değil.`, 'hata'); return; }
  const t = Math.max(7, Math.round(((e.clientX - s.dx - serit.getBoundingClientRect().left) / U.zoom) * 4) / 4);
  hamleDene([[s.id, m, t]], `${s.id} → ${m.replace('@', 'fason ')}, ${fmtDT(S.D, t)} ya da sonrası`, [[s.id, m, t]]);
});
document.addEventListener('pointercancel', () => { if (surukle) { surukleBitir(); surukle = null; } });
