import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { StokTurListesi, TurListesiCevabi, TurListesiSatiri } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import type { Siralama } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar } from './gorunum.ts';
import { HizliIslem, SatirEylemleri, type HizliIslemTuru } from './HizliIslem.tsx';
import { MalzemeSekmeleri, type MalzemeSekmesi } from './MalzemeSekmeleri.tsx';
import { SutunSecici, malzemeSutunlari, useSutunSecimi } from './MalzemeTablosu.tsx';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

// 2099-6 a (teyit): Stok Merkezi'nin tür listeleri. Kart ve türe özel alanlar Malzemeler ve Hizmetler'dendir (yalnız okunur);
// miktar, konum ve son kullanma tarihi stoktandır. Alan anahtarları malzeme kartı ekranının kategori alan kodlarıdır.
type AlanSutunu = { anahtar: string; baslik: string; birim?: string };
const ALANLAR: Record<StokTurListesi, readonly AlanSutunu[]> = {
  kimyasal: [{ anahtar: 'tur', baslik: 'Tür' }, { anahtar: 'marka', baslik: 'Marka' }, { anahtar: 'ambalaj', baslik: 'Ambalaj' }],
  takim: [{ anahtar: 'tur', baslik: 'Takım türü' }, { anahtar: 'malz', baslik: 'Takım malzemesi' }, { anahtar: 'kaplama', baslik: 'Kaplama' },
    { anahtar: 'cap', baslik: 'Çap', birim: 'mm' }, { anahtar: 'iso', baslik: 'ISO / üretici kodu' }],
  aparat: [{ anahtar: 'ad', baslik: 'Tanım' }, { anahtar: 'marka', baslik: 'Marka' }, { anahtar: 'konum', baslik: 'Kullanım yeri' }],
};
// Boş listede kullanıcıya kartın hangi kategoriyle açılacağı söylenir (malzemeler kategori adları).
// Başlık sözleşmedeki STOK_TUR_LISTELERI ile aynıdır; istemci paylaşılanı yalnız tip olarak ithal eder.
const BASLIK: Record<StokTurListesi, string> = { kimyasal: 'Kimyasallar', takim: 'Kesici takımlar', aparat: 'Aparatlar' };
const SEKME: Record<StokTurListesi, MalzemeSekmesi> = { kimyasal: 'kimyasallar', takim: 'kesici-takimlar', aparat: 'aparatlar' };
const KATEGORI_ADI: Record<StokTurListesi, string> = { kimyasal: 'Yağ ve kimyasal', takim: 'Kesici takım', aparat: 'Kalıp ve aparat' };
// Yaklaşan SKT uyarısı (gün). VARSAYIM: 30 gün; ayar gelirse oradan okunur.
const YAKLASAN_GUN = 30;

