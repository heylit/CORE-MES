// 226 a: profil silme, seçerek sıfırlama, "Tümünü sil" ve yedekten yükleme `denetim-hazirlik.yonet` ister. Sunucu ortak kaydı silen ya da
// boşaltan yazmayı reddeder (sunucu/moduller/denetim-hazirlik/kurallar.ts `yonetimGerekirMi`); yönetici olmayana bu düğmeler hiç
// gösterilmez, tıklama da prototipe ulaşmadan yakalanır. Prototip dosyası değişmez; betik çerçevede prototipten ÖNCE koşar.
// `:has` ayrı kuralda: desteklemeyen tarayıcı bütün seçici listesini düşürmesin.
export const YONETIM_DUGMELERI = [
  'del', 'delyes', 'imp', 'rsall', 'rsask', 'rsyes', 'wipeask', 'wipeyes',
].map((a) => `[data-pact="${a}"]`).concat(['[data-rs]', '#importFile']).join(',');

export const YONETIM_DUGMELERI_BETIGI = String.raw`(function () {
  var KAPALI = ${JSON.stringify(YONETIM_DUGMELERI)};
  var stil = document.createElement('style');
  stil.textContent = KAPALI + ',.rsl,.dz{display:none!important}.card:has(.rsl){display:none!important}';
  document.head.appendChild(stil);
  function engelle(e) {
    var t = e.target && e.target.closest ? e.target.closest(KAPALI) : null;
    if (t === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  document.addEventListener('click', engelle, true);
  document.addEventListener('change', engelle, true);
})();`;

export function yonetimDugmeleriBetigi(yonetici: boolean): string {
  return yonetici ? '' : `<script>${YONETIM_DUGMELERI_BETIGI}</script>`;
}
