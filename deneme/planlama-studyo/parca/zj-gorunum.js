/* ---------- Sade tahta, 2. adım ----------
   Sol ray kalkar. Tahtanın sol üstünde tek görünüm seçici (Genel, Atölye, Odak) ve bir "Başka" menüsü; sağ altta yakınlaştırma.
   Kartlar, mercekler ve düzen komutları Başka menüsünden ve Ctrl K aramasından açılır; işlev silinmez, yalnız yeri değişir. */
U.sgMenu = false; U.sgGor = 'genel';
function sgDugme(act, sm, ad, v, ek) { return `<button type="button" data-act="${act}" ${v != null ? `data-v="${esc(v)}"` : ''} ${ek || ''} title="${esc(ad)}" aria-label="${esc(ad)}">${ic(sm, 'k')}</button>`; }
function sgMenu() {
  if (!U.sgMenu) return '';
  const acik = id => (U.tkKart || []).some(k => k.tur === id);
  const s = (act, sm, ad, v, basili, tus) => `<button type="button" role="menuitemcheckbox" aria-checked="${!!basili}" data-act="${act}" ${v != null ? `data-v="${esc(v)}"` : ''}>${ic(sm, 'k')}<span>${esc(ad)}</span>${tus ? `<kbd>${esc(tus)}</kbd>` : ''}</button>`;
  const kart = Object.entries(TK_TUR).map(([id, [ad, sm]], i) => s('tk-ac', sm, ad, id, acik(id), String(i + 1))).join('');
  return `<div class="pm-sg-menu" role="menu" aria-label="Başka görünüm ve kartlar">
    <small>Kartlar</small>${kart}
    <small>Tahtada göster</small>${s('rs-fark', 'eye', 'Önceki planla fark', null, U.rsFark)}${s('km-mercek', 'chart', 'Gecikme kaynağı', 'etki', U.atMercek === 'etki')}${s('at-kilavuz', 'help', 'Nasıl okunur', null, AT.kilavuz)}
    <small>Düzen</small>${s('tk-toparla', 'grid', 'Kartları bölgelere diz')}${s('tk-tam', 'list', 'Menüleri göster')}</div>`;
}
function sgHtml() {
  const od = !!document.querySelector('.pm-od') || !!(U.odak && U.odak.g);
  const g = (id, ad, sm, act, v, ipucu) => `<button type="button" data-act="${act}" ${v ? `data-v="${v}"` : ''} aria-pressed="${od ? id === 'odak' : U.sgGor === id}" title="${esc(ipucu)}">${ic(sm, 'k')}<span>${esc(ad)}</span></button>`;
  return `<div class="pm-sg" role="toolbar" aria-label="Görünüm">
      <div class="pm-sg-sec">${g('genel', 'Özet', 'expand', 'sg-gor', 'genel', 'Özet: göstergeler, tezgâh haritası ve grafikler birlikte')}${g('atolye', 'Harita', 'fit', 'sg-gor', 'atolye', 'Harita: yalnız tezgâhlar ve aralarındaki iş akışı, ekrana sığdırılmış')}${g('odak', 'Çizelge', 'gantt', 'od-ac', 'auto', 'Çizelge: bir bölümün ya da tezgâhın işleri saat saat; işleri sürükleyerek taşıyın')}</div>
      <button type="button" class="pm-sg-baska" data-act="sg-menu" aria-haspopup="menu" aria-expanded="${!!U.sgMenu}" title="Kartlar ve başka görünümler">${ic('layers', 'k')}<span>Başka</span>${ic('down', 'k')}</button>
      ${sgMenu()}</div>
    <div class="pm-sg-zum" role="group" aria-label="Yakınlık">${sgDugme('at-zoom', 'minus', 'Uzaklaş (-)', -1)}${sgDugme('at-sigdir', 'fit', 'Sığdır (F)')}${sgDugme('at-zoom', 'plus', 'Yakınlaş (+)', 1)}</div>`;
}
const sgRafEski = tkRaf;
tkRaf = function () { return U.tkTam ? sgHtml() : sgRafEski(); };
const sgTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'sg-menu') { U.sgMenu = !U.sgMenu; render(); if (U.sgMenu) requestAnimationFrame(() => { const b = document.querySelector('.pm-sg-menu button'); if (b) b.focus(); }); return true; }
  if (act === 'sg-gor') { U.sgMenu = false; U.sgGor = v; if (document.querySelector('.pm-od')) odKapat(); if (v === 'genel') tkSigdirHepsi(); else { render(); requestAnimationFrame(() => eylem('at-sigdir')); } return true; }
  /* menüden seçilen komut menüyü kapatır; kart açmak ya da mercek seçmek tek dokunuştur */
  if (U.sgMenu && el && el.closest && el.closest('.pm-sg-menu')) U.sgMenu = false;
  return sgTekEski(act, v, el, e);
};
/* dışarı dokununca menü yeniden çizim olmadan kapanır; tuval aynı dokunuşla sürüklemeye başlayabilsin */
function sgMenuKapat() { U.sgMenu = false; const m = document.querySelector('.pm-sg-menu'); if (m) m.remove(); const b = document.querySelector('.pm-sg-baska'); if (b) b.setAttribute('aria-expanded', 'false'); }
document.addEventListener('pointerdown', e => { if (U.sgMenu && !(e.target.closest && e.target.closest('.pm-sg-menu, .pm-sg-baska'))) sgMenuKapat(); }, true);
/* sade tahtada Esc menüleri açmaz: önce menü, sonra seçim, sonra son açılan kart kapanır; "/" aramayı açar */
document.addEventListener('keydown', e => {
  if (!U.tkTam || !document.getElementById('pm-at') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]')) return;
  if (e.key === '/') { e.preventDefault(); e.stopImmediatePropagation(); v20PaletAc(); return; }
  if (e.key !== 'Escape' || document.querySelector('.pm-od')) return;
  if (U.sgMenu) { sgMenuKapat(); const b = document.querySelector('.pm-sg-baska'); if (b) b.focus(); }
  else if (U.gySec || U.rsTez || U.secJob) { U.gySec = null; U.rsTez = null; U.secJob = null; render(); }
  else { const l = (U.tkKart || []).filter(k => !k.kucuk); if (l.length) tkKapat(l[l.length - 1].tur); }
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
/* raydaki her işlev aramada da bulunur */
const sgKomutEski = v20Komutlar;
v20Komutlar = function () {
  const l = sgKomutEski(); if (!S.plan) return l;
  const ek = (ad, simge, kos, grup, ipucu = '') => l.unshift({ ad, simge, kos, grup, ipucu });
  const tahta = f => () => { if (U.sayfa !== 'tahta') { U.sayfa = 'tahta'; render(); } f(); };
  ek('Kartları bölgelere diz', 'grid', tahta(() => tkToparla()), 'Tahta');
  ek('Nasıl okunur', 'help', tahta(() => atKilavuz(!AT.kilavuz)), 'Tahta', 'tahtadaki işaretler');
  ek('Gecikme kaynağını göster', 'chart', tahta(() => eylem('km-mercek', 'etki')), 'Tahta');
  ek('Önceki planla farkı göster', 'eye', tahta(() => eylem('rs-fark')), 'Tahta');
  ek('Menüleri göster', 'list', () => tkTamDegistir(false), 'Tahta', 'tam görünümden çık');
  ek('Çizelge: bölüm ya da tezgâhın saatleri', 'gantt', tahta(() => odAc('auto')), 'Görünüm', 'O');
  ek('Harita: tezgâhlar ve iş akışı', 'fit', tahta(() => eylem('sg-gor', 'atolye')), 'Görünüm', 'F');
  ek('Özet: bütün tahta', 'expand', tahta(() => eylem('sg-gor', 'genel')), 'Görünüm');
  Object.entries(TK_TUR).reverse().forEach(([id, [ad, sm]]) => ek(`Kart: ${ad}`, sm, tahta(() => tkAc(id)), 'Kart', String(Object.keys(TK_TUR).indexOf(id) + 1)));
  return l;
};
/* kamera serbest alanı görünüm seçicinin altından başlar (telefonda seçici zaten akışta) */
const sgSerbestEski = brSerbest;
brSerbest = function () { const f = sgSerbestEski(); const g = document.querySelector('.pm-sg'); if (g && getComputedStyle(g).position === 'absolute') f.ust += g.offsetHeight + 8; return f; };
