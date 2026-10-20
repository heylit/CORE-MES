import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const KALIBRASYON_SAYFALARI = [
  { yol: '/kalibrasyon', islem: 'sayfa.kalibrasyon', baslik: 'Ölçü Aletleri', simge: 'ruler', grup: 'Kalite', sira: 10 },
] as const satisfies readonly SayfaTanimi[];

// İki bölüm de sayfayı gören herkese açıktır; yazma ayrıca `kalibrasyon.yaz` ister.
export const KALIBRASYON_IKINCI_MENU = {
  kok: '/kalibrasyon',
  baslik: 'Ölçü Aletleri',
  simge: 'ruler',
  gruplar: [
    { maddeler: [
      { anahtar: 'aletler', baslik: 'Aletler', yol: '/kalibrasyon', simge: 'ruler', islem: 'sayfa.kalibrasyon' },
      { anahtar: 'turler', baslik: 'Türler', yol: '/kalibrasyon/turler', simge: 'list', islem: 'sayfa.kalibrasyon' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
