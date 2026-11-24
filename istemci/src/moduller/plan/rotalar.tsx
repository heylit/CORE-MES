import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PLAN_ANALIZI_YOLU, PlanAnalizi } from './analiz/PlanAnalizi.tsx';
import { MOTOR_AYARLARI_YOLU, MotorAyarlariYonlendirme } from './motor-ayarlari/MotorAyarlari.tsx';
import { MRP_YOLU, MrpYonlendirme } from './mrp/MrpYonlendirme.tsx';
import { PLAN_SAGLIGI_YOLU, PlanSagligi } from './plan-sagligi/PlanSagligi.tsx';
import { PLANLAMA_ROTALARI } from './planlama/yollar.ts';
import { VERI_SAGLIGI_YOLU, VeriSagligi } from './veri-sagligi/VeriSagligi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: VERI_SAGLIGI_YOLU, ekran: VeriSagligi },
  { yol: PLAN_SAGLIGI_YOLU, ekran: PlanSagligi },
  { yol: PLAN_ANALIZI_YOLU, ekran: PlanAnalizi },
  { yol: MRP_YOLU, ekran: MrpYonlendirme },
  { yol: MOTOR_AYARLARI_YOLU, ekran: MotorAyarlariYonlendirme },
  ...PLANLAMA_ROTALARI,
];
