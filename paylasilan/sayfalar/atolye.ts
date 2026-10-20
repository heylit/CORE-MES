import type { SayfaTanimi } from '../sayfa-tanimi.ts';

export const ATOLYE_SAYFALARI = [
  { yol: '/atolye', islem: 'sayfa.atolye', baslik: 'Fabrika Haritası', simge: 'target', grup: 'Üretim', sira: 50 },
] as const satisfies readonly SayfaTanimi[];
