import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { Projeler } from './Projeler.tsx';
import { StatuListesi } from './StatuListesi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/projeler', ekran: Projeler },
  // Sabit yol, :id'den önce eşleşmeli.
  { yol: '/projeler/statuler', ekran: StatuListesi },
  { yol: '/projeler/:id', ekran: ProjeAyrinti },
];
