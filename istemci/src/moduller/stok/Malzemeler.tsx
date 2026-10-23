import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { MalzemelerCevabi, MalzemeStokSatiri, PanelCevabi } from '#paylasilan/sozlesme/stok.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, MALZEME_TURU, STOK_DURUMLARI, birimliMiktar, miktarMetni } from './gorunum.ts';
import { EtiketPenceresi } from './Etiketler.tsx';
import { HizliIslem, SatirEylemleri, type HizliIslemTuru } from './HizliIslem.tsx';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

// Önizlemedeki raf etiketleri: konum kodu, kat rengiyle; en çok üç, fazlası +n.
function KonumEtiketleri({ m }: { m: MalzemeStokSatiri }) {
  return (
    <span className="tc-stok-etiketler">
      {m.konumlar.map((k) => (
        <span key={k.kod} className="tc-stok-etiket">{k.katNo !== null && <span className={`tc-stok-kat tc-stok-kat-${((k.katNo - 1) % 6) + 1}`} />}{k.kod}</span>
      ))}
      {m.konumSayisi > m.konumlar.length && <span className="tc-stok-etiket">+{m.konumSayisi - m.konumlar.length}</span>}
    </span>
  );
}

const SUTUNLAR = (sec: (m: MalzemeStokSatiri, t: HizliIslemTuru) => void): Sutun<MalzemeStokSatiri>[] => [
  { anahtar: 'malzeme', baslik: 'Malzeme', sirala: true, hucre: (m) => (
    <span className="tc-stok-ad"><strong>{m.ad ?? `Kart ${m.malzemeId}`}</strong>
      <span><span className="tc-stok-mono">{m.stokKodu ?? `no ${m.malzemeId}`}</span> · {m.tur ? MALZEME_TURU[m.tur] : '—'} {m.durum === 'kritik' || m.durum === 'eksi' ? <Rozet ton={DURUM_ETIKETI[m.durum].ton}>{DURUM_ETIKETI[m.durum].etiket}</Rozet> : null}</span></span>
  ) },
  { anahtar: 'konum', baslik: 'Konumlar', hucre: (m) => <KonumEtiketleri m={m} /> },
  // Büyük sayı serbest stoktur; üretimde statü almış yarı parça (statüde, yalnız statülü bakiye) ve onun emirlere ayrılanı (rezerve)
  // ayrıca yazılır. Karantina ya da kabuldeki statüsüz miktar statüde sayılmaz; toplamdan farkı kalite dışıdır.
  { anahtar: 'toplam', baslik: 'Stok', hizala: 'sag', sirala: true, hucre: (m) => (
    <span className="tc-stok-ad">
      <strong className={`tc-stok-buyuk-miktar ${m.durum === 'eksi' ? 'tc-stok-eksi' : m.durum === 'kritik' ? 'tc-stok-uyari-yazi' : ''}`}>{birimliMiktar(m.serbest, m.birim)}</strong>
      {m.serbest !== m.toplam && (
        <span>{[
          Number(m.statude) !== 0 ? `statüde ${birimliMiktar(m.statude, m.birim)}` : null,
          Number(m.rezerve) > 0 ? `rezerve ${birimliMiktar(m.rezerve, m.birim)}` : null,
          `toplam ${birimliMiktar(m.toplam, m.birim)}`,
        ].filter(Boolean).join(' · ')}</span>
      )}
    </span>
  ) },
  { anahtar: 'eylem', baslik: '', hucre: (m) => <SatirEylemleri m={m} sec={(t) => sec(m, t)} /> },
];

