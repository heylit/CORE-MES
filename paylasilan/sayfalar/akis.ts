import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Akış Süresi (kart #1338): yalnız okur; sayfayı gören bütün bölümleri görür.
export const AKIS_SAYFALARI = [
  { yol: '/akis', islem: 'sayfa.akis', baslik: 'Akış Süresi', simge: 'gantt', grup: 'Üretim', sira: 60 },
] as const satisfies readonly SayfaTanimi[];

export const AKIS_IKINCI_MENU = {
  kok: '/akis',
  baslik: 'Akış Süresi',
  simge: 'gantt',
  gruplar: [
    { maddeler: [{ anahtar: 'emirler', baslik: 'Emir yolculuğu', yol: '/akis', simge: 'gantt', islem: 'sayfa.akis' }] },
  ],
} as const satisfies IkinciMenuTanimi;
