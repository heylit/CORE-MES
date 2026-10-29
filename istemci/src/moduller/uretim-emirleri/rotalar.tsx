import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { KapanisOnaylari } from './KapanisOnaylari.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/uretim-emirleri', ekran: UretimEmirleri },
  { yol: '/uretim-emirleri/kapanis', ekran: KapanisOnaylari },
  { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi },
];
