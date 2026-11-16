import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { IrsaliyeListeSatiri, IrsaliyeListesiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Dugme, DurumKutusu, Kart, Pencere, Rozet, Secim, Simge, Tablo, type Sutun } from '../../../ortak/arayuz/index.ts';
import { api } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { tarihMetni, zamanMetni } from '../../../ortak/veri/zaman-metni.ts';
import { IrsaliyeIcerigi, useIrsaliye } from './IrsaliyeAyrintisi.tsx';
import { ayrintiYolu, DURUMLAR, IRSALIYE_ANAHTARI, type EslesmeDurumu, type IrsaliyeYonu } from './ortak.ts';
import './logo-irsaliyeleri.css';

// 3345 a, düzen A: liste ve sağdan açılan çekmece. Liste logo modülünün aynasından okunur; Logo'ya istek atılmaz, hiçbir kayıt değişmez.
// Fiyat listede yoktur; çekmecede yalnız fiyat yetkisi olana gelir (sunucu maskeler).
const GUNLER = [{ deger: '7', baslik: 'Son 7 gün' }, { deger: '30', baslik: 'Son 30 gün' }, { deger: '90', baslik: 'Son 90 gün' }] as const;
const DURUM_SECENEKLERI = [
  { deger: '', baslik: 'Eşleşme: tümü' },
  ...(['eslesmedi', 'fark', 'eslesti', 'karsiligi-yok', 'iptal', 'logoda-yok'] as const).map((d) => ({ deger: d, baslik: DURUMLAR[d].ad })),
];

type Anahtar = { firma: number; donem: number; kayitNo: number };
const anahtarMetni = (x: Anahtar): string => `${x.firma}-${x.donem}-${x.kayitNo}`;

function DurumHucresi({ s }: { s: IrsaliyeListeSatiri }) {
  const d = DURUMLAR[s.durum];
  return (
    <span className="tc-li-durum">
      <Rozet ton={d.ton}><Simge ad={d.simge} />{d.ad}</Rozet>
      {s.ozet !== '' && <span className="tc-li-soluk">{s.ozet}</span>}
    </span>
  );
}

const SUTUNLAR: readonly Sutun<IrsaliyeListeSatiri>[] = [
  {
    anahtar: 'fisNo', baslik: 'Fiş no', kirilmaz: true, csv: (s) => s.fisNo ?? '',
    hucre: (s) => <span className="tc-li-hucre"><b className="tc-li-mono">{s.fisNo ?? `Kayıt ${s.kayitNo}`}</b><span className="tc-li-soluk">{s.turAdi} · {s.satirSayisi} satır</span></span>,
  },
  { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (s) => tarihMetni(s.tarih), csv: (s) => s.tarih },
  {
    anahtar: 'cari', baslik: 'Cari / belge no', csv: (s) => s.cariAdi ?? s.cariKodu ?? '',
    hucre: (s) => <span className="tc-li-hucre"><span>{s.cariAdi ?? s.cariKodu ?? '—'}</span>{s.belgeNo !== null && <span className="tc-li-mono tc-li-soluk">{s.belgeNo}</span>}</span>,
  },
  { anahtar: 'belge', baslik: 'Belge', hucre: (s) => <Rozet ton={s.eIrsaliye ? 'bilgi' : 'pasif'}>{s.eIrsaliye ? 'e-İrsaliye' : 'Kağıt'}</Rozet>, csv: (s) => (s.eIrsaliye ? 'e-İrsaliye' : 'Kağıt') },
  { anahtar: 'fatura', baslik: 'Fatura', hucre: (s) => s.faturaNo ?? 'Faturasız', csv: (s) => s.faturaNo ?? '' },
  { anahtar: 'durum', baslik: 'CORE karşılığı', kartTamSatir: true, hucre: (s) => <DurumHucresi s={s} />, csv: (s) => `${DURUMLAR[s.durum].ad}${s.ozet === '' ? '' : ` · ${s.ozet}`}` },
];

function KapaliDurum() {
  const yetki = useYetki();
  return (
    <Kart>
      <div className="tc-li-kapali">
        <Simge ad="lock" />
        <h3>Logo&apos;dan irsaliye okuması kapalı</h3>
        <p>Sistem Ayarları&apos;nda &quot;Logo bağlantısı&quot; ve &quot;Logo: irsaliye okuması&quot; açılınca irsaliyeler dakikada bir okunur.</p>
        {yetki.var('ayarlar.yaz') && <Link to="/ayarlar"><Dugme tur="birincil" simge="gear">Sistem Ayarları</Dugme></Link>}
      </div>
    </Kart>
  );
}

