import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { EmirAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { Bekletme, BekletmeOlayi, EmirAyrintiCevabi, EmirIlerlemesi, UretimKaydi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimListesi, Dugme, DurumKutusu, Kart, Menu, Rozet, Sekmeler, Simge, Tablo, type MenuOgesi, type Sutun } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { KucukResimKutusu, useKucukResimler } from '../belge-merkezi/disari.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { RefakatKartlari } from './RefakatKartlari.tsx';
import { StokTamamlama } from './StokTamamlama.tsx';
import { TeslimBagi } from './TeslimBagi.tsx';
import { EmirFisleri } from './EmirFisleri.tsx';
import { stokOkur } from './refakat.ts';
import { UretimYerleri } from './UretimYerleri.tsx';
import { useAdimSatirEki, type AdimSatirEki } from './AdimSatiri.tsx';
import { HazirlikListesi } from './HazirlikListesi.tsx';
import { Ilerleme } from './Ilerleme.tsx';
import { Iplik } from './Iplik.tsx';
import { BeklemeSeridi, BekletPenceresi, beklemeNedeni, useBekletOgesi } from './Bekletme.tsx';
import { iplikDuraklari, konumDuraklari } from './iplik.ts';
import { OLAY_ETIKETI, durumGosterimi, farkMetni, kayitAdedi, kayitKisisi, kayitNedeni, saglamSayisi, zamanMetni } from './gorunum.ts';
import './uretim-emirleri.css';

type Emir = EmirAyrintiCevabi['emir'];

// Kayıt defteri üretim kayıtlarını ve bekletme olaylarını (3050 a, "Bekletildi", "Devam etti") birlikte, zamana göre gösterir.
type DefterSatiri = { tur: 'kayit'; k: UretimKaydi } | { tur: 'bekletme'; b: BekletmeOlayi };
const KAYIT_SUTUNLARI: Sutun<DefterSatiri>[] = [
  { anahtar: 'olay', baslik: 'Olay', hucre: (s) => s.tur === 'kayit' ? OLAY_ETIKETI[s.k.olay] : s.b.olay === 'beklet' ? 'Bekletildi' : 'Devam etti' },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (s) => s.tur === 'kayit' ? kayitAdedi(s.k) : null },
  { anahtar: 'neden', baslik: 'Neden', hucre: (s) => s.tur === 'kayit' ? kayitNedeni(s.k)
    : s.b.neden === null ? null : `${beklemeNedeni({ neden: s.b.neden })}${s.b.not ? ` · ${s.b.not}` : ''}` },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (s) => s.tur === 'kayit' ? kayitKisisi(s.k) : s.b.kisi.ad },
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (s) => zamanMetni(s.tur === 'kayit' ? s.k.zaman : s.b.zaman) },
];
const defterSatirlari = (v: EmirAyrintiCevabi): DefterSatiri[] => {
  const bekletmeler = v.bekletmeler ?? [];
  if (bekletmeler.length === 0) return v.kayitlar.map((k) => ({ tur: 'kayit', k }));
  const zaman = (s: DefterSatiri) => Date.parse(s.tur === 'kayit' ? s.k.zaman : s.b.zaman);
  // Sunucu kayıtları eskiden yeniye verir; bekletme olayları zamanına göre araya girer (aynı anda kayıt önce).
  return [...v.kayitlar.map((k): DefterSatiri => ({ tur: 'kayit', k })), ...bekletmeler.map((b): DefterSatiri => ({ tur: 'bekletme', b }))]
    .map((s, i) => ({ s, i })).sort((a, b) => zaman(a.s) - zaman(b.s) || a.i - b.i).map((x) => x.s);
};

// Emir sayfası (3039): üstte kimlik, yaşam döngüsü ve dört özet; altta sekmeler. Her bilgi tek yerde durur: adımlar yalnız "Adımlar"
// sekmesindedir. Emri değiştiren parçalar (işlemler, adım listesi, malzeme) üstteki modülden parametre olarak gelir (ADR 0006); verilmezse
// sayfa salt okunurdur ve adımlar emrin kendi ilerlemesinden çizilir.
export interface EmirParcalari {
  // Parçaların ortak kaynağı (sayfa başına tek köprü) bütün sayfayı sarar.
  sar: (icerik: ReactNode) => ReactNode;
  // ekOgeler: bu modülün kendi işlemleri (3050 a "Beklet"); sahibin "İşlemler" menüsüne girer, tek menü kalır.
  islemler: (emirId: number, ekOgeler: readonly MenuOgesi[]) => ReactNode;
  // Satırın sağını (statü, iç/fason, Adım Durumu) bu modül çizer; adım listesi her satırda çağırır.
  adimlar: (emirId: number, satirEki: AdimSatirEki['ek']) => ReactNode;
  malzeme: (emirId: number) => ReactNode;
}

