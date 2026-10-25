import type { IkEkrani } from '../gorunumler.ts';
import { AdayEkrani } from './Aday.tsx';
import { EgitimEkrani } from './Egitim.tsx';
import { IseAlimEkrani } from './IseAlim.tsx';
import { PerformansEkrani } from './Performans.tsx';
import { PozisyonEkrani } from './Pozisyon.tsx';
import './isealim.css';

// P4 bu klasörü sahiplenir (PARCA-SOZLESMESI.md); adlar gorunumler.ts'te sabittir.
export const Performans: IkEkrani = PerformansEkrani;
export const Egitim: IkEkrani = EgitimEkrani;
export const IseAlim: IkEkrani = IseAlimEkrani;
export const Aday: IkEkrani = AdayEkrani;
export const Pozisyon: IkEkrani = PozisyonEkrani;

// Parçalar arası (P1 "Yerine pozisyon aç"): pozisyon formu ön dolu açılır.
export { PozisyonFormu, type PozisyonFormuOzellikleri } from './formlar.tsx';
