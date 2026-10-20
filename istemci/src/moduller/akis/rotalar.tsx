import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AkisEmirleri, EmirYolculugu } from './Akis.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/akis', ekran: AkisEmirleri },
  { yol: '/akis/:id', ekran: EmirYolculugu },
];
