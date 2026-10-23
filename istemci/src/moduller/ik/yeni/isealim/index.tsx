import { YerTutucu } from '../ortak/YerTutucu.tsx';
import type { IkEkrani } from '../gorunumler.ts';
import type { Pozisyon as PozisyonKaydi } from '../tipler.ts';

// P4 bu klasörü sahiplenir (PARCA-SOZLESMESI.md); adlar gorunumler.ts'te sabittir.
export const Performans: IkEkrani = () => <YerTutucu />;
export const Egitim: IkEkrani = () => <YerTutucu />;
export const IseAlim: IkEkrani = () => <YerTutucu />;
export const Aday: IkEkrani = () => <YerTutucu />;
export const Pozisyon: IkEkrani = () => <YerTutucu />;

// Parçalar arası (P1 "Yerine pozisyon aç"): pozisyon formu ön dolu açılır.
export interface PozisyonFormuOzellikleri { acik: boolean; onDolu: Partial<PozisyonKaydi>; kapat: () => void; kaydedildi?: (j: PozisyonKaydi) => void }
export const PozisyonFormu = (_o: PozisyonFormuOzellikleri) => null;