function Cekmece({ secili, kapat }: { secili: Anahtar | null; kapat: () => void }) {
  const q = useIrsaliye(secili);
  const git = useNavigate();
  return (
    <Pencere
      acik={secili !== null}
      kapat={kapat}
      baslik="Logo irsaliyesi"
      tur="yan"
      alt={secili !== null && <Dugme simge="file" onClick={() => { void git(ayrintiYolu(secili)); }}>Tam sayfada aç</Dugme>}
    >
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" hata={q.error} yenile={() => { void q.refetch(); }} />
          : <IrsaliyeIcerigi veri={q.data} />}
    </Pencere>
  );
}

export function LogoIrsaliyeleri({ yon }: { yon: IrsaliyeYonu }) {
  const [tur, turYaz] = useState('');
  const [gun, gunYaz] = useState('30');
  const [durum, durumYaz] = useState<EslesmeDurumu | ''>('');
  const [ara, araYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const [secili, seciliYaz] = useState<Anahtar | null>(null);
  const sorgu = new URLSearchParams({ yon, gun, sayfa: String(sayfa) });
  if (tur !== '') sorgu.set('tur', tur);
  if (durum !== '') sorgu.set('durum', durum);
  if (ara.trim() !== '') sorgu.set('ara', ara.trim());
  const q = useQuery({
    queryKey: [...IRSALIYE_ANAHTARI, 'liste', sorgu.toString()],
    queryFn: () => api.get<IrsaliyeListesiCevabi>(`/logo/irsaliyeler?${sorgu.toString()}`),
    placeholderData: keepPreviousData,
  });
  const degistir = <T,>(yaz: (d: T) => void) => (d: T) => { yaz(d); sayfaYaz(1); };
  const suzgecsiz = tur === '' && durum === '' && ara.trim() === '';

  if (q.isPending) return <section className="tc-li-sayfa"><Kart><DurumKutusu durum="yukleniyor" /></Kart></section>;
  if (q.isError) return <section className="tc-li-sayfa"><Kart><DurumKutusu durum="hata" hata={q.error} yenile={() => { void q.refetch(); }} /></Kart></section>;
  const v = q.data;
  if (!v.okuma.acik && v.toplam === 0 && suzgecsiz) return <section className="tc-li-sayfa"><KapaliDurum /></section>;
  const toplam = v.turler.reduce((a, t) => a + t.sayi, 0);
  return (
    <section className="tc-li-sayfa">
      <div className="tc-li-arac">
        <Secim etiket="Dönem" value={gun} onChange={(e) => { degistir(gunYaz)(e.target.value); }} secenekler={GUNLER} />
        <Secim etiket="Eşleşme" value={durum} onChange={(e) => { degistir(durumYaz)(e.target.value as EslesmeDurumu | ''); }} secenekler={DURUM_SECENEKLERI} />
        <span className="tc-li-soluk tc-li-okuma">
          <Simge ad="clock" />
          {v.okuma.acik ? 'Dakikada bir okunur' : 'Okuma kapalı'}{v.okuma.sonOkuma !== null && <> · son okuma {zamanMetni(v.okuma.sonOkuma)}</>}
        </span>
      </div>
      <Tablo<IrsaliyeListeSatiri>
        etiket={yon === 'alis' ? 'Alış irsaliyeleri' : 'Satış irsaliyeleri'}
        sutunlar={SUTUNLAR}
        satirlar={v.satirlar}
        satirAnahtari={anahtarMetni}
        satirSec={(s) => { seciliYaz({ firma: s.firma, donem: s.donem, kayitNo: s.kayitNo }); }}
        mesgul={q.isPlaceholderData}
        bosMesaj={suzgecsiz ? 'Bu dönemde irsaliye yok' : 'Süzgece uyan irsaliye yok'}
        arac={{
          arama: { deger: ara, degistir: degistir(araYaz), etiket: 'İrsaliye ara', yerTutucu: 'Fiş no, belge no, cari ya da malzeme' },
          suzgec: {
            etiket: 'Tür',
            secenekler: [{ deger: '', baslik: `Tümü (${toplam})` }, ...v.turler.map((t) => ({ deger: String(t.tur), baslik: `${t.ad} (${t.sayi})` }))],
            secili: tur,
            sec: degistir(turYaz),
          },
          csv: { ad: yon === 'alis' ? 'logo-alis-irsaliyeleri' : 'logo-satis-irsaliyeleri' },
        }}
        sayfalama={{ sayfa: v.sayfa, sayfaBoyu: v.sayfaBoyu, toplam: v.toplam, degistir: sayfaYaz }}
      />
      <Cekmece secili={secili} kapat={() => { seciliYaz(null); }} />
    </section>
  );
}

export const AlisIrsaliyeleri = () => <LogoIrsaliyeleri yon="alis" />;
export const SatisIrsaliyeleri = () => <LogoIrsaliyeleri yon="satis" />;
