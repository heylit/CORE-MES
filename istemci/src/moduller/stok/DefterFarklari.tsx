// Defter farkları (1692 a): gece karşılaştırmasında bakiyesi hareket defteriyle tutmayan eksenler. Ekran düzeltmez, gösterir;
// düzeltme sayım ya da geri almayla, hareketle yapılır.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DefterFarki, DefterFarklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, SayfaBasi } from './ortak.tsx';
import './stok.css';

const farkMetni = (f: DefterFarki): string => {
  const d = Number(f.bakiye) - Number(f.defter);
  return `${d > 0 ? '+' : ''}${miktarMetni(d.toFixed(3))}`;
};

export function DefterFarklari() {
  const liste = useQuery({ queryKey: anahtarlar.liste('defter-farklari', {}), queryFn: () => api.get<DefterFarklariCevabi>('/stok/defter-farklari') });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />;
  const { karsilastirma, farklar } = liste.data;
  const sutunlar: Sutun<DefterFarki>[] = [
    { anahtar: 'konum', baslik: 'Konum', mono: true, sabit: 'sol', hucre: (f) => <Link to={`/stok/konumlar/${f.konumId}`}>{f.konumKod ?? `Konum ${f.konumId}`}</Link>, csv: (f) => f.konumKod ?? `Konum ${f.konumId}` },
    { anahtar: 'malzeme', baslik: 'Malzeme', kes: true, hucre: (f) => <Link to={`/stok/malzemeler/${f.malzemeId}`}>{f.malzemeAd ?? `Kart ${f.malzemeId}`}</Link>, csv: (f) => f.malzemeAd ?? `Kart ${f.malzemeId}` },
    { anahtar: 'parti', baslik: 'Parti', hucre: (f) => f.lotNo ?? 'Partisiz' },
    { anahtar: 'durum', baslik: 'Durum', hucre: (f) => f.kaliteDurumu },
    { anahtar: 'statu', baslik: 'Statü', hucre: (f) => (f.statuId === null ? '—' : `Statü ${f.statuId}`) },
    { anahtar: 'bakiye', baslik: 'Bakiye', hizala: 'sag', hucre: (f) => miktarMetni(f.bakiye) },
    { anahtar: 'defter', baslik: 'Defter', hizala: 'sag', hucre: (f) => miktarMetni(f.defter) },
    { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', hucre: (f) => <strong>{farkMetni(f)}</strong> },
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Defter farkları" aciklama="Her gece bakiye, hareket defterinin toplamıyla karşılaştırılır. Fark burada görünür; düzeltme sayım ya da geri almayla yapılır." />
      <Kart baslik={karsilastirma === null ? 'Henüz karşılaştırma yapılmadı' : `Son karşılaştırma · ${zamanMetni(karsilastirma.zaman)}`}>
        {karsilastirma !== null && (karsilastirma.farkSayisi === 0
          ? <Rozet ton="tamam">Bakiye defterle tutuyor</Rozet>
          : <Rozet ton="uyari">{`${karsilastirma.farkSayisi} eksende fark var`}</Rozet>)}
        <Tablo etiket="Bakiye ve defter farkları" kip="kaydir" sutunlar={sutunlar} satirlar={farklar} satirAnahtari={(f) => `${f.malzemeId}-${f.konumId}-${f.partiId ?? 0}-${f.statuId ?? 0}-${f.kaliteDurumu}`}
          bosMesaj={karsilastirma === null ? 'İlk karşılaştırma gece yapılacak.' : 'Fark yok.'} />
      </Kart>
    </section>
  );
}
