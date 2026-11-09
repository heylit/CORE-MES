import type { ComponentType } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PlanAnalizi } from './analiz/PlanAnalizi.tsx';
import { MOTOR_AYARLARI_YOLU, MotorAyarlari } from './motor-ayarlari/MotorAyarlari.tsx';
import { Mrp } from './mrp/Mrp.tsx';
import { PlanSagligi } from './plan-sagligi/PlanSagligi.tsx';
import { PLANLAMA_ROTALARI } from './planlama/yollar.ts';
import { ESKI_SAYFA_ADRESLERI, SAYFA_AILELERI, SayfaSekmeleri, type SayfaAilesiAdi } from './sayfa-sekmeleri.tsx';
import { VeriSagligi } from './veri-sagligi/VeriSagligi.tsx';

// Planlama sayfasının dışındaki rapor sayfaları birleşen sayfanın sekmesidir (2538 b); şerit sayfanın üstündedir.
const sekmeli = (aile: SayfaAilesiAdi, Ekran: ComponentType): ComponentType => function SekmeliSayfa() {
  return <><SayfaSekmeleri aile={aile} /><Ekran /></>;
};
const yonlen = (hedef: string): ComponentType => function EskiAdres() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: hedef, search }} replace />;
};
const [analiz, planSagligi, veriSagligi] = SAYFA_AILELERI.analiz.sekmeler;
const ihtiyac = SAYFA_AILELERI.malzeme.sekmeler[1];

export const rotalar: ModulRotasi[] = [
  { yol: analiz.yol, ekran: sekmeli('analiz', PlanAnalizi) },
  { yol: planSagligi.yol, ekran: sekmeli('analiz', PlanSagligi) },
  { yol: veriSagligi.yol, ekran: sekmeli('analiz', VeriSagligi) },
  { yol: ihtiyac.yol, ekran: sekmeli('malzeme', Mrp) },
  ...Object.entries(ESKI_SAYFA_ADRESLERI).map(([eski, yeni]) => ({ yol: eski, ekran: yonlen(yeni) })),
  { yol: MOTOR_AYARLARI_YOLU, ekran: MotorAyarlari },
  ...PLANLAMA_ROTALARI,
];
