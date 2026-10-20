import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const PROJELER_SAYFALARI = [
  { yol: '/projeler', islem: 'sayfa.projeler', baslik: 'Projeler', simge: 'flag', grup: 'Planlama', sira: 5 },
] as const satisfies readonly SayfaTanimi[];

// Tek bölüm: liste. Ekleme ve düzenleme pencerededir, ayrıca `projeler.yaz` ister.
export const PROJELER_IKINCI_MENU = {
  kok: '/projeler',
  baslik: 'Projeler',
  simge: 'flag',
  gruplar: [
    { maddeler: [
      { anahtar: 'liste', baslik: 'Proje listesi', yol: '/projeler', simge: 'list', islem: 'sayfa.projeler', veya: ['projeler.oku'] },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
