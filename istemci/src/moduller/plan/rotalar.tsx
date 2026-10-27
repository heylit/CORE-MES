import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PLANLAMA_ROTALARI } from './planlama/yollar.ts';
import { VERI_SAGLIGI_YOLU, VeriSagligi } from './veri-sagligi/VeriSagligi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: VERI_SAGLIGI_YOLU, ekran: VeriSagligi },
  ...PLANLAMA_ROTALARI,
];
