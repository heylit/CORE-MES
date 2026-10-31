import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../ortak/YerTutucu.tsx';
import type { Personel } from '../tipler.ts';

// Kişi sayfasının açtığı bordro parçaları; imzalar P1'in istediğidir (personel/baska-parcalar.tsx).
export const BordroTahmini = (_o: { o: IkEkranOzellikleri; personel: Personel; ay: string }) => <YerTutucu />;
export const TazminatHesabi = (_o: { o: IkEkranOzellikleri; personel: Personel; cikis: string }) => <YerTutucu />;
export const TazminatDokumu = ({ kapat }: { o: IkEkranOzellikleri; personel: Personel; cikis: string; kapat: () => void }) =>
  <Pencere acik baslik="Tazminat hesap dökümü" kapat={kapat} tur="yan"><YerTutucu /></Pencere>;
export const BordroPusulasi = ({ kapat }: { o: IkEkranOzellikleri; personel: Personel; ay: string; kapat: () => void }) =>
  <Pencere acik baslik="Bordro pusulası" kapat={kapat} tur="yan"><YerTutucu /></Pencere>;
