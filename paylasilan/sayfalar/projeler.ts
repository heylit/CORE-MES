import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const PROJELER_SAYFALARI = [
  { yol: '/projeler', islem: 'sayfa.projeler', baslik: 'Projeler', simge: 'flag', grup: 'Planlama', sira: 5 },
] as const satisfies readonly SayfaTanimi[];

// Liste ve (890 c) statü listesi. Ekleme ve düzenleme pencerededir, ayrıca `projeler.yaz` ister; statü listesini değiştirmek `projeler.statu-ayar` ister.
export const PROJELER_IKINCI_MENU = {
  kok: '/projeler',
  baslik: 'Projeler',
  simge: 'flag',
  gruplar: [
    { maddeler: [
      { anahtar: 'liste', baslik: 'Proje listesi', yol: '/projeler', simge: 'list', islem: 'sayfa.projeler', veya: ['projeler.oku'] },
      { anahtar: 'statuler', baslik: 'Statü listesi', yol: '/projeler/statuler', simge: 'tag', islem: 'projeler.statu-ayar' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
