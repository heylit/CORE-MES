import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { analizRotalari } from './analiz-rotalari.ts';
import { Degisiklikler } from './Degisiklikler.tsx';
import { EmirDetay } from './emir-detay/EmirDetay.tsx';
import { Gorevlerim } from './Gorevlerim.tsx';
import { TalepDetay } from './TalepDetay.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/degisiklik-yonetimi', ekran: Gorevlerim },
  { yol: '/degisiklik-yonetimi/degisiklikler', ekran: Degisiklikler },
  { yol: '/degisiklik-yonetimi/talepler/:id', ekran: TalepDetay },
  { yol: '/degisiklik-yonetimi/emirler/:id', ekran: EmirDetay },
  ...analizRotalari,
];
