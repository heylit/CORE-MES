import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P4 (Malzeme satın alma planı): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir; iskelet yer tutucu koyar, parça bu dosyayı ve
// klasörü sahiplenir.

export function MalzemePlani(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Malzeme satın alma planı" />; }
