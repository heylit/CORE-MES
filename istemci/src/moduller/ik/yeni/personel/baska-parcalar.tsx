import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../ortak/YerTutucu.tsx';
import type { Devam, Izin, Performans, Personel } from '../tipler.ts';

// Kişi sayfasının açtığı, başka parçaların bileşenleri (PARCA-ISTEKLERI.md; imzalar P2'nin cevabından). Sahibi yazana kadar
// burada yer tutucu durur; birleştirmede bu dosya yalnız yeniden dışa vermeye döner:
//   export { IzinFormu, DevamFormu, IzinTablosu, KisiPuantajTakvimi } from '../izin-devam/index.tsx'; (P2)
//   export { BordroTahmini, TazminatHesabi, TazminatDokumu, BordroPusulasi } from '../bordro/index.tsx'; (P3)
//   export { PerformansFormu } from '../isealim/index.tsx'; (P4)

export interface IzinFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Izin | null; onDolu: Partial<Izin>; kapat: () => void }
export interface DevamFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Devam | null; onDolu: Partial<Devam>; kapat: () => void }
export interface PerformansFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Performans | null; onDolu: Partial<Performans>; kapat: () => void }

function PencereYeri({ acik, baslik, kapat }: { acik: boolean; baslik: string; kapat: () => void }) {
  return <Pencere acik={acik} baslik={baslik} kapat={kapat} tur="yan"><YerTutucu /></Pencere>;
}

export const IzinFormu = ({ acik, kayit, kapat }: IzinFormuOzellikleri) => <PencereYeri acik={acik} kapat={kapat} baslik={kayit ? 'İzin düzenle' : 'Yeni izin'} />;
export const DevamFormu = ({ acik, kayit, kapat }: DevamFormuOzellikleri) => <PencereYeri acik={acik} kapat={kapat} baslik={kayit ? 'Kaydı düzenle' : 'Yeni devam ve mesai kaydı'} />;
export const PerformansFormu = ({ acik, kayit, kapat }: PerformansFormuOzellikleri) => <PencereYeri acik={acik} kapat={kapat} baslik={kayit ? 'Değerlendirmeyi düzenle' : 'Yeni değerlendirme'} />;
export const IzinTablosu = (_o: { o: IkEkranOzellikleri; izinler: readonly Izin[]; kisiSutunu: boolean }) => <YerTutucu />;
export const KisiPuantajTakvimi = (_o: { o: IkEkranOzellikleri; personel: string; ay: string; saltOkunur?: boolean }) => <YerTutucu />;
export const BordroTahmini = (_o: { o: IkEkranOzellikleri; personel: Personel; ay: string }) => <YerTutucu />;
export const TazminatHesabi = (_o: { o: IkEkranOzellikleri; personel: Personel; cikis: string }) => <YerTutucu />;
export const TazminatDokumu = ({ kapat }: { o: IkEkranOzellikleri; personel: Personel; cikis: string; kapat: () => void }) => <PencereYeri acik baslik="Tazminat hesap dökümü" kapat={kapat} />;
export const BordroPusulasi = ({ kapat }: { o: IkEkranOzellikleri; personel: Personel; ay: string; kapat: () => void }) => <PencereYeri acik baslik="Bordro pusulası" kapat={kapat} />;
