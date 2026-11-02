import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DurusNedeni, DurusNedenleriCevabi, HurdaNedeni, HurdaNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge, Tablo, type Sutun, type TabloAraci, type TabloSuzgeci } from '../../ortak/arayuz/index.ts';
import { SIMGELER, type SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DurusNedeniFormu, EKIP_ADLARI, HurdaNedeniFormu, KATEGORI_ADLARI } from './NedenFormlari.tsx';
import './durus-nedenleri.css';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/durus-nedenleri.ts); her bölüm kendi adresindedir.
type Bolum = 'durus' | 'hurda';

const simgeMi = (ad: string): ad is SimgeAdi => ad in SIMGELER;
const durumRozeti = (aktif: boolean) => <Rozet ton={aktif ? 'tamam' : 'pasif'}>{aktif ? 'Aktif' : 'Pasif'}</Rozet>;

const DURUS_SUTUNLARI: readonly Sutun<DurusNedeni>[] = [
  { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (n) => n.kod },
  {
    anahtar: 'ad',
    baslik: 'Ad',
    hucre: (n) => <span className="tc-neden-ad">{n.simge !== null && simgeMi(n.simge) && <Simge ad={n.simge} boyut="k" />}{n.ad}</span>,
  },
  { anahtar: 'kategori', baslik: 'Kategori', hucre: (n) => <Rozet ton={n.kategori === 'planli' ? 'bilgi' : 'uyari'}>{KATEGORI_ADLARI[n.kategori]}</Rozet> },
  { anahtar: 'ekip', baslik: 'Çağrı ekibi', hucre: (n) => (n.cagriEkibi === null ? null : EKIP_ADLARI[n.cagriEkibi]) },
  { anahtar: 'gecikme', baslik: 'Gecikme', hucre: (n) => (n.cagriGecikmeDk === null ? null : `${n.cagriGecikmeDk} dk`) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (n) => durumRozeti(n.aktif) },
];

const HURDA_SUTUNLARI: readonly Sutun<HurdaNedeni>[] = [
  { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (n) => n.kod },
  { anahtar: 'ad', baslik: 'Ad', hucre: (n) => n.ad },
  { anahtar: 'durum', baslik: 'Durum', hucre: (n) => durumRozeti(n.aktif) },
];

type DurumSuzgeci = 'hepsi' | 'aktif' | 'pasif';
const DURUM_SUZGECLERI: readonly TabloSuzgeci[] = [
  { deger: 'hepsi', baslik: 'Tümü' },
  { deger: 'aktif', baslik: 'Aktif' },
  { deger: 'pasif', baslik: 'Pasif' },
];

const kucuk = (metin: string) => metin.toLocaleLowerCase('tr');

// Liste küçüktür ve tamamı gelir; arama (kod ya da ad) ve durum süzgeci istemcide uygulanır.
function useSuzulmus<N extends { kod: string; ad: string; aktif: boolean }>(nedenler: readonly N[] | undefined, aramaEtiketi: string) {
  const [ara, araYaz] = useState('');
  const [durum, durumYaz] = useState<DurumSuzgeci>('hepsi');
  const aranan = kucuk(ara.trim());
  const satirlar = (nedenler ?? []).filter((n) =>
    (durum === 'hepsi' || n.aktif === (durum === 'aktif'))
    && (aranan === '' || kucuk(n.kod).includes(aranan) || kucuk(n.ad).includes(aranan)));
  const arac: TabloAraci<N> = {
    arama: { deger: ara, degistir: araYaz, etiket: aramaEtiketi, yerTutucu: 'Kod ya da ad' },
    suzgec: { etiket: 'Durum', secenekler: DURUM_SUZGECLERI, secili: durum, sec: (d) => durumYaz(d as DurumSuzgeci) },
  };
  const bos = ara.trim() !== '' || durum !== 'hepsi';
  return { satirlar, arac, bos };
}

// null: pencere kapalı; { neden: null }: yeni kayıt.
type Duzenlenen<N> = { neden: N | null } | null;

function DurusBolumu({ yazabilir }: { yazabilir: boolean }) {
  const [duzenlenen, duzenlenenYaz] = useState<Duzenlenen<DurusNedeni>>(null);
  const liste = useQuery({ queryKey: anahtarlar.durus, queryFn: () => api.get<DurusNedenleriCevabi>('/durus-nedenleri') });
  const suzulmus = useSuzulmus(liste.data?.nedenler, 'Duruş nedeni ara');
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  return (
    <div className="tc-nedenler-liste">
      {yazabilir && <div><Dugme tur="birincil" simge="plus" onClick={() => duzenlenenYaz({ neden: null })}>Yeni duruş nedeni</Dugme></div>}
      <Tablo
        etiket="Duruş nedenleri"
        sutunlar={DURUS_SUTUNLARI}
        satirlar={suzulmus.satirlar}
        satirAnahtari={(n) => n.id}
        satirSec={yazabilir ? (n) => duzenlenenYaz({ neden: n }) : undefined}
        bosMesaj={suzulmus.bos ? 'Aramaya uyan duruş nedeni yok' : 'Duruş nedeni yok'}
        arac={suzulmus.arac}
      />
      {duzenlenen && (
        <DurusNedeniFormu key={duzenlenen.neden?.id ?? 'yeni'} neden={duzenlenen.neden} onerilenKod={liste.data.onerilenKod} kapat={() => duzenlenenYaz(null)} />
      )}
    </div>
  );
}

function HurdaBolumu({ yazabilir }: { yazabilir: boolean }) {
  const [duzenlenen, duzenlenenYaz] = useState<Duzenlenen<HurdaNedeni>>(null);
  const liste = useQuery({ queryKey: anahtarlar.hurda, queryFn: () => api.get<HurdaNedenleriCevabi>('/hurda-nedenleri') });
  const suzulmus = useSuzulmus(liste.data?.nedenler, 'Hurda nedeni ara');
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  return (
    <div className="tc-nedenler-liste">
      {yazabilir && <div><Dugme tur="birincil" simge="plus" onClick={() => duzenlenenYaz({ neden: null })}>Yeni hurda nedeni</Dugme></div>}
      <Tablo
        etiket="Hurda nedenleri"
        sutunlar={HURDA_SUTUNLARI}
        satirlar={suzulmus.satirlar}
        satirAnahtari={(n) => n.id}
        satirSec={yazabilir ? (n) => duzenlenenYaz({ neden: n }) : undefined}
        bosMesaj={suzulmus.bos ? 'Aramaya uyan hurda nedeni yok' : 'Hurda nedeni yok'}
        arac={suzulmus.arac}
      />
      {duzenlenen && (
        <HurdaNedeniFormu key={duzenlenen.neden?.id ?? 'yeni'} neden={duzenlenen.neden} onerilenKod={liste.data.onerilenKod} kapat={() => duzenlenenYaz(null)} />
      )}
    </div>
  );
}

export function DurusNedenleri({ bolum = 'durus' }: { bolum?: Bolum }) {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('durus-nedenleri.yaz') === true;
  return (
    <Kart baslik={bolum === 'durus' ? 'Duruş nedenleri' : 'Hurda nedenleri'}>
      <div className="tc-nedenler-liste">
        {bolum === 'durus' ? <DurusBolumu yazabilir={yazabilir} /> : <HurdaBolumu yazabilir={yazabilir} />}
      </div>
    </Kart>
  );
}

export const HurdaNedenleri = () => <DurusNedenleri bolum="hurda" />;
