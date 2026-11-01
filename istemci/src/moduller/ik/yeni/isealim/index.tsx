import type { IkEkrani } from '../gorunumler.ts';
import { AdaySayfasi } from './Aday.tsx';
import { EgitimSayfasi } from './Egitim.tsx';
import { IseAlimSayfasi } from './IseAlim.tsx';
import { PerformansSayfasi } from './Performans.tsx';
import { PozisyonSayfasi } from './Pozisyon.tsx';

// P4 bu klasörü sahiplenir (PARCA-SOZLESMESI.md); adlar gorunumler.ts'te sabittir.
export const Performans: IkEkrani = PerformansSayfasi;
export const Egitim: IkEkrani = EgitimSayfasi;
export const IseAlim: IkEkrani = IseAlimSayfasi;
export const Aday: IkEkrani = AdaySayfasi;
export const Pozisyon: IkEkrani = PozisyonSayfasi;

// Parçalar arası: P1 "Yerine pozisyon aç" pozisyon formunu, çalışan sayfası performans formunu ön dolu açar.
export { PozisyonFormu, PerformansFormu, type PozisyonFormuOzellikleri, type PerformansFormuOzellikleri } from './formlar.tsx';
