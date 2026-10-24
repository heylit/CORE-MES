import type { IkEkrani } from '../gorunumler.ts';
import { Calisan as CalisanSayfasi } from './Calisan.tsx';
import { Organizasyon as OrganizasyonSayfasi } from './Organizasyon.tsx';
import { PersonelListesi } from './PersonelListesi.tsx';

// P1 (PARCA-SOZLESMESI.md): adlar gorunumler.ts'te sabittir; parçalar arası bileşenler PersonelFormu ve CalismaBelgesi.
export const Personel: IkEkrani = PersonelListesi;
export const Calisan: IkEkrani = CalisanSayfasi;
export const Organizasyon: IkEkrani = OrganizasyonSayfasi;
export { PersonelFormu, type PersonelFormuOzellikleri } from './PersonelFormu.tsx';
export { CalismaBelgesi } from './CalismaBelgesi.tsx';
