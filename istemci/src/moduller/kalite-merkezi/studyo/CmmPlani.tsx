import type { KmCmmPlanSatiri } from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { Dugme, DurumKutusu, Pencere, Rozet, Tablo, type Sutun } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useCmmPlani } from './veri.ts';

// CMM-2 ölçüm planı raporu (1439 a): CMM programcısına balonlardan iş listesi. Özellik ve nokta sayısı öneridir; hizalama ve prob seçimi
// geometri ister, programcıya kalır. Yazdırılır.
const SUTUNLAR: Sutun<KmCmmPlanSatiri>[] = [
  { anahtar: 'no', baslik: 'Balon', hucre: (s) => s.no, hizala: 'sag', mono: true },
  { anahtar: 'nominal', baslik: 'Nominal', hucre: (s) => s.nominal, mono: true },
  { anahtar: 'sinir', baslik: 'Sınır', hucre: (s) => (s.alt !== null && s.ust !== null ? `${s.alt} – ${s.ust}` : s.tolerans ?? '—'), mono: true, kirilmaz: true },
  { anahtar: 'ozellik', baslik: 'Ölçüm özelliği', hucre: (s) => s.ozellik },
  { anahtar: 'uydurma', baslik: 'Uydurma', hucre: (s) => s.uydurma ?? '—' },
  { anahtar: 'nokta', baslik: 'En az nokta', hucre: (s) => s.enAzNokta ?? '—', hizala: 'sag', mono: true },
  { anahtar: 'kritik', baslik: 'Kritik', hucre: (s) => (s.kritik ? <Rozet ton="hata">Kritik</Rozet> : '—'), csv: (s) => (s.kritik ? 'Kritik' : '') },
  { anahtar: 'not', baslik: 'Not', hucre: (s) => s.not ?? '—' },
];

export function CmmPlani({ acik, kapat, resim }: { acik: boolean; kapat: () => void; resim: KmResim }) {
  const plan = useCmmPlani(resim.id, acik);
  return (
    <Pencere acik={acik} kapat={kapat} baslik="CMM ölçüm planı" tur="yan" alt={<Dugme simge="printer" onClick={() => { window.print(); }}>Yazdır</Dugme>}>
      <div className="km-st-cmm">
        <p className="km-st-soluk">
          {resim.ad}{resim.revizyon ? ` · Rev ${resim.revizyon}` : ''}.{' '}
          {plan.data?.kapsam === 'hepsi' ? 'Resimde yöntemi CMM olan balon yok; bütün balonlar listelendi.' : 'Yöntemi CMM olan balonlar.'}{' '}
          Hizalama (datumlar) ve prob seçimi CMM programcısınındır.
        </p>
        {plan.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(plan.error, 'Plan alınamadı')} yenile={() => { void plan.refetch(); }} />
          : plan.isPending ? <DurumKutusu durum="yukleniyor" />
            : <Tablo etiket="CMM ölçüm planı" sutunlar={SUTUNLAR} satirlar={plan.data.satirlar} satirAnahtari={(s) => s.no}
              bosMesaj="Resimde balon yok." arac={{ csv: { ad: `cmm-plani-${String(resim.id)}` } }} />}
      </div>
    </Pencere>
  );
}
