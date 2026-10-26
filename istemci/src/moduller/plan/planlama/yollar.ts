import type { ModulRotasi } from '../../../ortak/rota/kesif.ts';
import { KOK } from './gorunumler.ts';
import { PlanlamaYeni } from './PlanlamaYeni.tsx';

// Planlama sayfasının görünümleri (658 b, 659 a); modülün rotalar.tsx'i bu diziyi açar.
export const PLANLAMA_ROTALARI: ModulRotasi[] = [
  { yol: KOK, ekran: PlanlamaYeni },
  { yol: `${KOK}/:gorunum`, ekran: PlanlamaYeni },
];
