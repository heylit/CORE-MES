import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Kalite Merkezi tek sayfadır (Kalite grubunda, Ölçü Aletleri'nden önce); uygulamanın kendi görünümleri bu sayfanın ikinci
// menüsündedir (/kalite-merkezi/<görünüm>). İçerik çerçevedir (istemci/src/moduller/kalite-merkezi). Madde anahtarı
// uygulamanın görünüm adıdır; "ayarlar" uygulamanın ayar ve yedek penceresini açar.
export const KALITE_MERKEZI_SAYFALARI = [
  { yol: '/kalite-merkezi', islem: 'sayfa.kalite-merkezi', baslik: 'Kalite Merkezi', simge: 'check', grup: 'Kalite', sira: 5 },
] as const satisfies readonly SayfaTanimi[];

export const KALITE_MERKEZI_IKINCI_MENU = {
  kok: '/kalite-merkezi',
  baslik: 'Kalite Merkezi',
  simge: 'check',
  cerceveli: true,
  gruplar: [
    { maddeler: [
      { anahtar: 'today', baslik: 'Bugün', yol: '/kalite-merkezi', simge: 'bell', islem: 'kalite-merkezi.oku' },
      { anahtar: 'parts', baslik: 'Parçalar', yol: '/kalite-merkezi/parcalar', simge: 'box', islem: 'kalite-merkezi.oku' },
    ] },
    { baslik: 'Resim ve modeller', maddeler: [
      { anahtar: 'draw', baslik: 'Resim ve modeller', yol: '/kalite-merkezi/resimler', simge: 'cube', islem: 'kalite-merkezi.oku' },
      { anahtar: 'kutup', baslik: 'Teknik kütüphane', yol: '/kalite-merkezi/kutuphane', simge: 'layers', islem: 'kalite-merkezi.oku' },
    ] },
    { baslik: 'Muayene', maddeler: [
      { anahtar: 'insp', baslik: 'Muayeneler', yol: '/kalite-merkezi/muayeneler', simge: 'check', islem: 'kalite-merkezi.oku' },
      { anahtar: 'aql', baslik: 'Lot kabul (AQL)', yol: '/kalite-merkezi/lot-kabul', simge: 'scan', islem: 'kalite-merkezi.oku' },
      { anahtar: 'emir', baslik: 'İş emirleri', yol: '/kalite-merkezi/is-emirleri', simge: 'list', islem: 'kalite-merkezi.oku' },
      { anahtar: 'spc', baslik: 'Ölçüm analizi', yol: '/kalite-merkezi/olcum-analizi', simge: 'chart', islem: 'kalite-merkezi.oku' },
    ] },
    { baslik: 'Uygunsuzluk', maddeler: [
      { anahtar: 'ncr', baslik: 'Uygunsuzluklar (NCR)', yol: '/kalite-merkezi/uygunsuzluklar', simge: 'alert', islem: 'kalite-merkezi.oku' },
      { anahtar: 'capa', baslik: 'DÖF / 8D', yol: '/kalite-merkezi/dof', simge: 'wrench', islem: 'kalite-merkezi.oku' },
    ] },
    { baslik: 'Kaynaklar', maddeler: [
      { anahtar: 'dev', baslik: 'Ölçüm cihazları', yol: '/kalite-merkezi/cihazlar', simge: 'ruler', islem: 'kalite-merkezi.oku' },
      { anahtar: 'sup', baslik: 'Tedarikçiler', yol: '/kalite-merkezi/tedarikciler', simge: 'truck', islem: 'kalite-merkezi.oku' },
      { anahtar: 'belge', baslik: 'Belgeler', yol: '/kalite-merkezi/belgeler', simge: 'tag', islem: 'kalite-merkezi.oku' },
      { anahtar: 'forms', baslik: 'Formlar', yol: '/kalite-merkezi/formlar', simge: 'edit', islem: 'kalite-merkezi.oku' },
      { anahtar: 'users', baslik: 'Kullanıcılar', yol: '/kalite-merkezi/kullanicilar', simge: 'user', islem: 'kalite-merkezi.oku' },
      { anahtar: 'terim', baslik: 'Terimler', yol: '/kalite-merkezi/terimler', simge: 'search', islem: 'kalite-merkezi.oku' },
    ] },
    { baslik: 'Raporlar', maddeler: [
      { anahtar: 'dash', baslik: 'Kalite göstergeleri', yol: '/kalite-merkezi/gostergeler', simge: 'gauge', islem: 'kalite-merkezi.oku' },
      { anahtar: 'iz', baslik: 'Değişiklik izi', yol: '/kalite-merkezi/degisiklik-izi', simge: 'eye', islem: 'kalite-merkezi.oku' },
      { anahtar: 'arsiv', baslik: 'Arşiv', yol: '/kalite-merkezi/arsiv', simge: 'down', islem: 'kalite-merkezi.oku' },
      { anahtar: 'ayarlar', baslik: 'Ayarlar ve yedek', yol: '/kalite-merkezi/ayarlar', simge: 'gear', islem: 'kalite-merkezi.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
