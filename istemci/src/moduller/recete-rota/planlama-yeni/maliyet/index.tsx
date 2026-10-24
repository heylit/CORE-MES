import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P3 (Maliyet, genel gider, ek mesai ve fason): parçanın giriş dosyası. Bileşen adları ve imzası PARCA-SOZLESMESI.md'dedir; iskelet yer tutucu koyar, parça bu dosyayı ve
// klasörü sahiplenir.

export function Maliyetler(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Maliyetler" />; }
export function GenelGider(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Genel gider" />; }
export function EkMesaiPlani(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Ek mesai planı" />; }
export function FasonPlani(_o: PlanlamaEkranOzellikleri) { return <YerTutucu ad="Fason planı" />; }
