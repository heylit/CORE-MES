import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// 3D Atölyesi (1432 a): "parça ne" sayfası; CNC Kurulum "nasıl işlenir" sorusunun sayfasıdır, ayrı kalır. Sonraki aşamaların
// maddeleri (PMI, CMM planı) geldikçe ikinci menüye eklenir.
export const GEOMETRI_SAYFALARI = [
  { yol: '/geometri', islem: 'sayfa.geometri', baslik: '3D Atölyesi', simge: 'expand', grup: 'Üretim', sira: 42 },
] as const satisfies readonly SayfaTanimi[];

export const GEOMETRI_IKINCI_MENU = {
  kok: '/geometri',
  baslik: '3D Atölyesi',
  simge: 'expand',
  gruplar: [{ maddeler: [
    { anahtar: 'modeller', baslik: 'Modeller', yol: '/geometri', simge: 'cube', islem: 'sayfa.geometri' },
  ] }],
} as const satisfies IkinciMenuTanimi;
