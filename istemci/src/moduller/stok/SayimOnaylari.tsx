// Sayım onayları (1279 a, 1691 teyit): deponun eşiğini aşan sayım farkı stoğa yazılmadan burada bekler. Sayandan başka yetkili onaylar ya
// da nedenle reddeder; onayda sayımdaki fark yazılır, sayımdan sonraki hareketler korunur. Eşik depo başına yüzdedir; 0 her farkı onaya gönderir.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import type {
  SayimEsigiGovdesi, SayimFarki, SayimFarkiOnayGovdesi, SayimFarkiRedGovdesi, SayimFarklariCevabi, TopluSayimOnayCevabi, TopluSayimOnayGovdesi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni, SAYIM_KAYNAGI, SIFIRLAMA_NEDENI, zamanMetni } from './gorunum.ts';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

type Esik = SayimFarklariCevabi['esikler'][number];
const DURUM: Record<SayimFarki['durum'], { ad: string; ton: 'uyari' | 'tamam' | 'pasif' }> = {
  bekliyor: { ad: 'Onay bekliyor', ton: 'uyari' }, onaylandi: { ad: 'Onaylandı', ton: 'tamam' }, reddedildi: { ad: 'Reddedildi', ton: 'pasif' },
};
export const farkMetni = (f: string) => (f.startsWith('-') ? miktarMetni(f) : `+${miktarMetni(f)}`);
// Sistemde satırı olmayan (sayımda bulunan) malzemenin sistem miktarı 0'dır: "0" yerine "Kayıt yok" (3417 a).
const sistemMetni = (m: string) => (Number(m) === 0 ? 'Kayıt yok' : miktarMetni(m));
// Eski yol: menü maddesi Sayım ve düzeltme sayfasının sekmesine taşındı (3417 a); yer imleri çalışmaya devam eder.
export function SayimOnaylari() {
  return <Navigate to="/stok/sayim-duzeltme?sekme=onay" replace />;
}