// CSV: ekrandaki sayfanın satırları (Excel Türkçe için noktalı virgül ve BOM; önizlemedeki dışa aktarım).
function csvIndir(satirlar: MalzemeStokSatiri[]) {
  const alan = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const satir = (m: MalzemeStokSatiri) => [m.malzemeId, m.stokKodu, m.ad, m.tur ? MALZEME_TURU[m.tur] : '', m.toplam.replace('.', ','), m.serbest.replace('.', ','), m.birim, m.kritikSeviye?.replace('.', ',') ?? '', DURUM_ETIKETI[m.durum].etiket, m.konumlar.map((k) => k.kod).join(' ')].map(alan).join(';');
  const blob = new Blob(['\ufeff' + [['Kart no', 'Stok kodu', 'Ad', 'Tür', 'Toplam', 'Serbest', 'Birim', 'Kritik seviye', 'Durum', 'Konumlar'].map(alan).join(';'), ...satirlar.map(satir)].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stok-malzemeler-${tesisGunu(Date.now())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Malzemeler() {
  const yonlendir = useNavigate();
  const malKabul = useIslem('stok.giris');
  const liste = useListeDurumu({ suzgecler: { durum: '' as '' | (typeof STOK_DURUMLARI)[number], metin: '', kapsam: '' as '' | 'kartlar' }, suzgecDegerleri: { durum: STOK_DURUMLARI, kapsam: ['kartlar'] as const }, siralamaAlanlari: ['malzeme', 'toplam'], adres: true });
  const [arama, setArama] = useState(liste.suzgecler.metin);
  const [etiket, setEtiket] = useState(false);
  const [hizli, setHizli] = useState<{ m: MalzemeStokSatiri; tur: HizliIslemTuru } | null>(null);
  useEffect(() => { const t = setTimeout(() => { if (arama !== liste.suzgecler.metin) liste.suzgecDegistir({ metin: arama }); }, 300); return () => clearTimeout(t); }, [arama]);
  const l = useQuery({ queryKey: anahtarlar.liste('malzemeler', liste.sorgu), queryFn: () => api.get<MalzemelerCevabi>(`/stok/malzemeler${sorguMetni(liste.sorgu)}`) });
  const p = useQuery({ queryKey: [...anahtarlar.hepsi, 'panel'], queryFn: () => api.get<PanelCevabi>('/stok/panel') });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  const say = (n: number | undefined) => (n === undefined ? '' : ` ${n}`);
  const sekmeler = [
    { anahtar: '', baslik: `Tümü${say(p.data?.malzemeCesidi)}` },
    { anahtar: 'kritik', baslik: `Kritik${say(p.data?.kritik)}` },
    { anahtar: 'eksi', baslik: `Eksi bakiye${say(p.data?.eksi)}` },
    { anahtar: 'kabulde', baslik: `Rafa yerleşmemiş${say(p.data?.kabulde)}` },
    { anahtar: 'statulu', baslik: 'Statülü' },
    { anahtar: 'kartlar', baslik: 'Bütün kartlar' },
  ] as const;
  const kartlar = liste.suzgecler.kapsam === 'kartlar';
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Malzemeler" alt={l.data?.toplam !== null && l.data ? (kartlar ? `${l.data.toplam} stoklanır malzeme kartı; stoğu olmayanlar 0 görünür.` : `${l.data.toplam} malzemenin stoğu ya da stok ayarı var. Stoğu olmayan kart için Bütün kartlar.`) : 'Malzeme başına stok.'}
        sag={<>
          {malKabul && <Link to="/stok/mal-kabul"><Dugme tur="birincil" simge="truck">Mal kabul</Dugme></Link>}
          <Dugme simge="scan" onClick={() => setEtiket(true)}>Etiketler</Dugme>
          <Dugme simge="download" disabled={!l.data?.satirlar.length} onClick={() => l.data && csvIndir(l.data.satirlar)}>CSV</Dugme>
          <Link to="/malzemeler/yeni"><Dugme simge="layers">Malzeme kartı aç</Dugme></Link>
        </>} />
      <div className="tc-stok-arac">
        <Girdi etiket="Ara" placeholder="Ad, stok kodu, statü, konum kodu, parti no ya da kart numarası" value={arama} onChange={(e) => setArama(e.target.value)} />
      </div>
      <div className="tc-stok-sekmeler-sar"><Sekmeler etiket="Durum" sekmeler={sekmeler} secili={kartlar ? 'kartlar' : liste.suzgecler.durum} sec={(d) => liste.suzgecDegistir(d === 'kartlar' ? { durum: '', kapsam: 'kartlar' } : { durum: d, kapsam: '' })} /></div>
      <Kart>
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
          <Tablo etiket="Malzeme stokları" sutunlar={SUTUNLAR((m, tur) => setHizli({ m, tur }))} satirlar={l.data?.satirlar ?? []} satirAnahtari={(m) => m.malzemeId} mesgul={l.isPending}
            satirSec={(m) => { void yonlendir(`/stok/malzemeler/${m.malzemeId}`); }} bosMesaj={kartlar ? 'Malzeme kartı yok; kartı Malzemeler sayfasında açın.' : 'Bu süzgece uyan malzeme yok. Stoğu olmayan kartlar Bütün kartlar sekmesinde.'}
            siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir}
            {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
        )}
      </Kart>
      {hizli && <HizliIslem tur={hizli.tur} m={hizli.m} kapat={() => setHizli(null)} />}
      {etiket && <EtiketPenceresi baslik="Malzeme etiketleri (bu sayfa)" kapat={() => setEtiket(false)} ogeler={(l.data?.satirlar ?? []).map((m) => ({ tur: 'malzeme' as const, no: m.malzemeId, ad: m.ad ?? `Kart ${m.malzemeId}`, kod: m.stokKodu ?? '' }))} />}
    </section>
  );
}
