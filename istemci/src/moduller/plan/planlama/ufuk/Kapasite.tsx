import { Suspense, lazy, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DurumKutusu, Sekmeler } from '../../../../ortak/arayuz/index.ts';
import { KAPASITE_BOLUMLERI, kapasiteBolumuOku, type KapasiteBolumu, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { Ufuk } from './Ufuk.tsx';
import { YillikPlan } from './YillikPlan.tsx';

// Kapasite (3038): ek mesai, fason, ufuk ve yıllık plan tek sayfadır; açılışta yük haritası (grup x hafta), hücreye basınca o haftanın
// işleri ve ek mesai / fason bölümüne geçiş. Bölümler eski sayfaların kendisidir, yalnız yerleri değişti; bölüm adresin sorgusundadır.
const EkMesaiPlani = lazy(async () => ({ default: (await import('../maliyet/index.tsx')).EkMesaiPlani as ComponentType<PlanlamaEkranOzellikleri> }));
const FasonPlani = lazy(async () => ({ default: (await import('../maliyet/index.tsx')).FasonPlani as ComponentType<PlanlamaEkranOzellikleri> }));

const BOLUM: Record<KapasiteBolumu, ComponentType<PlanlamaEkranOzellikleri>> = { ufuk: Ufuk, mesaiplan: EkMesaiPlani, fasonplan: FasonPlani, yillik: YillikPlan };

export function Kapasite(o: PlanlamaEkranOzellikleri) {
  const [sorgu] = useSearchParams();
  const bolum = kapasiteBolumuOku(sorgu);
  const Bolum = BOLUM[bolum];
  return (
    <div className="tc-pyu-kapasite" data-bolum={bolum}>
      <Sekmeler etiket="Kapasite bölümleri" secili={bolum} sec={(b) => { o.git(b); }}
        sekmeler={KAPASITE_BOLUMLERI.map(([anahtar, baslik, simge]) => ({ anahtar, baslik, simge }))} />
      <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
        <Bolum {...o} />
      </Suspense>
    </div>
  );
}
