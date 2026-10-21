/* ---------- Sabit kabuk ----------
   Her sayfada aynı tek çubuk, aynı yerde: Plan / Veri / Geçmiş, arama, üç nabız sayısı, durum ve iki eylem.
   Eski başlık, nabız şeridi ve ikinci sekme satırı çizilmez. Tahta tam görünümde yalnız içerik alanını kaplar; çubuk ve sol menü yerinde kalır. */
const SK_HEDEF = { plan: 'tahta', veri: 'siparisler', gecmis: 'senaryolar' };
sdCubuk = function () {
  const u = kim(); const op = u.rol === 'operator';
  const ek = op ? [] : [['plan', 'Plan', 'gantt'], ['veri', 'Veri', 'layers'], ['gecmis', 'Geçmiş', 'book']];
  const etkin = ekranAl();
  const hedef = id => id === 'plan' ? 'tahta' : (U.son && U.son[id]) || SK_HEDEF[id];
  const yaz = yetkili('plan.yaz'); const guncel = planGuncel();
  const durum = !S.plan ? rozet('Plan yok', 'pasif') : U.hamle ? rozet('Önizleme', 'uyari') : guncel ? rozet('Güncel', 'tamam') : rozet('Veri değişti', 'uyari');
  const olay = yaz && S.plan ? `<button type="button" class="tc-dugme tc-dugme-kucuk tc-dugme-hayalet pm-sb-iyi" data-act="olay-ac" ${calisan ? 'disabled' : ''} title="Olay ekle: acil sipariş, arıza, malzeme gecikmesi" aria-label="Olay ekle">${ic('alert', 'k')}<span>Olay ekle</span></button>` : '';
  const iyi = yaz ? `<button type="button" class="tc-dugme tc-dugme-kucuk pm-sb-iyi${S.plan && guncel ? '' : ' tc-dugme-birincil'}" data-act="${S.plan ? 'ekip' : 'coz'}" data-v="${S.plan ? '' : 'sifir'}" ${calisan ? 'disabled' : ''} title="${S.plan ? 'Planı iyileştir' : 'Planı kur'}" aria-label="${S.plan ? 'Planı iyileştir' : 'Planı kur'}">${ic('play', 'k')}<span>${calisan ? 'Çözülüyor' : S.plan ? 'Planı iyileştir' : 'Planı kur'}</span></button>` : '';
  const ust = nbUstEski(u); const i = ust.indexOf('<div class="tc-kabuk-hesap');
  /* eski başlığın son etiketi pm-ust-sag kabını kapatır; kullanıcı menüsü onsuz alınır */
  const hesap = i >= 0 ? ust.slice(i).replace(/<\/div>\s*$/, '') : '';
  return `<div class="pm-sb" role="toolbar" aria-label="Plan çubuğu">
    ${ek.length ? `<nav class="pm-sb-ekran" aria-label="Ekranlar">${ek.map(([id, ad, sm]) => `<button type="button" data-act="git" data-v="${hedef(id)}" ${id === etkin ? 'aria-current="page"' : ''}>${ic(sm, 'k')}<span>${ad}</span></button>`).join('')}</nav>` : `<b class="pm-sb-ad">${ic('play', 'k')}Kuyruğum</b>`}
    <button type="button" class="pm-sb-ara" data-act="v20-palet" title="Sipariş, tezgâh ya da komut ara (Ctrl K)">${ic('search', 'k')}<span>Ara: sipariş, tezgâh, komut</span><kbd>Ctrl K</kbd></button>
    ${sdNabiz()}
    <span class="pm-sb-sag">${durum}${olay}${iyi}${hesap}</span></div>`;
};
/* çubuktaki üç sayı plan nabzını açar: altı gösterge, eğriler ve referans seçimi her sayfada aynı yerde, içeriği itmeden */
U.skNb = false;
ustCubuk = function () {
  let nb = '';
  if (U.skNb && S.plan) { const k = U.nbKapali; U.nbKapali = false; nb = `<div class="pm-sk-nb">${nbHtml().replace('data-act="nb-kapa"', 'data-act="sk-nb"').replace('Göstergeleri gizle', 'Kapat (Esc)')}</div>`; U.nbKapali = k; }
  return sdCubuk().replace(/data-act="br-odak" data-v="ozet"/g, `data-act="sk-nb" aria-expanded="${!!U.skNb}"`).replace(/Göstergelere git\./g, 'Plan nabzını aç.') + nb;
};
const skTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'sk-nb') { U.skNb = !U.skNb; render(); return true; }
  if (U.skNb && el && el.closest && el.closest('.pm-sk-nb') && act === 'git') U.skNb = false;
  return skTekEski(act, v, el, e);
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && U.skNb) { U.skNb = false; render(); e.stopImmediatePropagation(); } }, true);
document.addEventListener('pointerdown', e => { if (U.skNb && !(e.target.closest && e.target.closest('.pm-sk-nb, [data-act="sk-nb"]'))) { U.skNb = false; const n = document.querySelector('.pm-sk-nb'); if (n) n.remove(); document.querySelectorAll('[data-act="sk-nb"]').forEach(b => b.setAttribute('aria-expanded', 'false')); } }, true);
/* tahta tam görünümde içerik alanının yerini alır: çubuk ve sol menü örtülmez */
function skAlan() {
  const k = document.querySelector('.tc-kabuk-icerik'); if (!k) return;
  const r = k.getBoundingClientRect(); const st = document.documentElement.style;
  st.setProperty('--sk-ust', Math.max(0, r.top) + 'px'); st.setProperty('--sk-sol', Math.max(0, r.left) + 'px');
  const alt = document.querySelector('.tc-kabuk-alt'); st.setProperty('--sk-alt', (alt && alt.offsetHeight && getComputedStyle(alt).display !== 'none' ? alt.offsetHeight : 0) + 'px');
}
const skRenderEski = render;
/* ikinci sekme satırı ve alt menü aynı üç ekranı ikinci kez gösteriyordu; kabuk iki satırlı düzene döner */
render = function () {
  skRenderEski();
  const k = document.querySelector('.tc-kabuk[data-ikinci]');
  if (k) { k.removeAttribute('data-ikinci'); k.querySelectorAll('.tc-ikinci-kap, .tc-kabuk-alt').forEach(x => x.remove()); if (typeof tbkBoyut === 'function') tbkBoyut(); }
  skAlan();
};
addEventListener('resize', skAlan);
/* Bugün ve hesap sayfaları Plan'ın altında ayrı sekme olmadan Başka menüsünden açılır */
const skMenuEski = sgMenu;
sgMenu = function () {
  const h = skMenuEski(); if (!h) return h;
  const s = (v, sm, ad) => `<button type="button" role="menuitem" data-act="git" data-v="${v}">${ic(sm, 'k')}<span>${esc(ad)}</span></button>`;
  return h.replace(/<\/div>\s*$/, '') + `<small>Sayfalar</small>${s('bugun', 'check', 'Bugünün kararları')}${s('studyo', 'chart', 'Nasıl hesaplandı')}</div>`;
};
const skKomutEski = v20Komutlar;
v20Komutlar = function () { const l = skKomutEski(); if (yetkili('plan.yaz') && S.plan) l.unshift({ ad: 'Olay ekle', simge: 'alert', kos: () => eylem('olay-ac'), grup: 'Plan', ipucu: 'acil sipariş, arıza, malzeme gecikmesi' });
  l.push({ ad: 'Tema değiştir', simge: temaKoyu() ? 'sun' : 'moon', kos: () => eylem('tema'), grup: 'Görünüm', ipucu: 'açık, koyu' }); return l; };
