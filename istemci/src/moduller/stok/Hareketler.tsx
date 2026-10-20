import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GeriAlGovdesi, Hareket, HareketCevabi, HareketlerCevabi, HareketTuru } from '#paylasilan/sozlesme/stok.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sayfalama, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CIKIS_NEDENI, HAREKET_ETIKETI, HAREKET_TONU, HAREKET_TURLERI, hareketIsareti, miktarMetni, zamanMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni, useIslem, useStokKomutu } from './ortak.tsx';
import { hareketStatusu, useStatuAdi } from './statu.ts';
import './stok.css';

const yer = (h: Hareket): string => [h.kaynakKonumKod, h.hedefKonumKod].filter(Boolean).join(' → ');
const not = (h: Hareket): string => [
  h.girisKaynagi === 'uretim' ? 'Üretimden giriş' : h.girisKaynagi === 'mal_kabul' ? 'Mal kabul' : null,
  h.cikisNedeni ? CIKIS_NEDENI[h.cikisNedeni] : null,
  h.uretimEmriId !== null ? `Emir ${h.emirNo ?? `#${h.uretimEmriId}`}` : null,
  h.aciklama,
].filter(Boolean).join(' · ');
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const GUN = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const gunAnahtari = (iso: string): string => new Date(iso).toDateString();
function gunBasligi(iso: string): string {
  const g = new Date(iso), bugun = new Date(), dun = new Date(Date.now() - 86_400_000);
  if (g.toDateString() === bugun.toDateString()) return 'Bugün';
  if (g.toDateString() === dun.toDateString()) return 'Dün';
  return GUN.format(g);
}

export function HareketTablosu({ satirlar, geriAl, saatle }: { satirlar: Hareket[]; geriAl?: (h: Hareket) => void; saatle?: boolean }) {
  const statuAdi = useStatuAdi();
  const sutunlar: Sutun<Hareket>[] = [
    { anahtar: 'zaman', baslik: saatle ? 'Saat' : 'Zaman', kirilmaz: true, hucre: (h) => (saatle ? SAAT.format(new Date(h.zaman)) : zamanMetni(h.zaman)) },
    { anahtar: 'tur', baslik: 'Tür', hucre: (h) => <>
      <Rozet ton={HAREKET_TONU[h.tur]}>{HAREKET_ETIKETI[h.tur]}</Rozet>
      {h.onayliEksi && <Rozet ton="hata">Onaylı eksi</Rozet>}{h.geriAlindi && <Rozet ton="pasif">Geri alındı</Rozet>}
    </> },
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (h) => <span className="tc-stok-ad"><strong>{h.malzemeAd ?? `Kart ${h.malzemeId}`}</strong><span>{not(h)}{h.fisId !== null && <> · <Link to={`/stok/fisler/${h.fisId}`}>Fiş {h.fisNo}</Link></>}</span></span> },
    { anahtar: 'parti', baslik: 'Parti', hucre: (h) => h.partiEtiketi ?? '—' },
    { anahtar: 'yer', baslik: 'Yer', mono: true, hucre: yer },
    { anahtar: 'statu', baslik: 'Statü', hucre: (h) => hareketStatusu(h, statuAdi) ?? '—' },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (h) => { const y = hareketIsareti(h); return <strong className={y.eksi ? 'tc-stok-eksi' : ''}>{y.isaret === '⇄' ? '⇄ ' : y.isaret}{miktarMetni(h.miktar)}</strong>; } },
    { anahtar: 'kisi', baslik: 'Kim', hucre: (h) => h.kisiAd ?? '—' },
    ...(geriAl ? [{ anahtar: 'eylem', baslik: '', hucre: (h: Hareket) => (h.tur !== 'geri_alma' && !h.geriAlindi && h.girisKaynagi !== 'mal_kabul' ? <Dugme onClick={() => geriAl(h)}>Geri al</Dugme> : <span />) }] : []),
  ];
  return <Tablo etiket="Hareketler" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(h) => h.id} bosMesaj="Hareket yok." />;
}

