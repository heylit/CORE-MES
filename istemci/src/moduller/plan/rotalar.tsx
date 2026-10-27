import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { YeniEkranKapisi } from '../../ortak/rota/yeni-ekran.tsx';
import { PlanlamaEskiCercevesi } from '../recete-rota/disari.ts';
import { PLANLAMA_ROTALARI } from './planlama/yollar.ts';
import { VERI_SAGLIGI_YOLU, VeriSagligi } from './veri-sagligi/VeriSagligi.tsx';

// Planlama sayfası (658 b, 659 a): görünümler yeni ekrandadır; eski çerçeve bir süre `/plan/eski/<görünüm>` adresinde yalnız yöneticide
// açılır ve kişi menüsündeki "Eski görünüm" ile gelir. Eski çerçeve kalkınca son iki satır silinir.
function PlanlamaEski() {
  return <YeniEkranKapisi><PlanlamaEskiCercevesi /></YeniEkranKapisi>;
}

export const rotalar: ModulRotasi[] = [
  { yol: VERI_SAGLIGI_YOLU, ekran: VeriSagligi },
  ...PLANLAMA_ROTALARI,
  { yol: '/plan/eski', ekran: PlanlamaEski },
  { yol: '/plan/eski/:gorunum', ekran: PlanlamaEski },
];
