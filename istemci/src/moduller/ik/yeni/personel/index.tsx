import { YerTutucu } from '../ortak/YerTutucu.tsx';
import type { IkEkrani } from '../gorunumler.ts';
import type { Personel as PersonelKaydi } from '../tipler.ts';

// P1 bu klasörü sahiplenir (PARCA-SOZLESMESI.md); adlar gorunumler.ts'te sabittir.
export const Personel: IkEkrani = () => <YerTutucu />;
export const Calisan: IkEkrani = () => <YerTutucu />;
export const Organizasyon: IkEkrani = () => <YerTutucu />;

// Parçalar arası (P4 "İşe al"): personel formu ön dolu açılır; kayıttan sonra kaydedilen personel döner.
export interface PersonelFormuOzellikleri { acik: boolean; onDolu: Partial<PersonelKaydi>; kapat: () => void; kaydedildi: (p: PersonelKaydi) => void }
export const PersonelFormu = (_o: PersonelFormuOzellikleri) => null;
