import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { Projeler } from './Projeler.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/projeler', ekran: Projeler },
  { yol: '/projeler/:id', ekran: ProjeAyrinti },
];
