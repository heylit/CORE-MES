import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const DURUS_NEDENLERI_SAYFALARI = [
  { yol: '/durus-nedenleri', islem: 'sayfa.durus-nedenleri', baslik: 'Duruş ve Hurda Nedenleri', simge: 'pause', grup: 'Tanımlar', sira: 30 },
] as const satisfies readonly SayfaTanimi[];

// İki bölüm de sayfayı gören herkese açıktır; yazma ayrıca `durus-nedenleri.yaz` ister.
export const DURUS_NEDENLERI_IKINCI_MENU = {
  kok: '/durus-nedenleri',
  baslik: 'Duruş ve Hurda Nedenleri',
  simge: 'pause',
  gruplar: [
    { maddeler: [
      { anahtar: 'durus', baslik: 'Duruş nedenleri', yol: '/durus-nedenleri', simge: 'pause', islem: 'sayfa.durus-nedenleri' },
      { anahtar: 'hurda', baslik: 'Hurda nedenleri', yol: '/durus-nedenleri/hurda', simge: 'alert', islem: 'sayfa.durus-nedenleri' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