type SekmeAdi = 'adimlar' | 'malzeme' | 'fisler' | 'hazirlik' | 'stok' | 'kayitlar';
const SEKME_ADLARI: readonly SekmeAdi[] = ['adimlar', 'malzeme', 'fisler', 'hazirlik', 'stok', 'kayitlar'];

// Yaşam döngüsü: emir bu sırayla ilerler; iptal yan yoldur. "Kapanış onayı" üretimi biten emrin kalite ve müdür onayıdır (1082 a).
type AsamaAdi = 'taslak' | 'planli' | 'uretimde' | 'bitti' | 'kapanis' | 'kapandi';
const ASAMALAR: readonly { ad: AsamaAdi; baslik: string; simge: SimgeAdi }[] = [
  { ad: 'taslak', baslik: 'Taslak', simge: 'edit' },
  { ad: 'planli', baslik: 'Planlı', simge: 'calendar' },
  { ad: 'uretimde', baslik: 'Üretimde', simge: 'play' },
  { ad: 'bitti', baslik: 'Üretimi bitti', simge: 'flag' },
  { ad: 'kapanis', baslik: 'Kapanış onayı', simge: 'clipboard-check' },
  { ad: 'kapandi', baslik: 'Kapandı', simge: 'check' },
];

// Şu anki aşamanın sırası; kapanmış emirde hepsi geçilmiştir (ASAMALAR.length).
export function asamaSirasi(e: Pick<Emir, 'durum'> & { kapanisSonucu?: string | null }): number {
  switch (e.durum) {
    case 'taslak': return 0;
    case 'planli': return 1;
    case 'basladi': return 2;
    case 'bitti': return e.kapanisSonucu ? ASAMALAR.length : 4;
    case 'iptal': return -1;
  }
}

function YasamSeridi({ emir, bekleme }: { emir: Emir; bekleme: Bekletme | null }) {
  const simdi = asamaSirasi(emir);
  const iptal = emir.durum === 'iptal';
  // Dar ekranda şerit yatay kayar: şu anki aşama görünür kalsın.
  const serit = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = serit.current;
    const li = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (ol && li && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, li.offsetLeft - ol.offsetLeft - li.offsetWidth / 2);
  }, [simdi, iptal]);
  const tarih = (a: AsamaAdi): string | null => (a === 'taslak' ? zamanMetni(emir.acilma) : a === 'uretimde' ? zamanMetni(emir.baslama)
    : a === 'bitti' ? zamanMetni(emir.bitis) : null);
  const gecerli = iptal ? null : ASAMALAR[Math.min(simdi, ASAMALAR.length - 1)];
  return (
    <>
    {/* Telefonda şerit kaymaz: yalnız geçerli aşama ve sırası yazılır. */}
    <p className="tc-emir-yasam-kisa" aria-hidden="true">
      {iptal ? 'İptal' : gecerli ? `${simdi >= ASAMALAR.length ? 'Kapandı' : gecerli.baslik}${bekleme ? ' · Beklemede' : ''} · ${String(Math.min(simdi + 1, ASAMALAR.length))}/${String(ASAMALAR.length)}` : ''}
    </p>
    <ol ref={serit} className="tc-emir-yasam" aria-label="Emrin yaşam döngüsü">
      {ASAMALAR.map((a, i) => {
        const hal = iptal ? 'pasif' : i < simdi ? 'gecti' : i === simdi ? 'simdi' : 'bekliyor';
        return (
          <li key={a.ad} data-hal={hal} aria-current={hal === 'simdi' ? 'step' : undefined}>
            <span className="tc-emir-yasam-nokta"><Simge ad={hal === 'gecti' ? 'check' : a.simge} boyut="k" /></span>
            <span className="tc-emir-yasam-ad">{a.baslik}</span>
            {hal === 'simdi' && bekleme ? <small className="tc-emir-yasam-bekleme">Beklemede</small> : hal !== 'bekliyor' && tarih(a.ad) && <small>{tarih(a.ad)}</small>}
          </li>
        );
      })}
      {iptal && (
        <li data-hal="iptal" aria-current="step">
          <span className="tc-emir-yasam-nokta"><Simge ad="x" boyut="k" /></span>
          <span className="tc-emir-yasam-ad">İptal</span>
          {zamanMetni(emir.iptal) && <small>{zamanMetni(emir.iptal)}</small>}
        </li>
      )}
    </ol>
    </>
  );
}

