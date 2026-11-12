import { useEffect, useState, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { KucukResim } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { BitenEmirlerCevabi, EmirDurumu, IzlemeEmri, IzlemeListeCevabi, KapanisListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { KucukResimKutusu, useKucukResimler } from '../belge-merkezi/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { durumGosterimi, saglamSayisi, zamanMetni } from './gorunum.ts';
import { beklemeNedeni } from './Bekletme.tsx';
import './uretim-emirleri.css';

type Gorunum = 'acik' | 'bitenler';
const GORUNUMLER = [{ anahtar: 'acik', baslik: 'Açık emirler', simge: 'list' }, { anahtar: 'bitenler', baslik: 'Bitenler', simge: 'check' }] as const;

// Emrin şu an nerede olduğu (3039): çalışan adım, yoksa sıradaki açık adım; istasyon ve duruş nedeni yanında. Adım bilgisi yoksa çizgi.
// Beklemedeki emirde (3050 a) önce bekletmenin nedeni ve bekleten kişi yazılır.
function suAnMetni(e: IzlemeEmri): ReactNode {
  const b = e.bekletme;
  if (b) return <><span className="tc-emir-hurda">Beklemede: {beklemeNedeni(b)}</span><small className="tc-emir-alt-satir">{b.kisi.ad}</small></>;
  const c = e.canli;
  if (c?.isEmri) {
    const hal = c.durusNedeni ? <span className="tc-emir-hurda"> · Durdu: {c.durusNedeni.ad}</span>
      : c.calisma === 'durakli' ? <span className="tc-emir-hurda"> · Duraklı</span> : null;
    return <>OP {c.isEmri.opNo} {c.isEmri.ad}{hal}{e.istasyon && <small className="tc-emir-alt-satir">{e.istasyon.ad}</small>}</>;
  }
  const sirada = e.acikAdimlar?.[0] ?? null;
  if (sirada) return <>Sırada: OP {sirada.opNo} {sirada.ad}{sirada.istasyon && <small className="tc-emir-alt-satir">{sirada.istasyon.ad}</small>}</>;
  return '—';
}

// Parça adının yanında malzeme kartının küçük resmi (kart #688); resim çizim merkezinden tek istekte gelir.
const sutunlar = (resimler: ReadonlyMap<number, KucukResim>): Sutun<IzlemeEmri>[] => [
  { anahtar: 'emirNo', baslik: 'Emir no', sabit: 'sol', kirilmaz: true, hucre: (e) => <Link to={`/uretim-emirleri/${e.id}`} className="tc-emir-kod tc-emir-no">{e.emirNo}</Link> },
  { anahtar: 'parca', baslik: 'Parça', hucre: (e) => (
    <span className="tc-emir-parca">
      {e.malzemeNo != null && <KucukResimKutusu resim={resimler.get(e.malzemeNo)} ad={e.parcaAd} />}
      <span><b>{e.parcaNo}</b> {e.parcaAd}</span>
    </span>
  ) },
  { anahtar: 'adet', baslik: 'Sağlam / adet', hizala: 'sag', kirilmaz: true, hucre: (e) => {
      const saglam = saglamSayisi(e);
      const hurda = e.canli?.hurda ?? 0;
      return <>{saglam === null ? '—' : saglam} / {e.adet}{hurda > 0 && <span className="tc-emir-hurda"> (hurda {hurda})</span>}</>;
    } },
  { anahtar: 'suAn', baslik: 'Şu an', hucre: suAnMetni },
  { anahtar: 'durum', baslik: 'Durum', hucre: (e) => {
      const d = durumGosterimi(e);
      return <><Rozet ton={d.ton}>{d.etiket}</Rozet>{e.bekletme && <> <Rozet ton="uyari">Beklemede</Rozet></>}</>;
    } },
  { anahtar: 'acilma', baslik: 'Açılma', kirilmaz: true, hucre: (e) => zamanMetni(e.acilma) },
];

// Açık emir çipleri (3039): sunucudaki durumdan türetilir, yeni durum yok. "Duran" duraklatılmış ya da durmuş emirdir.
type AcikCip = '' | 'taslak' | 'planli' | 'basladi' | 'duran' | 'beklemede';
const ACIK_CIPLER: readonly { deger: AcikCip; baslik: string; uyar: (e: IzlemeEmri) => boolean }[] = [
  { deger: '', baslik: 'Tümü', uyar: () => true },
  { deger: 'taslak', baslik: 'Taslak', uyar: (e) => e.durum === 'taslak' },
  { deger: 'planli', baslik: 'Planlı', uyar: (e) => e.durum === 'planli' },
  { deger: 'basladi', baslik: 'Üretimde', uyar: (e) => e.durum === 'basladi' },
  { deger: 'duran', baslik: 'Duran', uyar: (e) => e.durum === 'basladi' && (e.canli?.calisma === 'durakli' || e.canli?.calisma === 'durdu') },
];
// Bekletme durum değil işarettir (3050 a): ayrı süzgeçtir; bekleyen emir Planlı ya da Üretimde sayısında da kalır.
const BEKLEMEDE = { deger: 'beklemede', baslik: 'Beklemede', uyar: (e: IzlemeEmri) => e.bekletme != null } as const;
const BITEN_CIPLER: readonly { deger: '' | 'bitti' | 'iptal'; baslik: string }[] = [
  { deger: '', baslik: 'Tümü' }, { deger: 'bitti', baslik: 'Bitti' }, { deger: 'iptal', baslik: 'İptal' },
];

// Emrin ana yeri burasıdır (3003 a): emir burada açılır, ayrıntısında plana alınır, bölünür ve iptal edilir. Açma penceresi Reçete ve
// Rota'nın formudur (rota seçimi ve plan onun köprüsünde); bu modül alt kattadır (ADR 0006), pencereyi üstteki modül parametre olarak
// verir (`emirAcma`). Düğme yalnız açabilene görünür. `?yeni=1` (Ctrl K, Reçete ve Rota) pencereyi açar, `urun=` ürünü seçili getirir;
// istek bir kez karşılanır ve adresten düşer.
export interface EmirAcmaYuvasi {
  acabilir: boolean;
  // Başlıktaki ek düğmeler (Excel) ve açma penceresi; `yeni` null ise pencere kapalıdır.
  ciz: (yeni: { urun: string | null } | null, kapat: () => void) => ReactNode;
}

export function UretimEmirleri({ emirAcma }: { emirAcma?: EmirAcmaYuvasi }) {
  const yonlendir = useNavigate();
  const acabilir = emirAcma?.acabilir ?? false;
  const [adres, adresYaz] = useSearchParams();
  const [yeni, setYeni] = useState<{ urun: string | null } | null>(null);
  useEffect(() => {
    if (!adres.has('yeni')) return;
    if (adres.get('yeni') === '1' && acabilir) setYeni({ urun: adres.get('urun') });
    adresYaz((a) => { const y = new URLSearchParams(a); y.delete('yeni'); y.delete('urun'); return y; }, { replace: true });
  }, [adres, acabilir]);
  const gorunum: Gorunum = adres.get('gorunum') === 'bitenler' ? 'bitenler' : 'acik';
  const [durum, setDurum] = useState<EmirDurumu | ''>('');
  const [cip, setCip] = useState<AcikCip>('');
  const [sayfa, setSayfa] = useState(1);
  const araHam = (adres.get('ara') ?? '').trim();
  const ara = araHam.toLocaleLowerCase('tr-TR');
  const gorunumSec = (g: Gorunum) => {
    setDurum('');
    setCip('');
    setSayfa(1);
    adresYaz((a) => { const y = new URLSearchParams(a); if (g === 'bitenler') y.set('gorunum', g); else y.delete('gorunum'); return y; }, { replace: true });
  };
  // Açık emirler tek okumadır; çipler istemcide süzer (sayılar aynı listeden).
  const liste = useQuery({
    queryKey: anahtarlar.liste(''),
    queryFn: () => api.get<IzlemeListeCevabi>('/uretim-emirleri?istasyonsuz=1'),
    enabled: gorunum === 'acik',
  });
  const bitenler = useQuery({
    queryKey: anahtarlar.bitenler(durum, araHam, sayfa),
    queryFn: () => {
      const q = new URLSearchParams({ istasyonsuz: '1', sayfa: String(sayfa) });
      if (durum !== '') q.set('durum', durum);
      if (araHam !== '') q.set('ara', araHam);
      return api.get<BitenEmirlerCevabi>(`/uretim-emirleri/bitenler?${q.toString()}`);
    },
    enabled: gorunum === 'bitenler',
    placeholderData: (onceki) => onceki,
  });
  // Kapanış bekleyen emirler açık listede değildir (üretimi bitti); sayısı kapanış kuyruğundan, çip o sayfayı açar.
  const kapanis = useQuery({
    queryKey: anahtarlar.kapanislar('', '', 1),
    queryFn: () => api.get<KapanisListeCevabi>('/kapanislar?sayfa=1'),
    enabled: gorunum === 'acik',
    retry: false,
  });
  // Bitenler'de sayılar sunucunun durum süzgecinden (toplam); her çip kendi ilk sayfasıdır, seçilen çip aynı sorgudur.
  const bitenSayilari = useQueries({
    queries: BITEN_CIPLER.map((c) => ({
      queryKey: anahtarlar.bitenler(c.deger, '', 1),
      queryFn: () => api.get<BitenEmirlerCevabi>(`/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1${c.deger ? `&durum=${c.deger}` : ''}`),
      enabled: gorunum === 'bitenler',
    })),
  });
  const tumAcik = liste.data?.emirler ?? [];
  const secilenCip = cip === 'beklemede' ? BEKLEMEDE : ACIK_CIPLER.find((c) => c.deger === cip) ?? ACIK_CIPLER[0]!;
  const emirler = tumAcik.filter(secilenCip.uyar).filter((e) => ara === '' || `${e.emirNo} ${e.parcaNo} ${e.parcaAd}`.toLocaleLowerCase('tr-TR').includes(ara));
  const sorgu = gorunum === 'acik' ? liste : bitenler;
  const gorunen = gorunum === 'acik' ? emirler : bitenler.data?.satirlar ?? [];
  const resimler = useKucukResimler('malzemeler', gorunen.flatMap((e) => (e.malzemeNo == null ? [] : [e.malzemeNo])));
  const SUTUNLAR = sutunlar(resimler);

  return (
    <Kart
      baslik="Üretim Emirleri"
      sag={acabilir && (
        <div className="tc-emir-ust tc-emir-ust-sag">
          {emirAcma?.ciz(yeni, () => { setYeni(null); })}
          <Dugme tur="birincil" simge="plus" onClick={() => { setYeni({ urun: null }); }}>Yeni üretim emri</Dugme>
        </div>
      )}
    >
      <Sekmeler etiket="Liste" sekmeler={GORUNUMLER} secili={gorunum} sec={gorunumSec} />
      {gorunum === 'acik' && liste.data && (
        <div className="tc-tablo-cipler tc-emir-durum-cipleri" role="group" aria-label="Duruma göre süz">
          {ACIK_CIPLER.map((c) => (
            <Dugme key={c.deger} aria-pressed={cip === c.deger} onClick={() => { setCip(c.deger); }}>
              {c.baslik} {tumAcik.filter(c.uyar).length}
            </Dugme>
          ))}
          {kapanis.data && (
            <Dugme simge="clipboard-check" onClick={() => { void yonlendir('/uretim-emirleri/kapanis'); }}>Kapanış bekliyor {kapanis.data.toplam}</Dugme>
          )}
          <span className="tc-emir-cip-ayirici" aria-hidden="true" />
          <Dugme simge="pause" aria-pressed={cip === 'beklemede'} onClick={() => { setCip('beklemede'); }}>
            {BEKLEMEDE.baslik} {tumAcik.filter(BEKLEMEDE.uyar).length}
          </Dugme>
        </div>
      )}
      {gorunum === 'bitenler' && (
        <div className="tc-tablo-cipler tc-emir-durum-cipleri" role="group" aria-label="Duruma göre süz">
          {BITEN_CIPLER.map((c, i) => (
            <Dugme key={c.deger} aria-pressed={durum === c.deger}
              onClick={() => { setDurum(c.deger); setSayfa(1); }}>
              {c.baslik} {bitenSayilari[i]?.data?.toplam ?? ''}
            </Dugme>
          ))}
        </div>
      )}
      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Emirler alınamadı.')} yenile={() => { void sorgu.refetch(); }} />}
      {gorunum === 'acik' && liste.data && (
        <>
          <p className="tc-emir-sayac" role="status">{emirler.length} açık emir</p>
          <Tablo etiket="Üretim emirleri" kip="kaydir" sutunlar={SUTUNLAR} satirlar={emirler} satirAnahtari={(e) => e.id}
            satirSec={(e) => { void yonlendir(`/uretim-emirleri/${e.id}`); }} bosMesaj="Açık emir yok" />
          {ara !== '' && emirler.length === 0 && (
            <Dugme simge="search" onClick={() => gorunumSec('bitenler')}>Bitenlerde ara</Dugme>
          )}
        </>
      )}
      {gorunum === 'bitenler' && bitenler.data && (
        <Tablo etiket="Biten üretim emirleri" kip="kaydir" sutunlar={SUTUNLAR} satirlar={bitenler.data.satirlar} satirAnahtari={(e) => e.id}
          satirSec={(e) => { void yonlendir(`/uretim-emirleri/${e.id}`); }} bosMesaj="Biten emir yok" mesgul={bitenler.isPlaceholderData}
          sayfalama={{ sayfa: bitenler.data.sayfa, sayfaBoyu: bitenler.data.sayfaBoyu, toplam: bitenler.data.toplam, degistir: setSayfa, etiket: 'Biten emir sayfaları' }} />
      )}
    </Kart>
  );
}