// CSV: ekrandaki sayfanın satırları (Excel Türkçe için noktalı virgül ve BOM).
function csvIndir(satirlar: Hareket[], statuAdi: (id: number | null) => string) {
  const alan = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const basliklar = ['Zaman', 'Tür', 'Malzeme', 'Kart no', 'Parti', 'Kaynak', 'Hedef', 'Statü', 'Miktar', 'Onaylı eksi', 'Açıklama', 'Kim'];
  const govde = satirlar.map((h) => [h.zaman, HAREKET_ETIKETI[h.tur], h.malzemeAd, h.malzemeId, h.partiEtiketi, h.kaynakKonumKod, h.hedefKonumKod, hareketStatusu(h, statuAdi), h.miktar.replace('.', ','), h.onayliEksi ? 'evet' : '', not(h), h.kisiAd].map(alan).join(';'));
  const blob = new Blob(['\ufeff' + [basliklar.map(alan).join(';'), ...govde].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `stok-hareketleri-${tesisGunu(Date.now())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Hareketler() {
  const geriAlabilir = useIslem('stok.geri-al');
  const statuAdi = useStatuAdi();
  const liste = useListeDurumu({
    suzgecler: { tur: '' as '' | HareketTuru, metin: '', malzemeId: '' as number | '', partiId: '' as number | '', konumId: '' as number | '' },
    suzgecDegerleri: { tur: HAREKET_TURLERI }, suzgecTurleri: { malzemeId: 'sayi', partiId: 'sayi', konumId: 'sayi' }, siralamaAlanlari: ['zaman'], adres: true,
  });
  const [arama, setArama] = useState(liste.suzgecler.metin);
  useEffect(() => { const t = setTimeout(() => { if (arama !== liste.suzgecler.metin) liste.suzgecDegistir({ metin: arama }); }, 300); return () => clearTimeout(t); }, [arama]);
  const l = useQuery({ queryKey: anahtarlar.liste('hareketler', liste.sorgu), queryFn: () => api.get<HareketlerCevabi>(`/stok/hareketler${sorguMetni(liste.sorgu)}`) });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  const { komut, onayPenceresi } = useStokKomutu((g: GeriAlGovdesi & { id: number }) => {
    const { id, ...govde } = g;
    return api.post<HareketCevabi>(`/stok/hareketler/${id}/geri-al`, govde);
  }, 'Hareket geri alındı.');
  const sekmeler = [{ anahtar: '' as const, baslik: 'Tümü' }, ...HAREKET_TURLERI.map((t) => ({ anahtar: t, baslik: HAREKET_ETIKETI[t] }))];
  const gruplar: { anahtar: string; baslik: string; satirlar: Hareket[] }[] = [];
  for (const h of l.data?.satirlar ?? []) {
    const k = gunAnahtari(h.zaman), son = gruplar[gruplar.length - 1];
    if (son && son.anahtar === k) son.satirlar.push(h); else gruplar.push({ anahtar: k, baslik: gunBasligi(h.zaman), satirlar: [h] });
  }
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Hareketler" alt="Giriş, çıkış, taşıma, sayım ve geri almalar. Hareket silinmez; düzeltme ters harekettir."
        sag={<Dugme simge="sort" disabled={!l.data?.satirlar.length} onClick={() => l.data && csvIndir(l.data.satirlar, statuAdi)}>CSV indir</Dugme>} />
      <div className="tc-stok-arac">
        <Girdi etiket="Ara" placeholder="Konum, parti no ya da açıklama" value={arama} onChange={(e) => setArama(e.target.value)} />
      </div>
      <Sekmeler etiket="Tür" sekmeler={sekmeler} secili={liste.suzgecler.tur} sec={(t) => liste.suzgecDegistir({ tur: t })} />
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data && l.data.satirlar.length === 0 && <DurumKutusu durum="bos" mesaj="Bu süzgece uyan hareket yok." />}
      {gruplar.map((g) => (
        <Kart key={g.anahtar} baslik={g.baslik}>
          <HareketTablosu satirlar={g.satirlar} saatle {...(geriAlabilir ? { geriAl: (h: Hareket) => komut.mutate({ id: h.id }) } : {})} />
        </Kart>
      ))}
      {l.data && l.data.satirlar.length > 0 && <Sayfalama sayfa={l.data.sayfa} sayfaBoyu={l.data.sayfaBoyu} toplam={l.data.toplam} degistir={liste.sayfaDegistir} satirSayisi={l.data.satirlar.length} />}
      {onayPenceresi}
    </section>
  );
}
