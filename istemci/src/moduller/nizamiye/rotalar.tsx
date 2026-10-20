import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AcilDurum } from './AcilDurum.tsx';
import { Gecmis } from './Gecmis.tsx';
import { Habersiz } from './Habersiz.tsx';
import { Kapi } from './Kapi.tsx';
import { KartRafi } from './KartRafi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/nizamiye', ekran: Kapi },
  { yol: '/nizamiye/habersiz', ekran: Habersiz },
  { yol: '/nizamiye/kartlar', ekran: KartRafi },
  { yol: '/nizamiye/gecmis', ekran: Gecmis },
  { yol: '/nizamiye/acil-durum', ekran: AcilDurum },
];
