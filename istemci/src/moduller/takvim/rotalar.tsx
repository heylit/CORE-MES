import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Takvim, TakvimKanban, TakvimTablo } from './Takvim.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/takvim', ekran: Takvim },
  { yol: '/takvim/tablo', ekran: TakvimTablo },
  { yol: '/takvim/kanban', ekran: TakvimKanban },
];
