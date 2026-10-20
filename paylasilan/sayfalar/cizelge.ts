import type { SayfaTanimi } from '../sayfa-tanimi.ts';

export const CIZELGE_SAYFALARI = [
  { yol: '/cizelge', islem: 'sayfa.cizelge', baslik: 'Plan Çizelgesi', simge: 'gantt', grup: 'Planlama', sira: 10, menudeGizli: true },
] as const satisfies readonly SayfaTanimi[];
