import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AletTurleri, OlcuAletleri } from './OlcuAletleri.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/kalibrasyon', ekran: OlcuAletleri },
  { yol: '/kalibrasyon/turler', ekran: AletTurleri },
];
