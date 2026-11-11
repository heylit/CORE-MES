import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { StokTurListesi, TurListesiCevabi, TurListesiSatiri } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Rozet, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, birimliMiktar } from './gorunum.ts';
import { MalzemeSekmeleri, type MalzemeSekmesi } from './MalzemeSekmeleri.tsx';
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

function sutunlar(liste: StokTurListesi, bugun: string): Sutun<TurListesiSatiri>[] {
  return [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (m) => (
      <span className="tc-stok-ad"><strong>{m.ad ?? `Kart ${m.malzemeId}`}</strong>
        <span><span className="tc-stok-mono">{m.stokKodu ?? `no ${m.malzemeId}`}</span> {m.durum === 'kritik' || m.durum === 'eksi' ? <Rozet ton={DURUM_ETIKETI[m.durum].ton}>{DURUM_ETIKETI[m.durum].etiket}</Rozet> : null}</span></span>
    ) },
    ...ALANLAR[liste].map((a): Sutun<TurListesiSatiri> => ({ anahtar: `alan-${a.anahtar}`, baslik: a.baslik, hucre: (m) => alanMetni(m.alanlar[a.anahtar], a.birim) })),
    ...(liste === 'kimyasal' ? [{ anahtar: 'skt', baslik: 'En yakın SKT', hucre: (m: TurListesiSatiri) => <SktHucresi m={m} bugun={bugun} /> }] : []),
    { anahtar: 'konum', baslik: 'Konumlar', hucre: (m) => (m.konumlar.length === 0 ? '—' : m.konumlar.map((k) => k.kod).join(' ') + (m.konumSayisi > m.konumlar.length ? ` +${m.konumSayisi - m.konumlar.length}` : '')) },
    { anahtar: 'toplam', baslik: 'Stok', hizala: 'sag', hucre: (m) => (
      <strong className={`tc-stok-buyuk-miktar ${m.durum === 'eksi' ? 'tc-stok-eksi' : m.durum === 'kritik' ? 'tc-stok-uyari-yazi' : ''}`}>{birimliMiktar(m.serbest, m.birim)}</strong>
    ) },
  ];
}

const SEKMELER = ['', 'kritik', 'skt'] as const;
type Sekme = (typeof SEKMELER)[number];

function TurListesi({ liste }: { liste: StokTurListesi }) {
  const yonlendir = useNavigate();
  const malKabul = useIslem('stok.giris');
  const baslik = BASLIK[liste];
  const [arama, setArama] = useState('');
  const [sekme, setSekme] = useState<Sekme>('');
  const l = useQuery({ queryKey: [...anahtarlar.hepsi, 'tur-listesi', liste], queryFn: () => api.get<TurListesiCevabi>(`/stok/tur-listeleri/${liste}`) });
  const bugun = l.data?.bugun ?? '';
  const satirlar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return (l.data?.satirlar ?? []).filter((m) => {
      if (sekme === 'kritik' && m.durum !== 'kritik' && m.durum !== 'eksi') return false;
      if (sekme === 'skt' && sktDurumu(m, bugun) !== 'gecmis' && sktDurumu(m, bugun) !== 'yaklasiyor') return false;
      if (q === '') return true;
      return [m.ad, m.stokKodu, ...Object.values(m.alanlar).flat().map(String)].some((x) => x?.toLocaleLowerCase('tr-TR').includes(q));
    });
  }, [l.data, arama, sekme, bugun]);
  const sayi = (f: (m: TurListesiSatiri) => boolean) => (l.data ? ` ${l.data.satirlar.filter(f).length}` : '');
  const sekmeler = [
    { anahtar: '', baslik: `Tümü${sayi(() => true)}` },
    { anahtar: 'kritik', baslik: `Kritik${sayi((m) => m.durum === 'kritik' || m.durum === 'eksi')}` },
    ...(liste === 'kimyasal' ? [{ anahtar: 'skt', baslik: `SKT uyarısı${sayi((m) => ['gecmis', 'yaklasiyor'].includes(sktDurumu(m, bugun)))}` }] : []),
  ] as { anahtar: Sekme; baslik: string }[];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={baslik} alt={l.data ? `${l.data.satirlar.length} kart; kart ve alanlar Malzemeler ve Hizmetler'den, miktar stoktan.` : 'Türe göre stok.'}
        sag={<>
          {malKabul && <Link to="/stok/mal-kabul"><Dugme tur="birincil" simge="truck">Mal kabul</Dugme></Link>}
          <Link to="/malzemeler/yeni"><Dugme simge="layers">Malzeme kartı aç</Dugme></Link>
        </>} />
      <MalzemeSekmeleri secili={SEKME[liste]} />
      <div className="tc-stok-arac">
        <Girdi etiket="Ara" placeholder="Ad, stok kodu ya da alan değeri" value={arama} onChange={(e) => setArama(e.target.value)} />
      </div>
      <div className="tc-stok-sekmeler-sar"><Sekmeler etiket="Süzgeç" sekmeler={sekmeler} secili={sekme} sec={(s) => setSekme(s)} /></div>
      <Kart>
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
          <Tablo etiket={baslik} sutunlar={sutunlar(liste, bugun)} satirlar={satirlar} satirAnahtari={(m) => m.malzemeId} mesgul={l.isPending}
            satirSec={(m) => { void yonlendir(`/stok/malzemeler/${m.malzemeId}`); }}
            bosMesaj={`Bu listede kart yok. Kartı Malzemeler ve Hizmetler'de "${KATEGORI_ADI[liste]}" kategorisiyle açın.`} />
        )}
      </Kart>
    </section>
  );
}

export const Kimyasallar = () => <TurListesi liste="kimyasal" />;
export const KesiciTakimlar = () => <TurListesi liste="takim" />;
export const Aparatlar = () => <TurListesi liste="aparat" />;
