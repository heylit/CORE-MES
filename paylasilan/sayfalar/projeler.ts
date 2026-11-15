import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const PROJELER_SAYFALARI = [
  { yol: '/projeler', islem: 'sayfa.projeler', baslik: 'Projeler', simge: 'flag', grup: 'Planlama', sira: 5 },
  // 3269 a: kişinin proje görevleri; proje okuyamayan rol de (operatör, bakım) yalnız kendi görevini burada görür.
  { yol: '/proje-gorevlerim', islem: 'sayfa.proje-gorevlerim', baslik: 'Proje görevlerim', simge: 'user-plus', grup: 'Planlama', sira: 6 },
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
      { anahtar: 'sablonlar', baslik: 'Görev şablonları', yol: '/projeler/sablonlar', simge: 'layers', islem: 'projeler.sablon-yaz', okur: ['/projeler/sablonlar/liste'] },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
