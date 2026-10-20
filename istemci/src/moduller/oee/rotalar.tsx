import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Oee, OeeMakineler } from './Oee.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/oee', ekran: Oee },
  { yol: '/oee/makineler', ekran: OeeMakineler },
];
