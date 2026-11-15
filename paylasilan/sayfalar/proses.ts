import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const PROSES_SAYFALARI = [
  { yol: '/proses', islem: 'sayfa.proses', baslik: 'Proses', simge: 'next', grup: 'Üretim', sira: 45 },
] as const satisfies readonly SayfaTanimi[];

// Portföy, iyileştirme ve PFMEA kendi kartlarıyla gelir (3290 ilk dilim; 3292, 3293).
export const PROSES_IKINCI_MENU = {
  kok: '/proses',
  baslik: 'Proses',
  simge: 'next',
  gruplar: [
    { maddeler: [
      { anahtar: 'parca', baslik: 'Parça dosyası', yol: '/proses', simge: 'file', islem: 'proses.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
