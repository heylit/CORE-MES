import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Müşteri ve Tedarikçi Portalı tek sayfadır; içerik prototipin kendisidir ve yalıtılmış çerçevede açılır. Prototip kendi iç gezinmesini
// taşır (yerleşim değişmez); ikinci menü tek maddedir.
export const PORTAL_SAYFALARI = [
  { yol: '/portal', islem: 'sayfa.portal', baslik: 'Müşteri ve Tedarikçi Portalı', simge: 'chart', grup: 'Yönetim', sira: 8 },
] as const satisfies readonly SayfaTanimi[];

export const PORTAL_IKINCI_MENU = {
  kok: '/portal',
  baslik: 'Müşteri ve Tedarikçi Portalı',
  simge: 'chart',
  cerceveli: true,
  gruplar: [{ maddeler: [{ anahtar: 'ana-sayfa', baslik: 'Müşteri ve Tedarikçi Portalı', yol: '/portal', simge: 'chart', islem: 'sayfa.portal' }] }],
} as const satisfies IkinciMenuTanimi;
