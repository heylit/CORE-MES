import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const KISILER_SAYFALARI = [
  { yol: '/personel', islem: 'sayfa.personel', baslik: 'Personel', simge: 'user', grup: 'Tanımlar', sira: 40 },
] as const satisfies readonly SayfaTanimi[];

// Ekran tek görünümdür; menü tek maddedir. Madde işlemi listeyi okuyan veri yetkisidir: sayfayı gören her rolde vardır,
// kimsenin görünümü değişmez.
export const KISILER_IKINCI_MENU = {
  kok: '/personel',
  baslik: 'Personel',
  simge: 'user',
  gruplar: [
    { maddeler: [
      { anahtar: 'kisiler', baslik: 'Kişiler', yol: '/personel', simge: 'user', islem: 'kisiler.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