function alanMetni(v: TurListesiSatiri['alanlar'][string] | undefined, birim?: string): string {
  if (v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  return birim ? `${String(v)} ${birim}` : String(v);
}
const gunFarki = (a: string, b: string): number => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
type SktDurumu = 'gecmis' | 'yaklasiyor' | 'gecerli' | 'yok';
function sktDurumu(m: TurListesiSatiri, bugun: string): SktDurumu {
  if (Number(m.sktGecmisMiktar) > 0) return 'gecmis';
  if (m.enYakinSkt === null) return 'yok';
  return gunFarki(m.enYakinSkt, bugun) <= YAKLASAN_GUN ? 'yaklasiyor' : 'gecerli';
}
function SktHucresi({ m, bugun }: { m: TurListesiSatiri; bugun: string }) {
  const d = sktDurumu(m, bugun);
  if (d === 'yok') return <span className="tc-stok-ad"><span>{m.sktTakipli ? 'Tarihli lot yok' : 'Takip yok'}</span></span>;
  return (
    <span className="tc-stok-ad">
      <strong className="tc-stok-mono">{m.enYakinSkt}</strong>
      <span>
        {d === 'gecmis' && <Rozet ton="hata">Geçmiş: {birimliMiktar(m.sktGecmisMiktar, m.birim)}</Rozet>}
        {d === 'yaklasiyor' && <Rozet ton="uyari">{YAKLASAN_GUN} gün içinde</Rozet>}
      </span>
    </span>
  );
}

// Türe özel sütunlar ortak malzeme tablosunda Kategori'den sonra gelir; kimyasalda en yakın SKT de.
function ekSutunlar(liste: StokTurListesi, bugun: string): Sutun<TurListesiSatiri>[] {
  return [
    ...ALANLAR[liste].map((a): Sutun<TurListesiSatiri> => ({ anahtar: `alan-${a.anahtar}`, baslik: a.baslik, hucre: (m) => alanMetni(m.alanlar[a.anahtar], a.birim) })),
    ...(liste === 'kimyasal' ? [{ anahtar: 'skt', baslik: 'En yakın SKT', csv: (m: TurListesiSatiri) => m.enYakinSkt, hucre: (m: TurListesiSatiri) => <SktHucresi m={m} bugun={bugun} /> }] : []),
  ];
}

// Tür listesi sayfalanmaz (bir kategoride yüzlerce kart, VARSAYIM 2099): sıralama ekranda yapılır; boş değer sonda kalır.
const SIRA_DEGERI: Record<string, (m: TurListesiSatiri) => number | string | null> = {
  malzeme: (m) => m.malzemeId, serbest: (m) => Number(m.serbest), toplam: (m) => Number(m.toplam),
  kritik: (m) => (m.kritikSeviye === null ? null : Number(m.kritikSeviye)), son: (m) => m.sonHareket,
};
function turSirala(satirlar: readonly TurListesiSatiri[], s: Siralama | null): readonly TurListesiSatiri[] {
  const al = s ? SIRA_DEGERI[s.alan] : undefined;
  if (!s || !al) return satirlar;
  const yon = s.yon === 'artan' ? 1 : -1;
  return [...satirlar].sort((a, b) => {
    const x = al(a), y = al(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * yon || a.malzemeId - b.malzemeId;
  });
}

const SEKMELER = ['', 'kritik', 'skt'] as const;
type Sekme = (typeof SEKMELER)[number];

function TurListesi({ liste }: { liste: StokTurListesi }) {
  const yonlendir = useNavigate();
  const malKabul = useIslem('stok.giris');
  const baslik = BASLIK[liste];
  const [adres, adresYaz] = useSearchParams();
  const arama = adres.get('metin') ?? '';
  // Arama adreste durur: sekmeler arasında taşınır, geri tuşu ve yenileme onu korur.
  const setArama = (m: string) => { const y = new URLSearchParams(adres); if (m) y.set('metin', m); else y.delete('metin'); adresYaz(y, { replace: true }); };
  const [sekme, setSekme] = useState<Sekme>('');
  const [hizli, setHizli] = useState<{ m: TurListesiSatiri; tur: HizliIslemTuru } | null>(null);
  const secim = useSutunSecimi();
  const [siralama, siralamaYaz] = useState<Siralama | null>(null);
  const l = useQuery({ queryKey: [...anahtarlar.hepsi, 'tur-listesi', liste], queryFn: () => api.get<TurListesiCevabi>(`/stok/tur-listeleri/${liste}`) });
  const bugun = l.data?.bugun ?? '';
  const sutunlar = malzemeSutunlari<TurListesiSatiri>({ gizli: secim.gizli, ek: ekSutunlar(liste, bugun), eylem: (m) => <SatirEylemleri m={m} sec={(tur) => setHizli({ m, tur })} /> });
  const suzulen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return (l.data?.satirlar ?? []).filter((m) => {
      if (sekme === 'kritik' && m.durum !== 'kritik' && m.durum !== 'eksi') return false;
      if (sekme === 'skt' && sktDurumu(m, bugun) !== 'gecmis' && sktDurumu(m, bugun) !== 'yaklasiyor') return false;
      if (q === '') return true;
      return [m.ad, m.stokKodu, ...Object.values(m.alanlar).flat().map(String)].some((x) => x?.toLocaleLowerCase('tr-TR').includes(q));
    });
  }, [l.data, arama, sekme, bugun]);
  const satirlar = useMemo(() => turSirala(suzulen, siralama), [suzulen, siralama]);
  const sayi = (f: (m: TurListesiSatiri) => boolean) => (l.data ? ` ${l.data.satirlar.filter(f).length}` : '');
  const suzgecler = [
    { deger: '', baslik: `Tümü${sayi(() => true)}` },
    { deger: 'kritik', baslik: `Kritik${sayi((m) => m.durum === 'kritik' || m.durum === 'eksi')}` },
    ...(liste === 'kimyasal' ? [{ deger: 'skt', baslik: `SKT uyarısı${sayi((m) => ['gecmis', 'yaklasiyor'].includes(sktDurumu(m, bugun)))}` }] : []),
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={baslik} aciklama={l.data ? `${l.data.satirlar.length} kart; kart ve alanlar Malzemeler ve Hizmetler'den, miktar stoktan.` : 'Türe göre stok.'}
        sag={<>
          {malKabul && <Link to="/stok/mal-kabul"><Dugme tur="birincil" simge="truck">Mal kabul</Dugme></Link>}
          <Link to="/malzemeler/yeni"><Dugme simge="layers">Malzeme kartı aç</Dugme></Link>
        </>} />
      <MalzemeSekmeleri secili={SEKME[liste]} metin={arama} />
      <Kart>
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
          <Tablo etiket={baslik} kip="kaydir" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(m) => m.malzemeId} mesgul={l.isPending}
            satirSec={(m) => { void yonlendir(`/stok/malzemeler/${m.malzemeId}`); }} siralama={siralama} siralamaDegistir={siralamaYaz}
            bosMesaj={`Bu listede kart yok. Kartı Malzemeler ve Hizmetler'de "${KATEGORI_ADI[liste]}" kategorisiyle açın.`}
            arac={{
              arama: { deger: arama, degistir: setArama, etiket: 'Ara', yerTutucu: 'Ad, stok kodu ya da alan değeri' },
              suzgec: { etiket: 'Süzgeç', secenekler: suzgecler, secili: sekme, sec: (s) => setSekme(s as Sekme) },
              sag: <SutunSecici {...secim} />,
            }} />
        )}
      </Kart>
      {hizli && <HizliIslem tur={hizli.tur} m={hizli.m} kapat={() => setHizli(null)} />}
    </section>
  );
}

export const Kimyasallar = () => <TurListesi liste="kimyasal" />;
export const KesiciTakimlar = () => <TurListesi liste="takim" />;
export const Aparatlar = () => <TurListesi liste="aparat" />;
