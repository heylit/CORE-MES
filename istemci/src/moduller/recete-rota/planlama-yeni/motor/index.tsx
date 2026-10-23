import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P1 (Planlama motoru ve atölye): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir; iskelet yer tutucu koyar, parça bu dosyayı ve
// klasörü sahiplenir.

export function PlanlamaMotoru(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Planlama motoru" />; }
export function PlanlamaAtolyesi(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Planlama atölyesi" />; }
