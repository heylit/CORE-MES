import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { YerTutucu } from '../ortak/YerTutucu.tsx';
import type { Devam, Izin } from '../tipler.ts';

// Kişi sayfasının açtığı, başka parçaların bileşenleri (PARCA-ISTEKLERI.md; imzalar P2'nin cevabından). Sahibi yazana kadar
// burada yer tutucu durur; birleştirmede bu dosya yalnız yeniden dışa vermeye döner:
//   export { IzinFormu, DevamFormu, IzinTablosu, KisiPuantajTakvimi } from '../izin-devam/index.tsx'; (P2)

export interface IzinFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Izin | null; onDolu: Partial<Izin>; kapat: () => void }
export interface DevamFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Devam | null; onDolu: Partial<Devam>; kapat: () => void }

function PencereYeri({ acik, baslik, kapat }: { acik: boolean; baslik: string; kapat: () => void }) {
  return <Pencere acik={acik} baslik={baslik} kapat={kapat} tur="yan"><YerTutucu /></Pencere>;
}

export const IzinFormu = ({ acik, kayit, kapat }: IzinFormuOzellikleri) => <PencereYeri acik={acik} kapat={kapat} baslik={kayit ? 'İzin düzenle' : 'Yeni izin'} />;
export const DevamFormu = ({ acik, kayit, kapat }: DevamFormuOzellikleri) => <PencereYeri acik={acik} kapat={kapat} baslik={kayit ? 'Kaydı düzenle' : 'Yeni devam ve mesai kaydı'} />;
export const IzinTablosu = (_o: { o: IkEkranOzellikleri; izinler: readonly Izin[]; kisiSutunu: boolean }) => <YerTutucu />;
export const KisiPuantajTakvimi = (_o: { o: IkEkranOzellikleri; personel: string; ay: string; saltOkunur?: boolean }) => <YerTutucu />;
export { BordroPusulasi, BordroTahmini, TazminatDokumu, TazminatHesabi } from '../bordro/index.tsx';
export { PerformansFormu, type PerformansFormuOzellikleri } from '../isealim/index.tsx';
