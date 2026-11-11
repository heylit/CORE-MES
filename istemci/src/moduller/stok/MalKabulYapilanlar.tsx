import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { MalKabulSatirlariCevabi, MalKabulSatirOzeti } from '#paylasilan/sozlesme/stok-mal-kabul-satirlari.ts';
import { DurumKutusu, Girdi, Kart, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { KONUM_ETIKETI, LOGO_ESLESME_DURUMLARI, LOGO_ETIKETI, MAL_KABUL_TURLERI, MAL_KABUL_TURU, kabulSatiriDurumu, miktarMetni, zamanMetni } from './gorunum.ts';
import { KaliteRozeti, hataMetni } from './ortak.tsx';
import { PartiBelgeleri } from './PartiBelgeleri.tsx';
import './stok.css';

const birimli = (m: string, birim: string | null): string => `${miktarMetni(m)}${birim ? ` ${birim}` : ''}`;

// Satır başına: ne kabul edildi, ne zaman ve kim aldı, lotun bugün durduğu konumlar (bölündüyse hepsi) ve durumu. Lotlu satırın
// etiketi Etiket Merkezi'nde görülür ve yeniden basılır. Sipariş ve tedarikçi yalnız onları zaten gören role dolu gelir.
const SUTUNLAR: Sutun<MalKabulSatirOzeti>[] = [
  { anahtar: 'zaman', baslik: 'Kabul', kirilmaz: true, sirala: true, hucre: (s) => (
    <span className="tc-stok-ad"><span>{zamanMetni(s.zaman)}</span><span className="tc-stok-not">{s.kisiAd ?? '—'}</span></span>
  ), csv: (s) => s.zaman },
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (s) => (
    <span className="tc-stok-ad"><Link to={`/stok/malzemeler/${s.malzemeId}`} onClick={(e) => e.stopPropagation()}>{s.malzemeAd ?? `Kart ${s.malzemeId}`}</Link>
      {s.malzemeKod && <span className="tc-stok-not">{s.malzemeKod}</span>}
      {s.fasonGidenAd && <span className="tc-stok-not">Fasondan dönüş · giden {s.fasonGidenAd}</span>}</span>
  ), csv: (s) => s.malzemeAd ?? '' },
  { anahtar: 'miktar', baslik: 'Kabul edilen', hizala: 'sag', kirilmaz: true, hucre: (s) => birimli(s.sayilanMiktar, s.birim) },
  { anahtar: 'lot', baslik: 'Lot', hucre: (s) => (s.partiId === null ? '—' : (
    <span className="tc-stok-ad"><span>{s.lotNo ?? '—'}</span>
      {s.tedarikciPartiNo && <span className="tc-stok-not">Tedarikçi partisi {s.tedarikciPartiNo}</span>}
      <PartiBelgeleri partiId={s.partiId} belgeler={s.partiBelgeleri} /></span>
  )), csv: (s) => s.lotNo ?? '' },
  { anahtar: 'yer', baslik: 'Nerede', hucre: (s) => (s.yerler.length === 0 ? <span className="tc-stok-not">{s.ilkKonumKod ? `Kabulde ${s.ilkKonumKod}` : '—'}</span> : (
    <span className="tc-stok-ad">{s.yerler.map((y) => (
      <span key={`${y.konumId}-${y.kaliteDurumu}`} title={KONUM_ETIKETI[y.konumTur]}>
        <Link to={`/stok/konumlar/${y.konumId}`} onClick={(e) => e.stopPropagation()}>{y.konumKod}</Link> · {birimli(y.miktar, s.birim)} <KaliteRozeti durum={y.kaliteDurumu} />
      </span>
    ))}</span>
  )), csv: (s) => s.yerler.map((y) => `${y.konumKod} ${y.miktar}`).join('; ') },
  { anahtar: 'durum', baslik: 'Durum', hucre: (s) => {
    const d = kabulSatiriDurumu(s);
    return <span className="tc-stok-ad"><Rozet ton={d.ton}>{d.etiket}</Rozet>{s.gkk && s.duzeltenId === null && <span className="tc-stok-not">Giriş kalite kontrollü</span>}</span>;
  }, csv: (s) => kabulSatiriDurumu(s).etiket },
  { anahtar: 'belge', baslik: 'Belge', hucre: (s) => (
    <span className="tc-stok-ad"><Link to={`/stok/mal-kabul/${s.malKabulId}`} onClick={(e) => e.stopPropagation()}>{s.belgeNo}</Link>
      <span className="tc-stok-not">{MAL_KABUL_TURU[s.tur]}{s.irsaliyeNo ? ` · irsaliye ${s.irsaliyeNo}` : ''}</span>
      {s.siparisNo && <span className="tc-stok-not">Sipariş {s.siparisNo}{s.tedarikciAdi ? ` · ${s.tedarikciAdi}` : ''}</span>}</span>
  ), csv: (s) => s.belgeNo },
  { anahtar: 'logo', baslik: 'Logo', hucre: (s) => <Rozet ton={LOGO_ETIKETI[s.logoDurumu].ton}>{LOGO_ETIKETI[s.logoDurumu].etiket}</Rozet>, csv: (s) => LOGO_ETIKETI[s.logoDurumu].etiket },
  { anahtar: 'etiket', baslik: 'Etiket', csv: false, hucre: (s) => (s.partiId === null ? <span /> : (
    <EtiketMerkeziDugmesi tur="lot" idler={[s.partiId]} ad={`${s.lotNo ?? 'Lot'} etiketi`}>Etiket</EtiketMerkeziDugmesi>
  )) },
];

