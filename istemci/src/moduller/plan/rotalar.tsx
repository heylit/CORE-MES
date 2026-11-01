import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { MOTOR_AYARLARI_YOLU, MotorAyarlari } from './motor-ayarlari/MotorAyarlari.tsx';
import { PLAN_SAGLIGI_YOLU, PlanSagligi } from './plan-sagligi/PlanSagligi.tsx';
import { PLANLAMA_ROTALARI } from './planlama/yollar.ts';
import { VERI_SAGLIGI_YOLU, VeriSagligi } from './veri-sagligi/VeriSagligi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: VERI_SAGLIGI_YOLU, ekran: VeriSagligi },
  { yol: PLAN_SAGLIGI_YOLU, ekran: PlanSagligi },
  { yol: MOTOR_AYARLARI_YOLU, ekran: MotorAyarlari },
  ...PLANLAMA_ROTALARI,
];
