import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Istasyon } from './Istasyon.tsx';
import { Izleme } from './Izleme.tsx';
import { Tanimlar } from './Tanimlar.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/markalama', ekran: Tanimlar },
  { yol: '/markalama/istasyon', ekran: Istasyon },
  { yol: '/markalama/izleme', ekran: Izleme },
];
