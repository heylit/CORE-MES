import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Istasyon360, KaynakSec, Kisi360, Makine360 } from './Kaynak360.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/kaynak-izi', ekran: KaynakSec },
  { yol: '/kaynak-izi/istasyon/:id', ekran: Istasyon360 },
  { yol: '/kaynak-izi/makine/:id', ekran: Makine360 },
  { yol: '/kaynak-izi/kisi/:id', ekran: Kisi360 },
];
