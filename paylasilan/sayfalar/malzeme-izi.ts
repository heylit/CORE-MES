import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Malzeme 360 (kart 1296, 1277 a): yalnız okur. Aşama 1'de sayfa işlemi yalnız yöneticidedir; roller bağlamada verilir.
export const MALZEME_IZI_SAYFALARI = [
  { yol: '/malzeme-izi', islem: 'sayfa.malzeme-izi', baslik: 'Malzeme 360', simge: 'pallet', grup: 'Stok', sira: 30 },
] as const satisfies readonly SayfaTanimi[];

export const MALZEME_IZI_IKINCI_MENU = {
  kok: '/malzeme-izi',
  baslik: 'Malzeme 360',
  simge: 'pallet',
  gruplar: [
    { maddeler: [{ anahtar: 'malzeme', baslik: 'Malzeme 360', yol: '/malzeme-izi', simge: 'pallet', islem: 'sayfa.malzeme-izi' }] },
  ],
} as const satisfies IkinciMenuTanimi;
