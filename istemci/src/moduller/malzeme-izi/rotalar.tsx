import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Malzeme360, MalzemeSec } from './Malzeme360.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/malzeme-izi', ekran: MalzemeSec },
  { yol: '/malzeme-izi/:id', ekran: Malzeme360 },
];
