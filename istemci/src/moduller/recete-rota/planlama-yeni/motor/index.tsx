import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P1 (Planlama motoru ve atölye): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir. Atölye sonraki teslimlerle gelir (P1e, P1f).
export { PlanlamaMotoru } from './Tahta.tsx';
export function PlanlamaAtolyesi(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Planlama atölyesi" />; }
