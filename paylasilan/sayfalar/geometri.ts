import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// 3D Atölyesi (1432 a): "parça ne" sayfası; CNC Kurulum "nasıl işlenir" sorusunun sayfasıdır, ayrı kalır. Her çalışma ikinci menüde ayrı
// maddedir, hepsi aynı ekranda açılır (2396; istemci geometri/calismalar.ts ile aynı sıra). Sonraki aşamaların maddeleri (PMI, CMM
// planı) geldikçe eklenir.
export const GEOMETRI_SAYFALARI = [
  { yol: '/geometri', islem: 'sayfa.geometri', baslik: '3D Atölyesi', simge: 'expand', grup: 'Üretim', sira: 42 },
] as const satisfies readonly SayfaTanimi[];

export const GEOMETRI_IKINCI_MENU = {
  kok: '/geometri',
  baslik: '3D Atölyesi',
  simge: 'expand',
  gruplar: [{ maddeler: [
    { anahtar: 'analiz', baslik: 'Analiz', yol: '/geometri', simge: 'ruler', islem: 'sayfa.geometri' },
    { anahtar: 'ham', baslik: 'Ham önerisi', yol: '/geometri/ham', simge: 'box', islem: 'sayfa.geometri' },
    { anahtar: 'ozellikler', baslik: 'Özellikler', yol: '/geometri/ozellikler', simge: 'target', islem: 'sayfa.geometri' },
    { anahtar: 'yuzey', baslik: 'Boya ve maske', yol: '/geometri/yuzey', simge: 'edit', islem: 'sayfa.geometri' },
    { anahtar: 'montaj', baslik: 'Montaj', yol: '/geometri/montaj', simge: 'layers', islem: 'sayfa.geometri' },
  ] }],
} as const satisfies IkinciMenuTanimi;
