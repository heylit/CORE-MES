import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ATOLYE_SAYFALARI = [
  { yol: '/atolye', islem: 'sayfa.atolye', baslik: 'Fabrika Haritası', simge: 'target', grup: 'Üretim', sira: 50 },
] as const satisfies readonly SayfaTanimi[];

// Haritanın dört bölümü aynı sayfa işlemidir; yazma düğmeleri ekranda beş eylemden kendi eylemini ister (salon, fabrika, kroki, model, kalem).
export const ATOLYE_IKINCI_MENU = {
  kok: '/atolye',
  baslik: 'Fabrika Haritası',
  simge: 'target',
  gruplar: [
    { maddeler: [
      { anahtar: 'harita', baslik: 'Harita', yol: '/atolye', simge: 'cube', islem: 'sayfa.atolye' },
      { anahtar: 'ikiz', baslik: 'Dijital ikiz', yol: '/atolye/ikiz', simge: 'cpu', islem: 'sayfa.atolye' },
      { anahtar: 'depo', baslik: 'Depo', yol: '/atolye/depo', simge: 'box', islem: 'sayfa.atolye' },
      { anahtar: 'parcalar', baslik: 'Parçalar', yol: '/atolye/parcalar', simge: 'layers', islem: 'sayfa.atolye' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
