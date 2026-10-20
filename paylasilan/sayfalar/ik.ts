import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// İK iki sayfadır (Yönetim grubunda, Sistem Ayarları'ndan önce: ayarlar menünün sonunda durur), ikisi de aynı uygulamayı çerçevede
// açar (istemci/src/moduller/ik); uygulamanın görünümleri sayfaların ikinci menüsündedir (/<sayfa>/<görünüm>), madde anahtarı
// görünüm adıdır. "İnsan Kaynakları" İK ekibinindir; "İK İşlemlerim" her çalışanın kendi işleri ve yöneticinin onaylarıdır
// (kullanıcı kararı 12.10.2026: açacak kişiler için ayrı sayfa).
export const IK_SAYFALARI = [
  { yol: '/ik-islemlerim', islem: 'sayfa.ik-islemlerim', baslik: 'İK İşlemlerim', simge: 'home', grup: 'Yönetim', sira: 4 },
  { yol: '/ik', islem: 'sayfa.ik', baslik: 'İnsan Kaynakları', simge: 'users', grup: 'Yönetim', sira: 5 },
] as const satisfies readonly SayfaTanimi[];

// İK maddeleri `ik.oku` ile görünür (bütün kayıtları gören kişi).
export const IK_IKINCI_MENU = {
  kok: '/ik',
  baslik: 'İnsan Kaynakları',
  simge: 'users',
  cerceveli: true,
  sayacUcu: '/ik/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'pano', baslik: 'Pano', yol: '/ik', simge: 'gauge', islem: 'ik.oku' },
      { anahtar: 'gorev', baslik: 'Yapılacaklar', yol: '/ik/yapilacaklar', simge: 'bell', islem: 'ik.oku' },
    ] },
    { baslik: 'Çalışanlar', maddeler: [
      { anahtar: 'personel', baslik: 'Personel', yol: '/ik/personel', simge: 'user', islem: 'ik.oku' },
      { anahtar: 'org', baslik: 'Organizasyon', yol: '/ik/organizasyon', simge: 'layers', islem: 'ik.oku' },
    ] },
    { baslik: 'Süreçler', maddeler: [
      { anahtar: 'izin', baslik: 'İzinler', yol: '/ik/izinler', simge: 'flag', islem: 'ik.oku' },
      { anahtar: 'devam', baslik: 'Devam ve mesai', yol: '/ik/devam', simge: 'clock', islem: 'ik.oku' },
      // PDKS dosyası İK'nın işidir (259 a, 341 a); ekran Nizamiye'nin, yetki aynı nizamiye.pdks-aktar.
      { anahtar: 'pdks', baslik: 'PDKS aktar', yol: '/ik/pdks', simge: 'upload', islem: 'nizamiye.pdks-aktar' },
      { anahtar: 'bordro', baslik: 'Bordro', yol: '/ik/bordro', simge: 'list', islem: 'ik.oku' },
      { anahtar: 'performans', baslik: 'Performans', yol: '/ik/performans', simge: 'target', islem: 'ik.oku' },
      { anahtar: 'egitim', baslik: 'Eğitim', yol: '/ik/egitim', simge: 'lab', islem: 'ik.oku' },
      { anahtar: 'isealim', baslik: 'İşe alım', yol: '/ik/ise-alim', simge: 'search', islem: 'ik.oku' },
    ] },
    { baslik: 'Analiz', maddeler: [
      { anahtar: 'rapor', baslik: 'Raporlar', yol: '/ik/raporlar', simge: 'chart', islem: 'ik.oku' },
      { anahtar: 'plan', baslik: 'Maliyet planı', yol: '/ik/maliyet-plani', simge: 'dash', islem: 'ik.oku' },
      { anahtar: 'hesap', baslik: 'Hesaplamalar', yol: '/ik/hesaplamalar', simge: 'ruler', islem: 'ik.oku' },
      { anahtar: 'log', baslik: 'Değişiklik günlüğü', yol: '/ik/gunluk', simge: 'eye', islem: 'ik.oku' },
      { anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/ik/ayarlar', simge: 'gear', islem: 'ik.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;

// Çalışan maddeleri sayfanın kendi işlemiyle görünür: kişi yalnız kendi kaydını görür. Onay maddeleri izin onayı yetkisiyle görünür;
// ekip kayıttaki yönetici bağından çıkar.
export const IK_ISLEMLERIM_IKINCI_MENU = {
  kok: '/ik-islemlerim',
  baslik: 'İK İşlemlerim',
  simge: 'home',
  cerceveli: true,
  sayacUcu: '/ik/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'benim', baslik: 'Benim sayfam', yol: '/ik-islemlerim', simge: 'user', islem: 'sayfa.ik-islemlerim' },
      { anahtar: 'izinlerim', baslik: 'İzinlerim', yol: '/ik-islemlerim/izinlerim', simge: 'flag', islem: 'sayfa.ik-islemlerim' },
      { anahtar: 'bordrolarim', baslik: 'Bordrolarım', yol: '/ik-islemlerim/bordrolarim', simge: 'list', islem: 'sayfa.ik-islemlerim' },
      { anahtar: 'mesailerim', baslik: 'Mesailerim', yol: '/ik-islemlerim/mesailerim', simge: 'clock', islem: 'sayfa.ik-islemlerim' },
    ] },
    { baslik: 'Ekibim', maddeler: [
      { anahtar: 'onay', baslik: 'Onaylar', yol: '/ik-islemlerim/onaylar', simge: 'check', islem: 'ik.izin-onay' },
      { anahtar: 'ekip', baslik: 'Ekip', yol: '/ik-islemlerim/ekip', simge: 'layers', islem: 'ik.izin-onay' },
      { anahtar: 'ekiptakvim', baslik: 'İzin takvimi', yol: '/ik-islemlerim/ekip-takvimi', simge: 'clock', islem: 'ik.izin-onay' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