// Şu an hangi adımda: çalışan adım, yoksa sıradaki bekleyen. Adımı olmayan emirde null.
function suAnkiAdim(il: EmirIlerlemesi | null) {
  const a = il?.adimlar ?? [];
  return a.find((x) => x.durum === 'calisiyor') ?? a.find((x) => x.durum === 'bekliyor') ?? null;
}

function Ozet({ baslik, simge, deger, alt, cubuk, ton }: { baslik: string; simge: SimgeAdi; deger: ReactNode; alt?: ReactNode; cubuk?: number | null; ton?: 'uyari' | 'hata' }) {
  return (
    <div className="tc-emir-ozet" data-ton={ton}>
      <span className="tc-emir-ozet-baslik"><Simge ad={simge} boyut="k" /> {baslik}</span>
      <b className="tc-emir-ozet-deger">{deger}</b>
      {cubuk !== undefined && cubuk !== null && <progress max={100} value={cubuk} aria-label={`${baslik} yüzde ${String(cubuk)}`} />}
      {alt && <small className="tc-emir-ozet-alt">{alt}</small>}
    </div>
  );
}

function OzetKutulari({ emir, veri, kayitlariAc, statu, bekleme }: {
  emir: Emir; veri: EmirAyrintiCevabi; kayitlariAc: () => void; statu: AdimSatirEki['statu']; bekleme: Bekletme | null;
}) {
  const canli = emir.canli ?? null;
  const saglam = saglamSayisi(emir);
  const il = veri.ilerleme ?? null;
  const biten = il ? il.adimlar.filter((a) => a.durum === 'tamam').length : null;
  const adim = suAnkiAdim(il);
  const son = veri.kayitlar.reduce<UretimKaydi | null>((s, k) => (s === null || k.zaman > s.zaman ? k : s), null);
  const fark = emir.durum === 'bitti' ? farkMetni(emir.adet, emir.saglamAdet) : null;
  const durdu = canli?.durusNedeni ?? null;
  const st = adim ? statu(adim.opNo) : null;
  const statuMetni = st ? `${st.ad}${st.kisi ? ` · ${st.kisi}` : ''}` : null;
  const suAn: { deger: ReactNode; alt: ReactNode; ton?: 'uyari' | 'hata' } = bekleme ? { deger: 'Beklemede', alt: `${beklemeNedeni(bekleme)} · ${bekleme.kisi.ad}`, ton: 'uyari' }
    : emir.durum === 'iptal' ? { deger: 'İptal edildi', alt: null }
    : emir.durum === 'bitti' ? { deger: 'Bütün adımlar bitti', alt: fark }
      : emir.durum === 'taslak' ? { deger: 'Plana alınmadı', alt: 'Plana alınınca terminale gider.' }
        : adim ? {
          deger: <>OP {adim.opNo} {adim.ad}</>,
          alt: durdu ? `Durdu: ${durdu.ad}${canli?.durusBaslangic ? ` · ${zamanMetni(canli.durusBaslangic) ?? ''}` : ''}`
            : adim.durum === 'calisiyor' ? `${statuMetni ?? 'Çalışıyor'} · ${String(adim.yapilan)} / ${String(adim.hedef)}` : `Sırada · ${statuMetni ?? 'başlamadı'}`,
          ton: durdu || st?.ton === 'hata' ? 'hata' : canli?.calisma === 'durakli' || st?.ton === 'uyari' ? 'uyari' : undefined,
        } : { deger: 'Adım yok', alt: null };
  return (
    <div className="tc-emir-ozetler" role="group" aria-label="Emrin özeti">
      <Ozet baslik="Sağlam / emir adedi" simge="check" deger={`${saglam === null ? '—' : String(saglam)} / ${String(emir.adet)}`}
        cubuk={saglam === null || emir.adet === 0 ? null : Math.min(100, Math.floor((saglam / emir.adet) * 100))}
        alt={canli ? `Hurda ${String(canli.hurda)}` : null} />
      <Ozet baslik="Rota ilerlemesi" simge="route" deger={il ? `%${String(il.rota)}` : '—'} cubuk={il?.rota ?? null}
        alt={il && biten !== null ? `${String(biten)} / ${String(il.adimlar.length)} adım bitti` : 'İş emri yok'} />
      <Ozet baslik="Şu an" simge="gauge" deger={suAn.deger} alt={suAn.alt} ton={suAn.ton} />
      <div className="tc-emir-ozet">
        <span className="tc-emir-ozet-baslik"><Simge ad="clock" boyut="k" /> Son hareket</span>
        <b className="tc-emir-ozet-deger">{son ? OLAY_ETIKETI[son.olay] : 'Henüz kayıt yok'}</b>
        {son && <small className="tc-emir-ozet-alt">{kayitKisisi(son)} · {zamanMetni(son.zaman)}</small>}
        {son && <Dugme simge="next" onClick={kayitlariAc}>Bütün kayıtlar</Dugme>}
      </div>
    </div>
  );
}

