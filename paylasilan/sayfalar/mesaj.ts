import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Mesaj tek sayfadır; içerik prototipin kendisidir ve yalıtılmış çerçevede açılır. Prototip kendi iç gezinmesini
// taşır (yerleşim değişmez); ikinci menü tek maddedir.
export const MESAJ_SAYFALARI = [
  { yol: '/mesaj', islem: 'sayfa.mesaj', baslik: 'Mesaj', simge: 'bell', grup: 'Yönetim', sira: 7 },
] as const satisfies readonly SayfaTanimi[];

export const MESAJ_IKINCI_MENU = {
  kok: '/mesaj',
  baslik: 'Mesaj',
  simge: 'bell',
  cerceveli: true,
  gruplar: [{ maddeler: [{ anahtar: 'ana-sayfa', baslik: 'Mesaj', yol: '/mesaj', simge: 'bell', islem: 'sayfa.mesaj' }] }],
} as const satisfies IkinciMenuTanimi;
