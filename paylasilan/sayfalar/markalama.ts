import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const MARKALAMA_SAYFALARI = [
  { yol: '/markalama', islem: 'sayfa.markalama', baslik: 'Markalama', simge: 'pin', grup: 'Üretim', sira: 45 },
] as const satisfies readonly SayfaTanimi[];

// Üç bölüm de sayfayı gören herkese açıktır; yazma ayrıca markalama işlemlerini ister.
export const MARKALAMA_IKINCI_MENU = {
  kok: '/markalama',
  baslik: 'Markalama',
  simge: 'pin',
  gruplar: [
    { maddeler: [
      { anahtar: 'tanimlar', baslik: 'Markalama tanımları', yol: '/markalama', simge: 'target', islem: 'sayfa.markalama' },
      { anahtar: 'istasyon', baslik: 'Markalama istasyonu', yol: '/markalama/istasyon', simge: 'tag', islem: 'sayfa.markalama' },
      { anahtar: 'izleme', baslik: 'Seri izleme', yol: '/markalama/izleme', simge: 'scan', islem: 'sayfa.markalama' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
