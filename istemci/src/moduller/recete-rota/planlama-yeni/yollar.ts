import type { ModulRotasi } from '../../../ortak/rota/kesif.ts';
import { KOK } from './gorunumler.ts';
import { PlanlamaYeni } from './PlanlamaYeni.tsx';

// TS geçişi (199 b): yeni ekran ikinci yolda, alıma kadar yalnız yöneticide (YeniEkranKapisi). Modülün rotalar.tsx'i bu diziyi açar.
export const PLANLAMA_YENI_ROTALARI: ModulRotasi[] = [
  { yol: KOK, ekran: PlanlamaYeni },
  { yol: `${KOK}/:gorunum`, ekran: PlanlamaYeni },
];