function RedPenceresi({ fark, kapat }: { fark: SayimFarki; kapat: () => void }) {
  const [neden, setNeden] = useState('');
  const { komut } = useStokKomutu((g: SayimFarkiRedGovdesi) => korumaliPost(`/stok/sayim-farklari/${fark.id}/reddet`, g), 'Sayım farkı reddedildi.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik={`${fark.malzemeAd ?? `Kart ${fark.malzemeId}`} · ${fark.konumKod}`} tur="yan"
      alt={<Dugme tur="birincil" simge="x" yukleniyor={komut.isPending} disabled={neden.trim() === ''} onClick={() => komut.mutate({ surum: fark.surum, neden })}>Reddet</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-not">Reddedilen fark stoğa yazılmaz; göz yeniden sayılabilir.</p>
        <Girdi etiket="Red nedeni" value={neden} maxLength={200} onChange={(e) => setNeden(e.target.value)} />
      </div>
    </Pencere>
  );
}

function EsikSatiri({ esik, yazabilir }: { esik: Esik; yazabilir: boolean }) {
  const [deger, setDeger] = useState(esik.esikYuzde);
  const { komut } = useStokKomutu((g: SayimEsigiGovdesi) => korumaliPost(`/stok/depolar/${esik.depoId}/sayim-esigi`, g), 'Sayım eşiği kaydedildi.');
  if (!yazabilir) return <span>%{miktarMetni(esik.esikYuzde)}</span>;
  return (
    <span className="tc-stok-dugmeler">
      <Girdi etiket={`${esik.depoKod} sayım eşiği (%)`} inputMode="decimal" value={deger} onChange={(e) => setDeger(e.target.value)} />
      <Dugme simge="check" yukleniyor={komut.isPending} onClick={() => komut.mutate({ surum: esik.surum, esikYuzde: deger.replace(',', '.') })}>Kaydet</Dugme>
    </span>
  );
}

// Sayım ve düzeltme sayfasının Onay bekleyen sekmesi (3417 a): seçim kutusuyla toplu onay; satırdaki Onayla ve Reddet ikincildir.
// 3417 Arayüz: geniş ekranda kayan tablo (sabit konum sütunu), telefonda kart kipi; uyarlanır tablo 1280'de de karta düşüyordu.
const TELEFON = '(max-width: 767px)';
function useGenisEkran(): boolean {
  const [genis, genisYaz] = useState(() => !(window.matchMedia?.(TELEFON).matches ?? false));
  useEffect(() => {
    const m = window.matchMedia?.(TELEFON);
    if (!m) return undefined;
    const dinle = () => genisYaz(!m.matches);
    m.addEventListener('change', dinle);
    return () => m.removeEventListener('change', dinle);
  }, []);
  return genis;
}

export function SayimOnayPaneli() {
  const genis = useGenisEkran();
  const onaylayabilir = useIslem('stok.sayim-onayla');
  const ben = useOturum().data?.id ?? null;
  const { bildir } = useBildirim();
  const [red, setRed] = useState<SayimFarki | null>(null);
  const [secim, setSecim] = useState<Record<number, number>>({});
  const liste = useQuery({ queryKey: anahtarlar.liste('sayim-farklari', {}), queryFn: () => api.get<SayimFarklariCevabi>('/stok/sayim-farklari') });
  const { komut: onay } = useStokKomutu((f: SayimFarki) => korumaliPost(`/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum } satisfies SayimFarkiOnayGovdesi), 'Sayım farkı stoğa yazıldı.');
  // Her fark ayrı yazılır: reddedilenler bildirilir, ötekiler stoğa yazılmış olur.
  const { komut: toplu } = useStokKomutu(async (g: TopluSayimOnayGovdesi) => {
    const c = await korumaliPost<TopluSayimOnayCevabi>('/stok/sayim-farklari/toplu-onayla', g);
    const tamam = c.sonuclar.filter((x) => x.tamam).length;
    const red = c.sonuclar.filter((x) => !x.tamam);
    if (red.length === 0) bildir('tamam', `${tamam} fark stoğa yazıldı.`);
    else bildir('hata', `${tamam} fark stoğa yazıldı; ${red.length} fark yazılamadı: ${red.map((x) => x.ileti ?? '').filter((x) => x !== '').join(' ')}`);
    return c;
  }, null, () => setSecim({}));
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />;
  const bekleyen = liste.data.farklar.filter((f) => f.durum === 'bekliyor');
  const secilebilir = (f: SayimFarki) => onaylayabilir && f.sayanKisiId !== ben;
  const seciliOlanlar = bekleyen.filter((f) => secim[f.id] !== undefined && secilebilir(f));
  const sec = (f: SayimFarki) => setSecim((x) => {
    const y = { ...x };
    if (y[f.id] === undefined) y[f.id] = f.surum; else delete y[f.id];
    return y;
  });
  const kararli = liste.data.farklar.filter((f) => f.durum !== 'bekliyor');
  // 3417 Arayüz: onaylayan farkı kaydırmadan görür; miktarlar malzemenin hemen arkasında, parti malzemenin altında,
  // kaynak ve sayan sonda (iki kişili onayın amacı farkı görerek onaylamak, 3275 a).
  const bas: Sutun<SayimFarki>[] = [
    { anahtar: 'konum', baslik: 'Konum', mono: true, sabit: 'sol', hucre: (f) => <Link to={`/stok/konumlar/${f.konumId}`}>{f.konumKod}</Link>, csv: (f) => f.konumKod },
    {
      anahtar: 'malzeme', baslik: 'Malzeme / parti', csv: (f) => `${f.malzemeAd ?? `Kart ${f.malzemeId}`} · ${f.partiEtiketi ?? 'Parti bilinmiyor'}`,
      hucre: (f) => (
        <span className="tc-stok-iki-satir">
          <Link to={`/stok/malzemeler/${f.malzemeId}`}>{f.malzemeAd ?? `Kart ${f.malzemeId}`}</Link>
          <span className="tc-stok-not">{f.partiEtiketi ?? 'Parti bilinmiyor'}</span>
        </span>
      ),
    },
    { anahtar: 'sistem', baslik: 'Sayımda', hizala: 'sag', hucre: (f) => sistemMetni(f.sistemMiktar) },
    { anahtar: 'sayilan', baslik: 'Sayılan', hizala: 'sag', hucre: (f) => miktarMetni(f.sayilanMiktar) },
    { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', hucre: (f) => <strong>{farkMetni(f.fark)}</strong> },
  ];
  const son: Sutun<SayimFarki>[] = [
    {
      anahtar: 'kaynak', baslik: 'Kaynak / neden', csv: (f) => `${SAYIM_KAYNAGI[f.kaynak]}${f.neden ? ` · ${SIFIRLAMA_NEDENI[f.neden]}` : ''}`,
      hucre: (f) => (
        <span className="tc-stok-iki-satir">
          <span>{SAYIM_KAYNAGI[f.kaynak]}</span>
          <span className="tc-stok-not">{f.neden ? SIFIRLAMA_NEDENI[f.neden] : '—'}{f.aciklama ? ` · ${f.aciklama}` : ''}</span>
        </span>
      ),
    },
    {
      anahtar: 'sayan', baslik: 'Sayan / zaman', csv: (f) => `${f.sayanAd ?? '—'} · ${zamanMetni(f.sayimZamani)}`,
      hucre: (f) => (
        <span className="tc-stok-iki-satir">
          <span>{f.sayanAd ?? '—'}</span>
          <span className="tc-stok-not">{zamanMetni(f.sayimZamani)}</span>
        </span>
      ),
    },
  ];
  const bekleyenSutunlari: Sutun<SayimFarki>[] = [
    ...(onaylayabilir ? [{
      anahtar: 'sec', baslik: '', sabit: 'sol' as const,
      hucre: (f: SayimFarki) => (secilebilir(f)
        ? <input type="checkbox" aria-label={`${f.konumKod} ${f.malzemeAd ?? f.malzemeId} seç`} checked={secim[f.id] !== undefined} onChange={() => sec(f)} />
        : <span />),
    }] : []),
    ...bas,
    { anahtar: 'guncel', baslik: 'Bugün sistemde', hizala: 'sag', hucre: (f) => sistemMetni(f.guncelMiktar) },
    ...son,
    {
      anahtar: 'eylem', baslik: '', hizala: 'sag', sabit: 'sag',
      hucre: (f) => (!onaylayabilir ? <Rozet ton="uyari">Onay bekliyor</Rozet> : f.sayanKisiId === ben ? <Rozet ton="pasif">Kendi sayımınız</Rozet> : (
        <span className="tc-stok-dugmeler">
          <Dugme simge="check" yukleniyor={onay.isPending && onay.variables?.id === f.id} onClick={() => onay.mutate(f)}>Onayla</Dugme>
          <Dugme simge="x" onClick={() => setRed(f)}>Reddet</Dugme>
        </span>
      )),
    },
  ];
  const kararSutunlari: Sutun<SayimFarki>[] = [
    ...bas,
    ...son,
    { anahtar: 'durum', baslik: 'Karar', hucre: (f) => <Rozet ton={DURUM[f.durum].ton}>{DURUM[f.durum].ad}</Rozet>, csv: (f) => DURUM[f.durum].ad },
    { anahtar: 'karar', baslik: 'Karar veren', kes: true, hucre: (f) => f.kararAd ?? '—' },
    { anahtar: 'kararZamani', baslik: 'Karar zamanı', hucre: (f) => (f.kararZamani ? zamanMetni(f.kararZamani) : '—') },
    { anahtar: 'not', baslik: 'Not', kes: true, hucre: (f) => f.kararNotu ?? '—' },
  ];
  const esikSutunlari: Sutun<Esik>[] = [
    { anahtar: 'depo', baslik: 'Depo', sabit: 'sol', kes: true, hucre: (e) => `${e.depoKod} · ${e.depoAd}` },
    { anahtar: 'esik', baslik: 'Eşik', hucre: (e) => <EsikSatiri key={`${e.depoId}-${e.surum}`} esik={e} yazabilir={onaylayabilir} /> },
  ];
  return (
    <>
      <Kart baslik={`Onay bekleyen · ${bekleyen.length}`} sag={onaylayabilir && (
        <Dugme tur="birincil" simge="check" disabled={seciliOlanlar.length === 0} yukleniyor={toplu.isPending}
          onClick={() => toplu.mutate({ farklar: seciliOlanlar.map((f) => ({ id: f.id, surum: f.surum })) })}>
          {seciliOlanlar.length === 0 ? 'Seçilenleri onayla' : `Seçilenleri onayla (${seciliOlanlar.length})`}
        </Dugme>
      )}>
        <Tablo etiket="Onay bekleyen sayım farkları" kip={genis ? 'kaydir' : 'uyarlanir'} sutunlar={bekleyenSutunlari} satirlar={bekleyen} satirAnahtari={(f) => f.id} bosMesaj="Onay bekleyen sayım farkı yok." />
      </Kart>
      <Kart baslik="Sayım eşiği">
        <p className="tc-stok-not">Farkın sistem miktarına oranı eşiği aşarsa onaya gider. 0 her farkı onaya gönderir; sistemde stok yoksa fark her zaman onaya gider.</p>
        <Tablo etiket="Sayım eşikleri" kip="kaydir" sutunlar={esikSutunlari} satirlar={liste.data.esikler} satirAnahtari={(e) => e.depoId} bosMesaj="Depo yok." />
      </Kart>
      <Kart baslik="Karara bağlananlar">
        <Tablo etiket="Karara bağlanan sayım farkları" kip="kaydir" sutunlar={kararSutunlari} satirlar={kararli} satirAnahtari={(f) => f.id} bosMesaj="Karara bağlanan sayım farkı yok." />
      </Kart>
      {red && <RedPenceresi fark={red} kapat={() => setRed(null)} />}
    </>
  );
}
