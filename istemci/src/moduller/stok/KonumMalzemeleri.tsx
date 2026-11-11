import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { KonumMalzemeleriCevabi, KonumMalzemesi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Girdi, Kart, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { beklemeMetni, KONUM_ETIKETI, KONUM_TURLERI, miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni } from './ortak.tsx';

const SUTUNLAR: Sutun<KonumMalzemesi>[] = [
  { anahtar: 'konum', baslik: 'Konum', mono: true, sirala: true, sabit: 'sol', hucre: (b) => <Link to={`/stok/konumlar/${b.konumId}`}>{b.konumKod}</Link>, csv: (b) => b.konumKod },
  { anahtar: 'tur', baslik: 'Tür', hucre: (b) => KONUM_ETIKETI[b.konumTur] },
  { anahtar: 'malzeme', baslik: 'Malzeme', kes: true, hucre: (b) => <Link to={`/stok/malzemeler/${b.malzemeId}`}>{b.malzemeAd ?? `Kart ${b.malzemeId}`}</Link>, csv: (b) => b.malzemeAd ?? `Kart ${b.malzemeId}` },
  { anahtar: 'parti', baslik: 'Parti', kes: true, hucre: (b) => b.partiEtiketi ?? '—' },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (b) => <strong>{miktarMetni(b.miktar)}</strong> },
  { anahtar: 'gelis', baslik: 'Bu konumda', sirala: true, kirilmaz: true, hucre: (b) => <span title={zamanMetni(b.konumaGelis ?? null)}>{beklemeMetni(b.konumaGelis)}</span> },
  { anahtar: 'ilk', baslik: 'Depoya ilk giriş', kirilmaz: true, hucre: (b) => zamanMetni(b.ilkGiris) },
];

// Konumdaki malzemeler (2224): bütün konumlardaki stok tek listede; varsayılan sıra en uzun bekleyen önce. Süre konuma gelişten
// sayılır (sunucu hareketten bulur); geliş bilinmeyen satır "—" ile sonda kalır.
export function KonumMalzemeleri() {
  const liste = useListeDurumu({
    suzgecler: { tur: '' as '' | (typeof KONUM_TURLERI)[number], metin: '' }, suzgecDegerleri: { tur: KONUM_TURLERI }, siralamaAlanlari: ['gelis', 'konum'],
  });
  const [arama, setArama] = useState(liste.suzgecler.metin);
  useEffect(() => { const t = setTimeout(() => { if (arama !== liste.suzgecler.metin) liste.suzgecDegistir({ metin: arama }); }, 300); return () => clearTimeout(t); }, [arama]);
  const l = useQuery({ queryKey: anahtarlar.liste('konum-malzemeleri', liste.sorgu), queryFn: () => api.get<KonumMalzemeleriCevabi>(`/stok/konum-malzemeleri${sorguMetni(liste.sorgu)}`) });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  return (
    <Kart sag={<>
      <Girdi etiket="Konum ara" placeholder="Konum kodu ya da adı" value={arama} onChange={(e) => setArama(e.target.value)} />
      <Secim etiket="Tür" value={liste.suzgecler.tur} onChange={(e) => liste.suzgecDegistir({ tur: e.target.value as '' })} secenekler={KONUM_TURLERI.map((t) => ({ deger: t, baslik: KONUM_ETIKETI[t] }))} bosSecenek="Hepsi" />
    </>}>
      <p className="tc-stok-not">"Bu konumda" malzemenin bu konuma gelişinden sayılır. "Depoya ilk giriş" taşımada değişmez; ilk giren ilk çıkar sırası onunla kurulur.</p>
      {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
        <Tablo etiket="Konumdaki malzemeler" kip="kaydir" sutunlar={SUTUNLAR} satirlar={l.data?.satirlar ?? []} satirAnahtari={(b) => b.id} mesgul={l.isPending}
          siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir} bosMesaj="Konumlarda stok yok."
          {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
      )}
    </Kart>
  );
}
