import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { KucukResim } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { BitenEmirlerCevabi, EmirDurumu, IzlemeEmri, IzlemeListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Secim, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { KucukResimKutusu, useKucukResimler } from '../belge-merkezi/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, durumGosterimi, saglamSayisi, zamanMetni } from './gorunum.ts';
import './uretim-emirleri.css';

type Gorunum = 'acik' | 'bitenler';
// Açık liste bitmiş ve iptal emri getirmez; onlar "Bitenler"de sayfa sayfa gelir (kart #1323).
const KAPALI: readonly EmirDurumu[] = ['bitti', 'iptal'];
const durumSecenekleri = (g: Gorunum) => [
  { deger: '', baslik: g === 'acik' ? 'Bütün açık emirler' : 'Bütün biten emirler' },
  ...(Object.entries(DURUM_ETIKETI) as [EmirDurumu, string][])
    .filter(([d]) => KAPALI.includes(d) === (g === 'bitenler'))
    .map(([deger, baslik]) => ({ deger, baslik })),
];
const GORUNUMLER = [{ anahtar: 'acik', baslik: 'Açık emirler', simge: 'list' }, { anahtar: 'bitenler', baslik: 'Bitenler', simge: 'check' }] as const;

// Parça adının yanında malzeme kartının küçük resmi (kart #688); resim çizim merkezinden tek istekte gelir.
const sutunlar = (resimler: ReadonlyMap<number, KucukResim>): Sutun<IzlemeEmri>[] => [
  { anahtar: 'emirNo', baslik: 'Emir no', hucre: (e) => <Link to={`/uretim-emirleri/${e.id}`} className="tc-emir-kod">{e.emirNo}</Link> },
  { anahtar: 'parcaNo', baslik: 'Parça no', hucre: (e) => e.parcaNo },
  { anahtar: 'parcaAd', baslik: 'Parça adı', hucre: (e) => (e.malzemeNo == null ? e.parcaAd : (
    <span className="tc-emir-parca">
      <KucukResimKutusu resim={resimler.get(e.malzemeNo)} ad={e.parcaAd} />
      {e.parcaAd}
    </span>
  )) },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (e) => e.adet },
  { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (e) => e.istasyon?.ad ?? 'Atanmamış' },
  { anahtar: 'durum', baslik: 'Durum', hucre: (e) => { const d = durumGosterimi(e); return <Rozet ton={d.ton}>{d.etiket}</Rozet>; } },
  { anahtar: 'saglamAdet', baslik: 'Sağlam adet', hizala: 'sag', hucre: (e) => {
      const saglam = saglamSayisi(e);
      const hurda = e.canli?.hurda ?? 0;
      if (saglam === null) return null;
      return hurda > 0 ? <>{saglam} <span className="tc-emir-hurda">(hurda {hurda})</span></> : saglam;
    } },
  { anahtar: 'acilma', baslik: 'Açılma', kirilmaz: true, hucre: (e) => zamanMetni(e.acilma) },
];

