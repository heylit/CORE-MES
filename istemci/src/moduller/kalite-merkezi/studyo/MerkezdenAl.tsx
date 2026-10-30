import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KmMerkezBelgesi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { DurumKutusu, Girdi, Pencere, Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useMerkezBelgeleri } from './veri.ts';

const BICIM_ADI: Record<KmMerkezBelgesi['bicim'], string> = { pdf: 'PDF', step: 'STEP', stl: 'STL', iges: 'IGES' };

// Arkon'un "Çizim Merkezi'nden ekle" seçicisi (cizim/Merkez.tsx MerkezSecici): yayındaki PDF ve 3B modeller, adla arama. İçerik kopyalanmaz,
// parçaya belge ve revizyon bağı alınır. Stüdyodaki parçanın kartına Çizim Merkezi'nde bağlı belgeler başta ve işaretli gelir (1306).
export function MerkezdenAl({ acik, kapat, al, alinan }: {
  acik: boolean; kapat: () => void; al: (b: KmMerkezBelgesi) => void; alinan: number | null;
}) {
  const [ara, araYaz] = useState('');
  const [gecikmeli, gecikmeliYaz] = useState('');
  useEffect(() => { const t = setTimeout(() => { gecikmeliYaz(ara.trim()); }, 250); return () => { clearTimeout(t); }; }, [ara]);
  const [adres] = useSearchParams();
  const liste = useMerkezBelgeleri(gecikmeli, acik, Number(adres.get('parca')) || null);
  const belgeler = liste.data?.belgeler ?? [];
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Belge merkezinden resim al">
      <div className="km-st-secici">
        <p className="km-st-soluk">Yalnız yayındaki PDF ve 3B modeller listelenir. Resim kopyalanmaz; parçaya yayındaki revizyon bağlanır.</p>
        <Girdi etiket="Belge ara" value={ara} onChange={(e) => { araYaz(e.target.value); }} placeholder="Belge adı ile ara" />
        {liste.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Belge listesi alınamadı')} yenile={() => { void liste.refetch(); }} />
          : liste.isPending ? <DurumKutusu durum="yukleniyor" />
            : belgeler.length ? (
              <ul className="km-st-liste" aria-label="Yayındaki belgeler">{belgeler.map((b) => (
                <li key={b.id}>
                  <button type="button" className="km-st-belge" disabled={alinan !== null} onClick={() => { al(b); }}>
                    <span className={`km-st-tur km-st-tur-${b.tur}`}><Simge ad={b.tur === 'resim' ? 'file' : 'cube'} boyut="k" /></span>
                    <span className="km-st-belge-ad"><b>{b.ad}</b><small>{[BICIM_ADI[b.bicim], b.harf ? `Rev ${b.harf}` : null].filter(Boolean).join(' · ')}</small></span>
                    {b.bagli ? <Rozet ton="tamam">Parçaya bağlı</Rozet> : null}
                    <Simge ad={alinan === b.id ? 'rotate' : 'plus'} boyut="k" />
                  </button>
                </li>
              ))}</ul>
            ) : <span className="km-st-soluk">Yayında uygun belge yok.</span>}
      </div>
    </Pencere>
  );
}
