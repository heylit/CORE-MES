import type { SayfaTanimi } from '../sayfa-tanimi.ts';

export const MATRIS_SAYFALARI = [
  { yol: '/matris', islem: 'sayfa.matris', baslik: 'Plan Matrisi', simge: 'grid', grup: 'Planlama', sira: 20, menudeGizli: true },
] as const satisfies readonly SayfaTanimi[];
