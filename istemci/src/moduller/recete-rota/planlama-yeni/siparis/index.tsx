import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P2 (Siparişler, terminler, termin ve kâr): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir; iskelet yer tutucu koyar, parça bu dosyayı ve
// klasörü sahiplenir.

export function Siparisler(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Siparişler" />; }
export function Terminler(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Terminler" />; }
export function TerminVeKar(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Termin ve kâr" />; }
