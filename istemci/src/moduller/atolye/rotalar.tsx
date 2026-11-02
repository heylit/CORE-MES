import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AtolyeHaritasi } from './AtolyeHaritasi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/atolye', ekran: AtolyeHaritasi },
  { yol: '/atolye/ikiz', ekran: AtolyeHaritasi },
  { yol: '/atolye/depo', ekran: AtolyeHaritasi },
  { yol: '/atolye/parcalar', ekran: AtolyeHaritasi },
];
