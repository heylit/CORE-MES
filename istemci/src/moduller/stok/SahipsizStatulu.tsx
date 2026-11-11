// Sahipsiz statülü stok (2547 a, B-2482-12): statüde durup açık hiçbir emre ayrılmamış malzeme. Rezervesi kaldırılan ya da emri kapanan
// statülü stok buradadır; aynı ürün ve OP'nin herhangi bir emri kullanabilir. Ekran gösterir; ayırma ve kaldırma malzeme ayrıntısındadır.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SahipsizStatuluCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni } from './gorunum.ts';
import { hataMetni, KaliteRozeti, SayfaBasi } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

type Satir = SahipsizStatuluCevabi['satirlar'][number];

export function SahipsizStatulu() {
  const statuAdi = useStatuAdi();
  const liste = useQuery({ queryKey: anahtarlar.liste('sahipsiz-statulu', {}), queryFn: () => api.get<SahipsizStatuluCevabi>('/stok/sahipsiz-statulu') });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />;
  const { satirlar } = liste.data;
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', kes: true, hucre: (s) => <Link to={`/stok/malzemeler/${s.malzemeId}`}>{s.malzemeAd ?? `Kart ${s.malzemeId}`}</Link>, csv: (s) => s.malzemeAd ?? `Kart ${s.malzemeId}` },
    { anahtar: 'kod', baslik: 'Stok kodu', mono: true, hucre: (s) => s.malzemeKod ?? '—' },
    { anahtar: 'statu', baslik: 'Statü', hucre: (s) => <><Rozet ton="bilgi">{statuAdi(s.statuId)}</Rozet> <KaliteRozeti durum={s.kaliteDurumu} /></>, csv: (s) => statuAdi(s.statuId) },
    { anahtar: 'konum', baslik: 'Konum', kes: true, hucre: (s) => (s.konumlar.length === 0 ? '—' : s.konumlar.join(', ')) },
    { anahtar: 'miktar', baslik: 'Statüde', hizala: 'sag', hucre: (s) => miktarMetni(s.miktar) },
    { anahtar: 'ayrilan', baslik: 'Emre ayrılan', hizala: 'sag', hucre: (s) => miktarMetni(s.ayrilan) },
    { anahtar: 'sahipsiz', baslik: 'Sahipsiz', hizala: 'sag', hucre: (s) => <strong>{miktarMetni(s.sahipsiz)}</strong> },
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Sahipsiz statülü stok" alt="Statüde duran ama açık hiçbir emre ayrılmamış malzeme. Aynı ürün ve OP'nin herhangi bir emri kullanabilir; bir emre ayırmak için malzeme ayrıntısında Rezerve et. Red stok burada görünmez; plan karar bekleyeni saymaz." />
      <Kart baslik={satirlar.length === 0 ? 'Sahipsiz statülü stok yok' : `${satirlar.length} satır sahipsiz`}>
        {satirlar.length > 0 && <Rozet ton="uyari">Plan bu stoğu bir emrin zincirinde görmez</Rozet>}
        <Tablo etiket="Sahipsiz statülü stok" kip="kaydir" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => `${s.malzemeId}-${s.statuId}-${s.kaliteDurumu}`}
          bosMesaj="Statüdeki bütün stok açık emirlere ayrılı." />
      </Kart>
    </section>
  );
}