export function MalKabulYapilanlar() {
  const liste = useListeDurumu({
    suzgecler: { metin: '', tur: '' as '' | (typeof MAL_KABUL_TURLERI)[number], logoDurumu: '' as '' | (typeof LOGO_ESLESME_DURUMLARI)[number] },
    suzgecDegerleri: { tur: MAL_KABUL_TURLERI, logoDurumu: LOGO_ESLESME_DURUMLARI }, siralamaAlanlari: ['zaman'], adres: true,
  });
  const [arama, setArama] = useState(liste.suzgecler.metin);
  useEffect(() => { const t = setTimeout(() => { if (arama !== liste.suzgecler.metin) liste.suzgecDegistir({ metin: arama }); }, 300); return () => clearTimeout(t); }, [arama]);
  const l = useQuery({ queryKey: anahtarlar.liste('mal-kabul-satirlari', liste.sorgu), queryFn: () => api.get<MalKabulSatirlariCevabi>(`/stok/mal-kabul-satirlari${sorguMetni(liste.sorgu)}`) });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  return (
    <Kart baslik="Mal kabulü yapılanlar">
      <div className="tc-stok-iki">
        <Girdi etiket="Ara" placeholder="Belge, irsaliye, lot ya da tedarikçi parti no" value={arama} onChange={(e) => setArama(e.target.value)} />
        <Secim etiket="Tür" value={liste.suzgecler.tur} onChange={(e) => liste.suzgecDegistir({ tur: e.target.value as '' })}
          secenekler={MAL_KABUL_TURLERI.map((t) => ({ deger: t, baslik: MAL_KABUL_TURU[t] }))} bosSecenek="Hepsi" />
        <Secim etiket="Logo durumu" value={liste.suzgecler.logoDurumu} onChange={(e) => liste.suzgecDegistir({ logoDurumu: e.target.value as '' })}
          secenekler={LOGO_ESLESME_DURUMLARI.map((d) => ({ deger: d, baslik: LOGO_ETIKETI[d].etiket }))} bosSecenek="Hepsi" />
      </div>
      {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
        <Tablo etiket="Mal kabulü yapılanlar" sutunlar={SUTUNLAR} satirlar={l.data?.satirlar ?? []} satirAnahtari={(s) => s.id} mesgul={l.isPending}
          bosMesaj="Henüz mal kabul yok." siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir}
          {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
      )}
    </Kart>
  );
}
