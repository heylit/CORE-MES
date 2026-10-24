import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P5 (Yıllık plan ve ufuk): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir; iskelet yer tutucu koyar, parça bu dosyayı ve
// klasörü sahiplenir.

export function YillikPlan(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Yıllık plan" />; }
export function Ufuk(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Ufuk" />; }
