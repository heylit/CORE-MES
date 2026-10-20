import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Konum, KonumAcGovdesi, KonumlarCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Secim, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ELLE_KONUM, ELLE_KONUM_TURLERI, KONUM_ETIKETI, KONUM_TURLERI, zamanMetni } from './gorunum.ts';
import { HaritaEsleDugmesi } from './HaritaBagi.tsx';
import { SayfaBasi, hataMetni, useIslem, useStokKomutu } from './ortak.tsx';
import { ZeminIzgarasi } from './ZeminIzgarasi.tsx';
import './stok.css';

// Fason kutuları (K-080 c): fasona giden yarı mamul burada durur; hizmet siparişinin mal kabulü gideni buradan düşer.
function FasonKutulari({ ac }: { ac: (() => void) | null }) {
  const yonlendir = useNavigate();
  const l = useQuery({ queryKey: anahtarlar.liste('fason-kutulari', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?tur=fason&sayfaBoyu=200') });
  return (
    <Kart baslik="Fason kutuları" sag={ac && <Dugme simge="plus" onClick={ac}>Fason kutusu aç</Dugme>}>
      <p className="tc-stok-not">Fasona giden yarı mamul kutusuna taşınır. Dönüşte hizmet siparişinin mal kabulü dönen malzemeyi stoğa alır, gideni buradan düşer.</p>
      {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
        <Tablo etiket="Fason kutuları" sutunlar={SUTUNLAR.filter((x) => x.anahtar !== 'tur' && x.anahtar !== 'sayim')} satirlar={l.data?.satirlar ?? []} satirAnahtari={(k) => k.id}
          mesgul={l.isPending} satirSec={(k) => { void yonlendir(`/stok/konumlar/${k.id}`); }} bosMesaj="Fason kutusu yok." />
      )}
    </Kart>
  );
}

const SUTUNLAR: Sutun<Konum>[] = [
  { anahtar: 'kod', baslik: 'Kod', mono: true, sirala: true, hucre: (k) => k.kod },
  { anahtar: 'tur', baslik: 'Tür', sirala: true, hucre: (k) => KONUM_ETIKETI[k.tur] },
  { anahtar: 'ad', baslik: 'Ad', hucre: (k) => k.ad ?? '—' },
  { anahtar: 'depo', baslik: 'Depo', hucre: (k) => k.depoKod },
  { anahtar: 'harita', baslik: 'Haritada', hucre: (k) => (k.haritaGozId !== null || k.haritaAlanId !== null ? 'Bağlı' : 'Yok') },
  { anahtar: 'satir', baslik: 'Dolu satır', hizala: 'sag', hucre: (k) => k.satirSayisi },
  { anahtar: 'sayim', baslik: 'Son sayım', kirilmaz: true, hucre: (k) => zamanMetni(k.sonSayim) },
];

export function KonumAcPenceresi({ kapat, ilkTur = 'depo_zemini' }: { kapat: () => void; ilkTur?: (typeof ELLE_KONUM_TURLERI)[number] }) {
  const [tur, setTur] = useState<(typeof ELLE_KONUM_TURLERI)[number]>(ilkTur);
  const [kod, setKod] = useState('');
  const [ad, setAd] = useState('');
  const { komut } = useStokKomutu((g: KonumAcGovdesi) => api.post('/stok/konumlar', g), 'Konum açıldı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik="Konum aç" tur="yan" alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate({ tur, kod, ad })}>Aç</Dugme>}>
      <div className="tc-stok-form">
        <Secim etiket="Tür" value={tur} onChange={(e) => setTur(e.target.value as typeof tur)} secenekler={ELLE_KONUM_TURLERI.map((t) => ({ deger: t, baslik: ELLE_KONUM[t] }))} />
        <Girdi etiket="Kod" value={kod} onChange={(e) => setKod(e.target.value.toUpperCase())} ipucu={tur === 'fason' ? 'Fason kutusu için FSN-01 biçimi önerilir.' : 'Depo zemini karesi için D-C4 biçimi önerilir.'} required />
        <Girdi etiket="Ad" value={ad} onChange={(e) => setAd(e.target.value)} ipucu={tur === 'fason' ? 'Fason firmasının adı; firma bağı rota adımıyla gelecek.' : undefined} />
        <p className="tc-stok-not">Raf gözleri raftan açılır. Fasona giden yarı mamul fason kutusuna taşınır; dönüşte mal kabul oradan düşer. Üretim alanı konumları atölye modülü gelince açılır.</p>
      </div>
    </Pencere>
  );
}

export function Konumlar() {
  const yonlendir = useNavigate();
  const tanimlar = useIslem('stok.tanim');
  const [ac, setAc] = useState<false | (typeof ELLE_KONUM_TURLERI)[number]>(false);
  const [gorunum, setGorunum] = useState<'zemin' | 'fason' | 'liste'>('zemin');
  const liste = useListeDurumu({ suzgecler: { tur: '' as '' | (typeof KONUM_TURLERI)[number] }, suzgecDegerleri: { tur: KONUM_TURLERI }, siralamaAlanlari: ['kod', 'tur'], adres: true });
  const l = useQuery({ queryKey: anahtarlar.liste('konumlar', liste.sorgu), queryFn: () => api.get<KonumlarCevabi>(`/stok/konumlar${sorguMetni(liste.sorgu)}`) });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Konumlar" alt="Fabrika zemini (harita kareleri), raf gözleri, mal kabul alanı, üretim çıkışı ve fason kutuları." sag={tanimlar && <><HaritaEsleDugmesi /><Dugme tur="birincil" simge="plus" onClick={() => setAc('depo_zemini')}>Konum aç</Dugme></>} />
      <Sekmeler etiket="Konum görünümü" secili={gorunum} sec={setGorunum} sekmeler={[{ anahtar: 'zemin', baslik: 'Fabrika zemini' }, { anahtar: 'fason', baslik: 'Fason kutuları' }, { anahtar: 'liste', baslik: 'Bütün konumlar' }]} />
      {gorunum === 'zemin' && <ZeminIzgarasi />}
      {gorunum === 'fason' && <FasonKutulari ac={tanimlar ? () => setAc('fason') : null} />}
      {gorunum === 'liste' && <>
      <Kart sag={<Secim etiket="Tür" value={liste.suzgecler.tur} onChange={(e) => liste.suzgecDegistir({ tur: e.target.value as '' })} secenekler={KONUM_TURLERI.map((t) => ({ deger: t, baslik: KONUM_ETIKETI[t] }))} bosSecenek="Hepsi" />}>
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
          <Tablo etiket="Konumlar" sutunlar={SUTUNLAR} satirlar={l.data?.satirlar ?? []} satirAnahtari={(k) => k.id} mesgul={l.isPending}
            satirSec={(k) => { void yonlendir(`/stok/konumlar/${k.id}`); }} siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir} bosMesaj="Konum yok."
            {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
        )}
      </Kart>
      </>}
      {ac && <KonumAcPenceresi kapat={() => setAc(false)} ilkTur={ac} />}
    </section>
  );
}
