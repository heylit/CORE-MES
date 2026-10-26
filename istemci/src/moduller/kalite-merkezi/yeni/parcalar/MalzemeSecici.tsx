import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KmParcaKaynagi, KmParcaKaynaklariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { DurumKutusu, Girdi, Pencere, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { parcaKaynagiAnahtari } from './kaynak.ts';

const SUTUNLAR: readonly Sutun<KmParcaKaynagi>[] = [
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, kirilmaz: true, hucre: (m) => m.kod },
  { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.ad ?? '—' },
];

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  sec: (kart: KmParcaKaynagi) => void;
}

// 592 B2 a: parça Malzemeler kartıdır; yalnız aktif mamul, yarı mamul ve ticari mal kartları gelir.
export function MalzemeSecici({ acik, kapat, sec }: Ozellikler) {
  const [metin, metinYaz] = useState('');
  const q = metin.trim();
  const liste = useQuery({
    queryKey: parcaKaynagiAnahtari(`ara:${q}`),
    queryFn: () => api.get<KmParcaKaynaklariCevabi>(`/kalite-merkezi/parca-kaynaklari${q ? `?ara=${encodeURIComponent(q)}` : ''}`),
    enabled: acik,
  });
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Malzeme kartı seç" tur="yan">
      <div className="tc-km1-sekme-ic">
        <Girdi etiket="Kart ara" type="search" value={metin} onChange={(o) => metinYaz(o.target.value)} placeholder="Stok kodu ya da ad" autoComplete="off" />
        <p className="tc-km1-kucuk tc-km1-soluk">Parça numarası ve adı Malzemeler kartından gelir; kart orada açılır.</p>
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Kartlar alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : (
          <Tablo
            etiket="Malzeme kartları" sutunlar={SUTUNLAR} satirlar={liste.data?.parcalar ?? []} satirAnahtari={(m) => m.malzemeNo}
            satirSec={sec} mesgul={liste.isPending} bosMesaj={liste.isPending ? 'Yükleniyor' : 'Kart bulunamadı.'}
          />
        )}
      </div>
    </Pencere>
  );
}
