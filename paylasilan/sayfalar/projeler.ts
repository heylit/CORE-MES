import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const PROJELER_SAYFALARI = [
  { yol: '/projeler', islem: 'sayfa.projeler', baslik: 'Projeler', simge: 'flag', grup: 'Planlama', sira: 5 },
  // 3269 a, 3444 a: tek görev sayfası; kişinin görevleri ve (projeyi okuyana) seçilen projenin görevleri. Proje okuyamayan rol de
  // (operatör, bakım) yalnız kendi görevini burada görür.
  { yol: '/proje-gorevlerim', islem: 'sayfa.proje-gorevlerim', baslik: 'Görevler', simge: 'user-plus', grup: 'Planlama', sira: 6 },
] as const satisfies readonly SayfaTanimi[];

// Liste ve (890 c) statü listesi. Ekleme ve düzenleme pencerededir, ayrıca `projeler.yaz` ister; statü listesini değiştirmek `projeler.statu-ayar` ister.
export const PROJELER_IKINCI_MENU = {
  kok: '/projeler',
  baslik: 'Projeler',
  simge: 'flag',
  gruplar: [
    { maddeler: [
      { anahtar: 'liste', baslik: 'Proje listesi', yol: '/projeler', simge: 'list', islem: 'sayfa.projeler', veya: ['projeler.oku'] },
    ] },
    { baslik: 'Ayarlar', maddeler: [
      { anahtar: 'statuler', baslik: 'Statü listesi', yol: '/projeler/statuler', simge: 'tag', islem: 'projeler.statu-ayar' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;

// 3458 dilim 3: görev şablonları ve hazırlık maddeleri görevlerin yanında, Görevler sayfasının ikinci menüsündedir.
// Madde listesinin sahibi Üretim Emirleri'dir (3396 a); burada yalnız ekranı durur.
export const GOREVLER_IKINCI_MENU = {
  kok: '/proje-gorevlerim',
  baslik: 'Görevler',
  simge: 'user-plus',
  gruplar: [
    { maddeler: [
      { anahtar: 'gorevler', baslik: 'Görevler', yol: '/proje-gorevlerim', simge: 'list', islem: 'sayfa.proje-gorevlerim' },
    ] },
    { baslik: 'Ayarlar', maddeler: [
      { anahtar: 'sablonlar', baslik: 'Görev şablonları', yol: '/proje-gorevlerim/sablonlar', simge: 'layers', islem: 'projeler.sablon-yaz', okur: ['/projeler/sablonlar/liste'] },
      { anahtar: 'hazirlik-maddeleri', baslik: 'Hazırlık maddeleri', yol: '/proje-gorevlerim/hazirlik-maddeleri', simge: 'flag', islem: 'uretim-emirleri.hazirlik-ayar', okur: ['/hazirlik-maddeleri'] },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