export function EmirAyrintisi({ parcalar }: { parcalar?: EmirParcalari }) {
  const icerik = <EmirSayfasi parcalar={parcalar} />;
  return parcalar ? <>{parcalar.sar(icerik)}</> : icerik;
}

function EmirSayfasi({ parcalar }: { parcalar?: EmirParcalari }) {
  const { id } = useParams();
  const emirId = Number(id);
  const yonlendir = useNavigate();
  const [adres, adresYaz] = useSearchParams();
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const receteRotaGorur = islemler.includes('sayfa.recete-rota');
  // Risk D1 (3175): emrin fişleri stok hareketidir; sunucunun stok okuma listesiyle aynı koşulla görünür (stok.istek herkeste vardır,
  // stok okuması açmaz). MRP fişi plan okumasıyla (M1).
  const fislerGorur = stokOkur(islemler);
  const mrpGorur = islemler.includes('plan.planlama-oku');
  const ayrinti = useQuery({
    queryKey: anahtarlar.ayrinti(emirId),
    queryFn: () => api.get<EmirAyrintiCevabi>(`/uretim-emirleri/${emirId}`),
  });
  const emir = ayrinti.data?.emir;
  const bekleme = emir?.bekletme ?? null;
  const bekletOgesi = useBekletOgesi(emir);
  const durum = emir ? durumGosterimi(emir) : { etiket: '', ton: 'bilgi' as const };
  const kontrolAdimlari = ayrinti.data?.adimlar ?? [];
  const malzemeNo = emir?.malzemeNo ?? null;
  const resim = useKucukResimler('malzemeler', malzemeNo === null ? [] : [malzemeNo]);
  const sekmeHam = adres.get('sekme');
  // Açılış sekmesi emrin durumuna göre: üretimi biten emirde iş stok ve kapanıştadır, öncesinde adımlardadır.
  const acilis: SekmeAdi = emir?.durum === 'bitti' ? 'stok' : 'adimlar';
  const sekme: SekmeAdi = SEKME_ADLARI.find((s) => s === sekmeHam) ?? acilis;
  const sekmeSec = (s: SekmeAdi) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (s === acilis) y.delete('sekme'); else y.set('sekme', s); y.delete('islem'); y.delete('yer'); return y; }, { replace: true });
  };
  const satirEki = useAdimSatirEki(emirId, malzemeNo);
  const [iplikAcik, setIplikAcik] = useState(false);
  const [oynatma, setOynatma] = useState(0);
  // Parti, rota adımı saatleri ve sevk Akış Süresi okumasındadır; o yetki yoksa bu duraklar "kayıt yok" kalır.
  const akisGorur = islemler.includes('sayfa.akis');
  const akis = useQuery({
    queryKey: anahtarlar.akis(emirId),
    queryFn: () => api.get<EmirAkisiCevabi>(`/akis/emirler/${String(emirId)}`),
    enabled: iplikAcik && akisGorur,
  });
  const akisBekleniyor = akisGorur && akis.isPending;
  // 2224-1 b: Parçayı izle konumdan konuma yolu çizer, istasyonda adım bilgisiyle; konum hareketi yoksa adım ipliği kalır.
  const konumlu = ayrinti.data && akis.data ? konumDuraklari(ayrinti.data, akis.data) : [];
  const izle = () => {
    if (!iplikAcik) setIplikAcik(true);
    setOynatma((n) => n + 1);
  };
  const gorunumler: MenuOgesi[] = [
    ...(receteRotaGorur ? [{ anahtar: 'rr', baslik: "Reçete ve Rota'da gör", simge: 'tool' as const, sec: () => { void yonlendir(emir ? `/recete-rota?kayit=${String(emir.id)}` : '/recete-rota'); } }] : []),
    ...(emir && akisGorur ? [{ anahtar: 'akis', baslik: "Akış Süresi'nde aç", simge: 'gantt' as const, sec: () => { void yonlendir(`/akis/${String(emirId)}`); } }] : []),
  ];
  const sekmeler = [
    { anahtar: 'adimlar', baslik: 'Adımlar', simge: 'route' },
    { anahtar: 'malzeme', baslik: 'Malzeme', simge: 'box' },
    ...(fislerGorur ? [{ anahtar: 'fisler', baslik: 'Fişler', simge: 'file' } as const] : []),
    { anahtar: 'hazirlik', baslik: 'Hazırlık', simge: 'clipboard-check' },
    { anahtar: 'stok', baslik: 'Stok ve kapanış', simge: 'pallet' },
    { anahtar: 'kayitlar', baslik: 'Kayıtlar', simge: 'list' },
  ] as const;

  return (
    <>
    {/* Geri ve başka ekranlara bağlantılar başlığın üstünde: başlıkta yalnız durumun ana işi ve "İşlemler" kalır. */}
    <nav className="tc-emir-yol" aria-label="Emrin bağlantıları">
      <Dugme simge="chev-left" onClick={() => { void yonlendir('/uretim-emirleri'); }}>Üretim emirleri</Dugme>
      {gorunumler.length > 0 && <Menu etiket="Emri başka ekranda aç" metin="Bağlantılar" simge="expand" ogeler={gorunumler} />}
    </nav>
    <Kart
      baslik={emir ? emir.emirNo : 'Üretim emri'}
      baslikEki={emir && <><Rozet ton={durum.ton}>{durum.etiket}</Rozet>{bekleme && <> <Rozet ton="uyari">Beklemede</Rozet></>}</>}
      sag={emir && parcalar ? <div className="tc-emir-ust tc-emir-ust-sag">{parcalar.islemler(emir.id, bekletOgesi)}</div> : undefined}
    >
      {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
      {ayrinti.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Emir alınamadı.')} yenile={() => { void ayrinti.refetch(); }} />}
      {emir && ayrinti.data && (
        <>
          <div className="tc-emir-kimlik">
            {malzemeNo !== null && <KucukResimKutusu resim={resim.get(malzemeNo)} ad={emir.parcaAd} boy="orta" />}
            <div className="tc-emir-kimlik-metin">
              <span className="tc-emir-kimlik-parca"><b>{emir.parcaNo}</b> {emir.parcaAd}</span>
              <small>
                {emir.adet} adet · {emir.istasyon?.ad ?? 'İstasyon atanmamış'} · Açan {emir.acan.ad}
                {ayrinti.data.kolHurdasi != null && ` · Kollardaki hurda ${String(ayrinti.data.kolHurdasi)}`}
              </small>
            </div>
          </div>
          <TeslimBagi emirId={emir.id} />
          {bekleme && <BeklemeSeridi emirId={emir.id} bilgi={bekleme} />}
          <YasamSeridi emir={emir} bekleme={bekleme} />
          <OzetKutulari emir={emir} veri={ayrinti.data} statu={satirEki.statu} bekleme={bekleme} kayitlariAc={() => { sekmeSec('kayitlar'); }} />
          <BekletPenceresi emirId={emir.id} emirNo={emir.emirNo} />

          <Sekmeler etiket="Emrin bölümleri" sekmeler={sekmeler} secili={sekme} sec={sekmeSec} />
          <div className="tc-emir-sekme" role="tabpanel" aria-label={sekmeler.find((s) => s.anahtar === sekme)?.baslik}>
            {sekme === 'adimlar' && (
              <>
                {/* Reçete ve Rota'yı okuyamayan kişi bugünkü salt okunur görünümü alır: ilerleme ve adımların durumu (1787c). */}
                {parcalar ? parcalar.adimlar(emir.id, satirEki.ek) : (
                  <>
                    <Ilerleme emir={emir} ilerleme={ayrinti.data.ilerleme ?? null} />
                    <UretimYerleri emir={emir} />
                  </>
                )}
                {satirEki.pencere}
                {kontrolAdimlari.length > 0 && (
                  <section className="tc-emir-bolum-adim" aria-label="Kontrol adımları">
                    <h3 className="tc-emir-bolum">Kontrol adımları</h3>
                    <AdimListesi saltOkunur adimlar={kontrolAdimlari.map((a) => ({
                      id: a.id, ad: a.ad, aciklama: a.aciklama, tamam: a.tamam,
                      not: a.tamamlayan && a.tamamlanma ? `${a.tamamlayan.ad} · ${zamanMetni(a.tamamlanma) ?? ''}` : null,
                    }))} />
                  </section>
                )}
              </>
            )}
            {sekme === 'malzeme' && (
              <>
                {parcalar ? parcalar.malzeme(emir.id) : null}
                {/* 2907 (2912 a): refakat kartları malzemenin nerede olduğunu söyler. */}
                {emir.malzemeNo != null && <RefakatKartlari emirId={emir.id} />}
                {!parcalar && emir.malzemeNo == null && <p className="tc-emir-not">Bu emrin malzeme kartı yok.</p>}
              </>
            )}
            {sekme === 'fisler' && fislerGorur && <EmirFisleri emirId={emir.id} emirNo={emir.emirNo} mrpGorur={mrpGorur} />}
            {sekme === 'hazirlik' && <HazirlikListesi emir={emir} />}
            {sekme === 'stok' && (
              <>
                {emir.durum !== 'bitti' && <p className="tc-emir-not">Üretimi biten emir burada stoğa işlenir; kapanış onayı başlıktaki "Kapanış onayları" ile verilir.</p>}
                <StokTamamlama emir={emir} islenir ikincil />
              </>
            )}
            {sekme === 'kayitlar' && (
              <>
                <div className="tc-emir-ust">
                  <Dugme simge="scan" aria-pressed={iplikAcik} onClick={izle}>Parçayı izle</Dugme>
                  <GecmisDugmesi kayitlar={[{ tablo: 'uretim_emri', anahtar: { id: emir.id } }]} />
                </div>
                {iplikAcik && (
                  <section className="tc-emir-bolum-iplik" aria-label="Parçanın konum akışı">
                    <div className="tc-emir-iplik-bas">
                      <h3 className="tc-emir-bolum">Parçanın konum akışı</h3>
                      <Dugme simge="x" onClick={() => setIplikAcik(false)}>Kapat</Dugme>
                    </div>
                    {akisBekleniyor ? <DurumKutusu durum="yukleniyor" /> : (
                      <>
                        {!akisGorur && <p className="tc-emir-not">Parti, rota saatleri ve sevk Akış Süresi yetkisiyle görünür.</p>}
                        {akisGorur && akis.isError && <p className="tc-emir-not">{hataIletisi(akis.error, 'Akış kaydı alınamadı.')}</p>}
                        {konumlu.length > 0
                          ? <Iplik key={oynatma} baslik={`${emir.emirNo} konum akışı`} duraklar={konumlu} />
                          : (
                            <>
                              {akisGorur && akis.data && <p className="tc-emir-not">Bu emrin konum hareketi yok; rota adımları gösteriliyor.</p>}
                              <Iplik key={oynatma} baslik={`${emir.emirNo} izlenebilirlik ipliği`}
                                duraklar={iplikDuraklari(ayrinti.data, akis.data ?? null)} />
                            </>
                          )}
                      </>
                    )}
                  </section>
                )}
                <Tablo etiket="Kayıt defteri" sutunlar={KAYIT_SUTUNLARI} satirlar={defterSatirlari(ayrinti.data)}
                  satirAnahtari={(s) => s.tur === 'kayit' ? s.k.id : `b${String(s.b.id)}`} bosMesaj="Henüz kayıt yok" />
              </>
            )}
          </div>
        </>
      )}
    </Kart>
    </>
  );
}
