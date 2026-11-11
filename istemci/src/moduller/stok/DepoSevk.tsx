// Depo sevk listesi (944, 957 a, 966 b): sevkiyat "Sevk et" ya da "Al" deyince (firma taşımasında serbest bırakılınca) kalem buraya düşer.
// Gidiş son çıkışla, geliş mal kabulle biter; stok hareketi burada yazılır.
import { useNavigate } from 'react-router-dom';
import type { KalemKaynagi } from '#paylasilan/sozlesme/sevkiyat.ts';
import type { DepoSevkSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { kabulYolu, useDepoCikisi, useDepoSevk } from './depo-sevk.ts';
import { miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, SayfaBasi, useIslem } from './ortak.tsx';
import './stok.css';

const KAYNAK_ADI: Record<KalemKaynagi, string> = { urun: 'Ürün', fason: 'Fason gidişi', 'fason-donus': 'Fason dönüşü', alim: 'Alım', elle: 'Elle iş' };
// Çıkışta stoğun gittiği yer; kabulde yazılan fişler.
const CIKIS_YERI: Record<KalemKaynagi, string> = {
  urun: 'Stoktan sevk çıkışıyla düşer', fason: 'Yarı parça firmanın fason konumuna geçer', 'fason-donus': '', alim: '', elle: 'Parça firmanın konumuna geçer',
};
const KABUL_FISI: Record<KalemKaynagi, string> = {
  urun: '', fason: '', 'fason-donus': 'Karantinaya giriş; kararı GKK verir', alim: 'Sipariş satırına giriş fişi', elle: 'Giriş fişi',
};

const kalemAdi = (s: DepoSevkSatiri): string => s.malzemeAd ?? (s.malzemeId === null ? 'Malzeme' : `#${s.malzemeId}`);
const emirMetni = (s: DepoSevkSatiri): string => [s.emirNo, s.opNo === null ? null : `OP ${s.opNo}`].filter(Boolean).join(' · ');

export function DepoSevk() {
  const cikisYapar = useIslem('stok.cikis');
  const kabulYapar = useIslem('stok.giris');
  const liste = useDepoSevk();
  const cikis = useDepoCikisi();
  const { bildir } = useBildirim();
  const yonlendir = useNavigate();
  const cikisYap = (s: DepoSevkSatiri) => {
    cikis.mutate(s.kalemId, {
      onSuccess: (c) => {
        bildir('tamam', `Son çıkış yapıldı${s.firmaAd ? ` · ${s.firmaAd}` : ''}.`);
        for (const u of c.uyarilar ?? []) bildir('bilgi', u);
      },
      onError: (h) => { bildir('hata', hataMetni(h)); },
    });
  };
  const sutunlar = (tur: 'cikis' | 'kabul'): Sutun<DepoSevkSatiri>[] => [
    { anahtar: 'is', baslik: 'Kalem', sabit: 'sol', kes: true, csv: kalemAdi, hucre: (s) => <strong>{kalemAdi(s)}</strong> },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (s) => KAYNAK_ADI[s.kaynak] || '—' },
    { anahtar: 'emir', baslik: 'Emir', mono: true, hucre: (s) => emirMetni(s) || '—' },
    {
      anahtar: 'adet', baslik: 'Adet', hizala: 'sag', kirilmaz: true,
      hucre: (s) => (s.adet === null ? '—' : s.kabulAdet === null ? miktarMetni(s.adet) : `${miktarMetni(s.kabulAdet)} / ${miktarMetni(s.adet)}`),
    },
    { anahtar: 'firma', baslik: 'Firma', kes: true, hucre: (s) => s.firmaAd ?? '—' },
    {
      anahtar: 'tasima', baslik: 'Taşıma',
      hucre: (s) => (s.tasima === 'firma' ? <Rozet ton="pasif">{tur === 'cikis' ? 'Firma alır' : 'Firma getirir'}</Rozet> : <Rozet ton="bilgi">Sevkiyat aracı</Rozet>),
    },
    {
      anahtar: 'tetik', baslik: 'Düştü', kirilmaz: true,
      hucre: (s) => zamanMetni(s.tetiklendi),
    },
    { anahtar: 'erken', baslik: 'Erken', csv: (s) => (s.erken ? 'Erken çıkış' : ''), hucre: (s) => (s.erken ? <Rozet ton="uyari">Erken çıkış</Rozet> : '—') },
    { anahtar: 'ne', baslik: tur === 'cikis' ? 'Stok' : 'Fiş', kes: true, hucre: (s) => (tur === 'cikis' ? CIKIS_YERI[s.kaynak] : KABUL_FISI[s.kaynak]) || '—' },
    {
      anahtar: 'eylem', baslik: '', hizala: 'sag', sabit: 'sag',
      hucre: (s) => (tur === 'cikis'
        ? cikisYapar && <Dugme tur="birincil" simge="upload" yukleniyor={cikis.isPending && cikis.variables === s.kalemId} onClick={() => cikisYap(s)}>Çıkışı yap</Dugme>
        : kabulYapar && <Dugme tur="birincil" simge="download" onClick={() => { void yonlendir(kabulYolu(s.kalemId)); }}>Kabul et</Dugme>),
    },
  ];
  if (liste.isError) return <section className="tc-stok"><DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => void liste.refetch()} /></section>;
  const satirlar = liste.data ?? [];
  const cikacak = satirlar.filter((s) => s.is === 'cikis');
  const girecek = satirlar.filter((s) => s.is === 'kabul');
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Depo sevk" aciklama="Sevkiyatın tetiklediği gidişler son çıkış, gelişler kabul bekler. Firma kendisi alıyor ya da getiriyorsa kalem serbest bırakılınca düşer." />
      <Kart baslik={`Son çıkış bekleyen · ${cikacak.length}`}>
        <Tablo etiket="Son çıkış bekleyen" kip="kaydir" sutunlar={sutunlar('cikis')} satirlar={cikacak} satirAnahtari={(s) => s.kalemId} mesgul={liste.isPending} bosMesaj="Son çıkış bekleyen kalem yok." />
      </Kart>
      <Kart baslik={`Kabul bekleyen · ${girecek.length}`}>
        <Tablo etiket="Kabul bekleyen" kip="kaydir" sutunlar={sutunlar('kabul')} satirlar={girecek} satirAnahtari={(s) => s.kalemId} mesgul={liste.isPending} bosMesaj="Kabul bekleyen kalem yok." />
      </Kart>
    </section>
  );
}
