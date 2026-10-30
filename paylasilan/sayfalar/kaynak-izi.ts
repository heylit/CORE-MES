import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Kaynak 360 (kart 1325, 1304 a, 1322 a): yalnız okur. Aşama 1'de sayfa işlemi yalnız yöneticidedir; roller bağlamada verilir.
export const KAYNAK_IZI_SAYFALARI = [
  { yol: '/kaynak-izi', islem: 'sayfa.kaynak-izi', baslik: 'Kaynak 360', simge: 'helmet', grup: 'Üretim', sira: 70 },
] as const satisfies readonly SayfaTanimi[];

export const KAYNAK_IZI_IKINCI_MENU = {
  kok: '/kaynak-izi',
  baslik: 'Kaynak 360',
  simge: 'helmet',
  gruplar: [
    { maddeler: [{ anahtar: 'kaynak', baslik: 'Kaynak 360', yol: '/kaynak-izi', simge: 'helmet', islem: 'sayfa.kaynak-izi' }] },
  ],
} as const satisfies IkinciMenuTanimi;
