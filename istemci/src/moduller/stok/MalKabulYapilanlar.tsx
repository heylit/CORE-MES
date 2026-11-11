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
// Her kabul satırı tek satırdır (2940 a): her bilgi kendi sütununda, uzun yazı kesilir; tablo yana kayar.
const YER_ENCOK = 2;
const SUTUNLAR: Sutun<MalKabulSatirOzeti>[] = [
  { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', kes: true, csv: (s) => s.malzemeAd ?? '', hucre: (s) => (
    <Link to={`/stok/malzemeler/${s.malzemeId}`} onClick={(e) => e.stopPropagation()}>{s.malzemeAd ?? `Kart ${s.malzemeId}`}</Link>
  ) },
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, hucre: (s) => s.malzemeKod },
  { anahtar: 'zaman', baslik: 'Kabul zamanı', sirala: true, csv: (s) => s.zaman, hucre: (s) => zamanMetni(s.zaman) },
  { anahtar: 'kisi', baslik: 'Alan', kes: true, hucre: (s) => s.kisiAd },
  { anahtar: 'miktar', baslik: 'Kabul edilen', hizala: 'sag', hucre: (s) => birimli(s.sayilanMiktar, s.birim) },
  { anahtar: 'lot', baslik: 'Lot', mono: true, csv: (s) => s.lotNo ?? '', hucre: (s) => (s.partiId === null ? null : s.lotNo) },
  { anahtar: 'tedarikciParti', baslik: 'Tedarikçi partisi', mono: true, hucre: (s) => s.tedarikciPartiNo },
  { anahtar: 'belgeler', baslik: 'Belgeler', csv: false, hucre: (s) => (s.partiId === null || s.partiBelgeleri.length === 0 ? null : <PartiBelgeleri partiId={s.partiId} belgeler={s.partiBelgeleri} />) },
  { anahtar: 'yer', baslik: 'Nerede', kes: true, csv: (s) => s.yerler.map((y) => `${y.konumKod} ${y.miktar}`).join('; '), hucre: (s) => (s.yerler.length === 0
    ? (s.ilkKonumKod ? `Kabulde ${s.ilkKonumKod}` : null)
    : (
      <span title={s.yerler.map((y) => `${y.konumKod} ${birimli(y.miktar, s.birim)}`).join(', ')}>
        {s.yerler.slice(0, YER_ENCOK).map((y, i) => (
          <span key={`${y.konumId}-${y.kaliteDurumu}`} title={KONUM_ETIKETI[y.konumTur]}>
            {i > 0 && ', '}<Link to={`/stok/konumlar/${y.konumId}`} onClick={(e) => e.stopPropagation()}>{y.konumKod}</Link> · {birimli(y.miktar, s.birim)} <KaliteRozeti durum={y.kaliteDurumu} />
          </span>
        ))}
        {s.yerler.length > YER_ENCOK && <span className="tc-stok-not"> +{s.yerler.length - YER_ENCOK}</span>}
      </span>
    )) },
  { anahtar: 'durum', baslik: 'Durum', csv: (s) => kabulSatiriDurumu(s).etiket, hucre: (s) => { const d = kabulSatiriDurumu(s); return <Rozet ton={d.ton}>{d.etiket}</Rozet>; } },
  { anahtar: 'gkk', baslik: 'Giriş kontrolü', csv: (s) => (s.gkk && s.duzeltenId === null ? 'Giriş kalite kontrollü' : ''), hucre: (s) => (s.gkk && s.duzeltenId === null ? 'Kontrollü' : null) },
  { anahtar: 'belge', baslik: 'Belge', mono: true, csv: (s) => s.belgeNo, hucre: (s) => (
    <Link to={`/stok/mal-kabul/${s.malKabulId}`} onClick={(e) => e.stopPropagation()}>{s.belgeNo}</Link>
  ) },
  { anahtar: 'tur', baslik: 'Tür', hucre: (s) => MAL_KABUL_TURU[s.tur] },
  { anahtar: 'irsaliye', baslik: 'İrsaliye', mono: true, hucre: (s) => s.irsaliyeNo },
  { anahtar: 'siparis', baslik: 'Sipariş', mono: true, hucre: (s) => s.siparisNo },
  { anahtar: 'tedarikci', baslik: 'Tedarikçi', kes: true, hucre: (s) => s.tedarikciAdi },
  { anahtar: 'fason', baslik: 'Fasondan dönüş', kes: true, hucre: (s) => (s.fasonGidenAd ? `Giden ${s.fasonGidenAd}` : null) },
  { anahtar: 'logo', baslik: 'Logo', hucre: (s) => <Rozet ton={LOGO_ETIKETI[s.logoDurumu].ton}>{LOGO_ETIKETI[s.logoDurumu].etiket}</Rozet>, csv: (s) => LOGO_ETIKETI[s.logoDurumu].etiket },
  { anahtar: 'etiket', baslik: 'Etiket', sabit: 'sag', csv: false, hucre: (s) => (s.partiId === null ? <span /> : (
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
        <Tablo etiket="Mal kabulü yapılanlar" kip="kaydir" sutunlar={SUTUNLAR} satirlar={l.data?.satirlar ?? []} satirAnahtari={(s) => s.id} mesgul={l.isPending}
          bosMesaj="Henüz mal kabul yok." siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir}
          {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
      )}
    </Kart>
  );
}