// Salt okunur izleme (kart #1185): emirler yalnız Reçete ve Rota'da açılır, plana alınır ve iptal edilir; burada listelenir.
export function UretimEmirleri() {
  const yonlendir = useNavigate();
  const oturum = useOturum();
  const receteRotaGorur = (oturum.data?.islemler ?? []).includes('sayfa.recete-rota');
  const [adres, adresYaz] = useSearchParams();
  const gorunum: Gorunum = adres.get('gorunum') === 'bitenler' ? 'bitenler' : 'acik';
  const [durum, setDurum] = useState<EmirDurumu | ''>('');
  const [sayfa, setSayfa] = useState(1);
  const araHam = (adres.get('ara') ?? '').trim();
  const ara = araHam.toLocaleLowerCase('tr-TR');
  const gorunumSec = (g: Gorunum) => {
    setDurum('');
    setSayfa(1);
    adresYaz((a) => { const y = new URLSearchParams(a); if (g === 'bitenler') y.set('gorunum', g); else y.delete('gorunum'); return y; }, { replace: true });
  };
  const liste = useQuery({
    queryKey: anahtarlar.liste(durum),
    queryFn: () => api.get<IzlemeListeCevabi>(durum === '' ? '/uretim-emirleri?istasyonsuz=1' : `/uretim-emirleri?istasyonsuz=1&durum=${durum}`),
    enabled: gorunum === 'acik',
  });
  const bitenler = useQuery({
    queryKey: anahtarlar.bitenler(durum, araHam, sayfa),
    queryFn: () => {
      const q = new URLSearchParams({ istasyonsuz: '1', sayfa: String(sayfa) });
      if (durum !== '') q.set('durum', durum);
      if (araHam !== '') q.set('ara', araHam);
      return api.get<BitenEmirlerCevabi>(`/uretim-emirleri/bitenler?${q.toString()}`);
    },
    enabled: gorunum === 'bitenler',
    placeholderData: (onceki) => onceki,
  });
  const emirler = (liste.data?.emirler ?? []).filter((e) => ara === '' || `${e.emirNo} ${e.parcaNo} ${e.parcaAd}`.toLocaleLowerCase('tr-TR').includes(ara));
  const sorgu = gorunum === 'acik' ? liste : bitenler;
  const gorunen = gorunum === 'acik' ? emirler : bitenler.data?.satirlar ?? [];
  const resimler = useKucukResimler('malzemeler', gorunen.flatMap((e) => (e.malzemeNo == null ? [] : [e.malzemeNo])));
  const SUTUNLAR = sutunlar(resimler);

  return (
    <Kart
      baslik="Üretim Emirleri"
      sag={receteRotaGorur && <Dugme simge="tool" onClick={() => { void yonlendir('/recete-rota'); }}>Reçete ve Rota'da emir aç</Dugme>}
    >
      <p className="tc-emir-sayac">Emirler Reçete ve Rota'da açılır ve yönetilir; bu sayfa yalnız izleme içindir.</p>
      <Sekmeler etiket="Liste" sekmeler={GORUNUMLER} secili={gorunum} sec={gorunumSec} />
      <div className="tc-emir-suzgec">
        <Secim etiket="Durum" secenekler={durumSecenekleri(gorunum)} value={durum}
          onChange={(e) => { setDurum(e.target.value as EmirDurumu | ''); setSayfa(1); }} />
      </div>
      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Emirler alınamadı.')} yenile={() => { void sorgu.refetch(); }} />}
      {gorunum === 'acik' && liste.data && (
        <>
          <p className="tc-emir-sayac" role="status">{emirler.length} açık emir</p>
          <Tablo etiket="Üretim emirleri" sutunlar={SUTUNLAR} satirlar={emirler} satirAnahtari={(e) => e.id}
            satirSec={(e) => { void yonlendir(`/uretim-emirleri/${e.id}`); }} bosMesaj="Açık emir yok" />
          {ara !== '' && emirler.length === 0 && (
            <Dugme simge="search" onClick={() => gorunumSec('bitenler')}>Bitenlerde ara</Dugme>
          )}
        </>
      )}
      {gorunum === 'bitenler' && bitenler.data && (
        <Tablo etiket="Biten üretim emirleri" sutunlar={SUTUNLAR} satirlar={bitenler.data.satirlar} satirAnahtari={(e) => e.id}
          satirSec={(e) => { void yonlendir(`/uretim-emirleri/${e.id}`); }} bosMesaj="Biten emir yok" mesgul={bitenler.isPlaceholderData}
          sayfalama={{ sayfa: bitenler.data.sayfa, sayfaBoyu: bitenler.data.sayfaBoyu, toplam: bitenler.data.toplam, degistir: setSayfa, etiket: 'Biten emir sayfaları' }} />
      )}
    </Kart>
  );
}
