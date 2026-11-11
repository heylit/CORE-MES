import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { KapanisOnaylari } from './KapanisOnaylari.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/uretim-emirleri', ekran: UretimEmirleri },
  // Adım Durumu (2893-5 a): ana menüde ayrı sayfa, ekranı bu modülde.
  { yol: '/adim-durumu', ekran: AdimDurumu },
  { yol: '/uretim-emirleri/kapanis', ekran: KapanisOnaylari },
  { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi },
];
