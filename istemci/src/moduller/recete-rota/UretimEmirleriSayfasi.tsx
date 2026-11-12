import { lazy, Suspense } from 'react';
import { EmirAyrintisi, UretimEmirleri } from '../uretim-emirleri/disari.ts';
import { useEmirAcabilir, useRrYetkisi } from './yeni/yetki.ts';
import type { SatirEki } from './yeni/emirler/UretimEmirleriIcin.tsx';

// Üretim emrinin ana yeri Üretim Emirleri'dir (3003 a). Liste ve ayrıntı ekranı Üretim Emirleri modülünündür; açma penceresi, Excel ve emrin
// plan ve işlemleri bu modülün köprüsüyle çalışır. Üretim Emirleri alt kattadır (ADR 0006): bu parçaları ona burada parametre olarak
// veririz, o bu modülü tanımaz. Parçalar ilk kullanımda indirilir; izleyen kişinin açılışı ağırlaşmaz.
const parcalar = () => import('./yeni/emirler/UretimEmirleriIcin.tsx');
const EmirAlani = lazy(async () => ({ default: (await parcalar()).EmirAlani }));
const YeniEmirPenceresi = lazy(async () => ({ default: (await parcalar()).YeniEmirPenceresi }));
const EmirExcelDugmesi = lazy(async () => ({ default: (await parcalar()).EmirExcelDugmesi }));
const EmirParcasi = lazy(async () => ({ default: (await parcalar()).EmirParcasi }));

export function UretimEmirleriSayfasi() {
  const acabilir = useEmirAcabilir();
  return (
    <UretimEmirleri emirAcma={{
      acabilir,
      ciz: (yeni, kapat) => (
        <Suspense fallback={null}>
          <EmirAlani>
            <EmirExcelDugmesi />
            <YeniEmirPenceresi acik={yeni !== null} kapat={kapat} ilkUrun={yeni?.urun ?? null} />
          </EmirAlani>
        </Suspense>
      ),
    }} />
  );
}

// Emir sayfası (3039): başlıktaki işlemler, "Adımlar" ve "Malzeme" sekmeleri bu modülün köprüsüyle çizilir; sayfa başına tek köprü.
// Reçete ve Rota'yı okuyamayan kişi Üretim Emirleri'nin kendi adım ilerlemesini görür.
export function EmirAyrintiSayfasi() {
  const oku = useRrYetkisi().oku;
  const parca = (kayitNo: number, tur: 'islemler' | 'adimlar' | 'malzeme', satirEki?: SatirEki) => <EmirParcasi kayitNo={kayitNo} parca={tur} satirEki={satirEki} />;
  return (
    <EmirAyrintisi parcalar={oku ? {
      sar: (icerik) => <Suspense fallback={null}><EmirAlani>{icerik}</EmirAlani></Suspense>,
      islemler: (id) => parca(id, 'islemler'),
      adimlar: (id, ek) => parca(id, 'adimlar', ek),
      malzeme: (id) => parca(id, 'malzeme'),
    } : undefined} />
  );
}
