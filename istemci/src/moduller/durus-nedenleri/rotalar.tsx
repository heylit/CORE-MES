import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { DurusNedenleri, HurdaNedenleri } from './DurusNedenleri.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/durus-nedenleri', ekran: DurusNedenleri },
  { yol: '/durus-nedenleri/hurda', ekran: HurdaNedenleri },
];
