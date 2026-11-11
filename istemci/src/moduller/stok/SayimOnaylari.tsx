// Sayım onayları (1279 a, 1691 teyit): deponun eşiğini aşan sayım farkı stoğa yazılmadan burada bekler. Sayandan başka yetkili onaylar ya
// da nedenle reddeder; onayda sayımdaki fark yazılır, sayımdan sonraki hareketler korunur. Eşik depo başına yüzdedir; 0 her farkı onaya gönderir.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SayimEsigiGovdesi, SayimFarki, SayimFarkiOnayGovdesi, SayimFarkiRedGovdesi, SayimFarklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

type Esik = SayimFarklariCevabi['esikler'][number];
const DURUM: Record<SayimFarki['durum'], { ad: string; ton: 'uyari' | 'tamam' | 'pasif' }> = {
  bekliyor: { ad: 'Onay bekliyor', ton: 'uyari' }, onaylandi: { ad: 'Onaylandı', ton: 'tamam' }, reddedildi: { ad: 'Reddedildi', ton: 'pasif' },
};
const farkMetni = (f: string) => (f.startsWith('-') ? miktarMetni(f) : `+${miktarMetni(f)}`);

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

export function SayimOnaylari() {
  const onaylayabilir = useIslem('stok.sayim-onayla');
  const ben = useOturum().data?.id ?? null;
  const [red, setRed] = useState<SayimFarki | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.liste('sayim-farklari', {}), queryFn: () => api.get<SayimFarklariCevabi>('/stok/sayim-farklari') });
  const { komut: onay } = useStokKomutu((f: SayimFarki) => korumaliPost(`/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum } satisfies SayimFarkiOnayGovdesi), 'Sayım farkı stoğa yazıldı.');
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} />;
  const bekleyen = liste.data.farklar.filter((f) => f.durum === 'bekliyor');
  const kararli = liste.data.farklar.filter((f) => f.durum !== 'bekliyor');
  const ortak: Sutun<SayimFarki>[] = [
    { anahtar: 'konum', baslik: 'Konum', mono: true, sabit: 'sol', hucre: (f) => <Link to={`/stok/konumlar/${f.konumId}`}>{f.konumKod}</Link>, csv: (f) => f.konumKod },
    { anahtar: 'malzeme', baslik: 'Malzeme', kes: true, hucre: (f) => <Link to={`/stok/malzemeler/${f.malzemeId}`}>{f.malzemeAd ?? `Kart ${f.malzemeId}`}</Link>, csv: (f) => f.malzemeAd ?? `Kart ${f.malzemeId}` },
    { anahtar: 'parti', baslik: 'Parti', kes: true, hucre: (f) => f.partiEtiketi ?? 'Parti bilinmiyor' },
    { anahtar: 'sistem', baslik: 'Sayımda sistem', hizala: 'sag', hucre: (f) => miktarMetni(f.sistemMiktar) },
    { anahtar: 'sayilan', baslik: 'Sayılan', hizala: 'sag', hucre: (f) => miktarMetni(f.sayilanMiktar) },
    { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', hucre: (f) => <strong>{farkMetni(f.fark)}</strong> },
    { anahtar: 'sayan', baslik: 'Sayan', kes: true, hucre: (f) => f.sayanAd ?? '—' },
    { anahtar: 'sayimZamani', baslik: 'Sayım zamanı', hucre: (f) => zamanMetni(f.sayimZamani) },
  ];
  const bekleyenSutunlari: Sutun<SayimFarki>[] = [
    ...ortak,
    { anahtar: 'guncel', baslik: 'Bugün sistemde', hizala: 'sag', hucre: (f) => miktarMetni(f.guncelMiktar) },
    {
      anahtar: 'eylem', baslik: '', hizala: 'sag', sabit: 'sag',
      hucre: (f) => (!onaylayabilir ? <Rozet ton="uyari">Onay bekliyor</Rozet> : f.sayanKisiId === ben ? <Rozet ton="pasif">Kendi sayımınız</Rozet> : (
        <span className="tc-stok-dugmeler">
          <Dugme tur="birincil" simge="check" yukleniyor={onay.isPending && onay.variables?.id === f.id} onClick={() => onay.mutate(f)}>Onayla</Dugme>
          <Dugme simge="x" onClick={() => setRed(f)}>Reddet</Dugme>
        </span>
      )),
    },
  ];
  const kararSutunlari: Sutun<SayimFarki>[] = [
    ...ortak,
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
    <section className="tc-stok">
      <SayfaBasi baslik="Sayım onayları" aciklama="Kör sayımda deponun eşiğini aşan fark stoğa yazılmaz; sayandan başka yetkili onaylar ya da reddeder." />
      <Kart baslik={`Onay bekleyen · ${bekleyen.length}`}>
        <Tablo etiket="Onay bekleyen sayım farkları" kip="kaydir" sutunlar={bekleyenSutunlari} satirlar={bekleyen} satirAnahtari={(f) => f.id} bosMesaj="Onay bekleyen sayım farkı yok." />
      </Kart>
      <Kart baslik="Sayım eşiği">
        <p className="tc-stok-not">Farkın sistem miktarına oranı eşiği aşarsa onaya gider. 0 her farkı onaya gönderir; sistemde stok yoksa fark her zaman onaya gider.</p>
        <Tablo etiket="Sayım eşikleri" kip="kaydir" sutunlar={esikSutunlari} satirlar={liste.data.esikler} satirAnahtari={(e) => e.depoId} bosMesaj="Depo yok." />
      </Kart>
      <Kart baslik="Son kararlar">
        <Tablo etiket="Karara bağlanan sayım farkları" kip="kaydir" sutunlar={kararSutunlari} satirlar={kararli} satirAnahtari={(f) => f.id} bosMesaj="Karara bağlanan sayım farkı yok." />
      </Kart>
      {red && <RedPenceresi fark={red} kapat={() => setRed(null)} />}
    </section>
  );
}
