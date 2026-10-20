import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Denetim Hazırlığı tek sayfadır; içerik prototipin kendisidir ve yalıtılmış çerçevede açılır. Prototip kendi iç gezinmesini
// taşır (yerleşim değişmez); ikinci menü tek maddedir.
export const DENETIM_HAZIRLIK_SAYFALARI = [
  { yol: '/denetim-hazirlik', islem: 'sayfa.denetim-hazirlik', baslik: 'Denetim Hazırlığı', simge: 'search', grup: 'Kalite', sira: 20 },
] as const satisfies readonly SayfaTanimi[];

export const DENETIM_HAZIRLIK_IKINCI_MENU = {
  kok: '/denetim-hazirlik',
  baslik: 'Denetim Hazırlığı',
  simge: 'search',
  cerceveli: true,
  gruplar: [{ maddeler: [{ anahtar: 'ana-sayfa', baslik: 'Denetim Hazırlığı', yol: '/denetim-hazirlik', simge: 'search', islem: 'sayfa.denetim-hazirlik' }] }],
} as const satisfies IkinciMenuTanimi;
