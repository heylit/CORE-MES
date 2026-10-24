import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P6 (Sevkiyat): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir; iskelet yer tutucu koyar, parça bu dosyayı ve
// klasörü sahiplenir.

export function Sevkiyat(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Sevkiyat" />; }
