import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { LogoFisBilgisi, MalzemeFisiOzeti, MalzemeFisiTuru, MalzemeFisleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sayfalama, Secim, Sekmeler, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { LOGO_FIS_ETIKETI, LOGO_FIS_SUZGECLERI, LOGO_FIS_TONU, MALZEME_FISI_ETIKETI, MALZEME_FISI_SIMGESI, MALZEME_FISI_TURLERI, zamanMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni } from './ortak.tsx';
import './stok.css';

const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const GUN = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const gunAnahtari = (iso: string): string => new Date(iso).toDateString();
function gunBasligi(iso: string): string {
  const g = new Date(iso), bugun = new Date(), dun = new Date(Date.now() - 86_400_000);
  if (g.toDateString() === bugun.toDateString()) return 'Bugün';
  if (g.toDateString() === dun.toDateString()) return 'Dün';
  return GUN.format(g);
}

export function FisTuruRozeti({ tur }: { tur: MalzemeFisiTuru }) {
  return <Rozet ton="bilgi"><Simge ad={MALZEME_FISI_SIMGESI[tur]} boyut="k" /> {MALZEME_FISI_ETIKETI[tur]}</Rozet>;
}
// Ekranda durum metni hep yazılır; neden ipucundadır (bekleme nedeni, hata metni ya da Logo kayıt no).
export function LogoDurumRozeti({ logo }: { logo: LogoFisBilgisi }) {
  const ipucu = logo.durum === 'gonderildi' && logo.kayitNo !== null ? `Logo kayıt ${logo.kayitNo}` : (logo.neden ?? undefined);
  return <span title={ipucu}><Rozet ton={LOGO_FIS_TONU[logo.durum]}>{LOGO_FIS_ETIKETI[logo.durum]}</Rozet></span>;
}
export const kaynakMetni = (f: MalzemeFisiOzeti) => (f.uretimEmriId !== null
  ? <Link to={`/uretim-emirleri/${f.uretimEmriId}`}>Emir {f.emirNo ?? `#${f.uretimEmriId}`}</Link>
  : f.tur === 'ambar' ? 'Depolar arası taşıma' : 'Sayım');

function csvIndir(satirlar: MalzemeFisiOzeti[]) {
  const alan = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const basliklar = ['Açılış', 'Fiş no', 'Tür', 'Emir', 'Satır', 'Logo durumu', 'Logo kayıt', 'Son deneme', 'Neden'];
  const govde = satirlar.map((f) => [f.acilis, f.no, MALZEME_FISI_ETIKETI[f.tur], f.emirNo, f.satirSayisi, LOGO_FIS_ETIKETI[f.logo.durum], f.logo.kayitNo, f.logo.sonDeneme, f.logo.neden].map(alan).join(';'));
  const blob = new Blob(['﻿' + [basliklar.map(alan).join(';'), ...govde].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `malzeme-fisleri-${tesisGunu(Date.now())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function MalzemeFisleri() {
  const liste = useListeDurumu({
    suzgecler: { tur: '' as '' | MalzemeFisiTuru, logoDurumu: '' as '' | (typeof LOGO_FIS_SUZGECLERI)[number], metin: '', uretimEmriId: '' as number | '' },
    suzgecDegerleri: { tur: MALZEME_FISI_TURLERI, logoDurumu: LOGO_FIS_SUZGECLERI }, suzgecTurleri: { uretimEmriId: 'sayi' }, siralamaAlanlari: ['acilis'], adres: true,
  });
  const [arama, setArama] = useState(liste.suzgecler.metin);
  useEffect(() => { const t = setTimeout(() => { if (arama !== liste.suzgecler.metin) liste.suzgecDegistir({ metin: arama }); }, 300); return () => clearTimeout(t); }, [arama]);
  const l = useQuery({ queryKey: anahtarlar.liste('malzeme-fisleri', liste.sorgu), queryFn: () => api.get<MalzemeFisleriCevabi>(`/stok/malzeme-fisleri${sorguMetni(liste.sorgu)}`) });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  const sekmeler = [{ anahtar: '' as const, baslik: 'Tümü' }, ...MALZEME_FISI_TURLERI.map((t) => ({ anahtar: t, baslik: MALZEME_FISI_ETIKETI[t] }))];
  const sutunlar: Sutun<MalzemeFisiOzeti>[] = [
    { anahtar: 'saat', baslik: 'Saat', kirilmaz: true, hucre: (f) => SAAT.format(new Date(f.acilis)) },
    { anahtar: 'no', baslik: 'Fiş no', mono: true, hucre: (f) => <Link to={`/stok/malzeme-fisleri/${f.id}`}>{f.no}</Link> },
    { anahtar: 'tur', baslik: 'Tür', hucre: (f) => <FisTuruRozeti tur={f.tur} /> },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: kaynakMetni },
    { anahtar: 'satir', baslik: 'Satır', hizala: 'sag', hucre: (f) => f.satirSayisi },
    { anahtar: 'tmi', baslik: 'TMI', hucre: (f) => (f.satirSayisi === 0 ? <Rozet ton="pasif">Boş</Rozet> : <Rozet ton="bilgi">Açık</Rozet>) },
    { anahtar: 'logo', baslik: 'Logo', hucre: (f) => <LogoDurumRozeti logo={f.logo} /> },
    { anahtar: 'deneme', baslik: 'Son deneme', hucre: (f) => zamanMetni(f.logo.sonDeneme) },
  ];
  const gruplar: { anahtar: string; baslik: string; satirlar: MalzemeFisiOzeti[] }[] = [];
  for (const f of l.data?.satirlar ?? []) {
    const k = gunAnahtari(f.acilis), son = gruplar[gruplar.length - 1];
    if (son && son.anahtar === k) son.satirlar.push(f); else gruplar.push({ anahtar: k, baslik: gunBasligi(f.acilis), satirlar: [f] });
  }
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Malzeme fişleri" alt="Üretim emri, sayım ve depolar arası taşıma fişleri. Fiş stok hareketinden oluşur; elle düzenlenmez."
        sag={<Dugme simge="download" disabled={!l.data?.satirlar.length} onClick={() => l.data && csvIndir(l.data.satirlar)}>CSV indir</Dugme>} />
      <div className="tc-stok-arac">
        <Girdi etiket="Ara" placeholder="Fiş no (SF-, SE-, AF-)" value={arama} onChange={(e) => setArama(e.target.value)} />
        <Secim etiket="Logo durumu" value={liste.suzgecler.logoDurumu} bosSecenek="Tümü"
          secenekler={LOGO_FIS_SUZGECLERI.map((d) => ({ deger: d, baslik: LOGO_FIS_ETIKETI[d] }))}
          onChange={(e) => liste.suzgecDegistir({ logoDurumu: e.target.value as '' | (typeof LOGO_FIS_SUZGECLERI)[number] })} />
      </div>
      <Sekmeler etiket="Tür" sekmeler={sekmeler} secili={liste.suzgecler.tur} sec={(t) => liste.suzgecDegistir({ tur: t })} />
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data && l.data.satirlar.length === 0 && <DurumKutusu durum="bos" mesaj="Bu süzgece uyan fiş yok." />}
      {gruplar.map((g) => (
        <Kart key={g.anahtar} baslik={g.baslik}>
          <Tablo etiket="Malzeme fişleri" sutunlar={sutunlar} satirlar={g.satirlar} satirAnahtari={(f) => f.id} bosMesaj="Fiş yok." />
        </Kart>
      ))}
      {l.data && l.data.satirlar.length > 0 && <Sayfalama sayfa={l.data.sayfa} sayfaBoyu={l.data.sayfaBoyu} toplam={l.data.toplam} degistir={liste.sayfaDegistir} satirSayisi={l.data.satirlar.length} />}
    </section>
  );
}
