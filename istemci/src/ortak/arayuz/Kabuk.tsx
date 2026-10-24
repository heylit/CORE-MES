import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SAYFALAR, menudeGorunur, yolKapaliMi, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { SayfaTanimi } from '#paylasilan/sayfa-tanimi.ts';
import type { CerceveSayaclari } from '../rota/cerceve-iletisi.ts';
import { CerceveSayacBaglami, type CerceveSayacYazici } from '../rota/cerceve-sayaclari.ts';
import { IKINCI_MENU_TANIMLARI, acikIkinciMenu, type IkinciMenu as IkinciMenuTanimi } from '../rota/ikinci-menu.ts';
import { gecmisiSil } from '../rota/gezinme-gecmisi.ts';
import { gorunenHizliIsler, type HizliIs } from '../rota/hizli-isler.ts';
import { gorunenKomutlar, type Komut } from '../rota/komutlar.ts';
import { rehberMaddeleri, sayfaRehberleri, type SayfaRehberi } from '../rota/rehber.ts';
import { GENEL_KONULAR } from '../rota/rehber-genel.ts';
import { gorunenUstEylemler, type UstEylem } from '../rota/ust-eylemler.ts';
import { rotaninSayfasi } from '../rota/sayfa.ts';
import { PaletSorgusuBaglami, SayfaKomutBaglami, paletSorgusuKur, type SayfaKomutu, type SayfaKomutYazici } from '../rota/sayfa-komutlari.ts';
import { sayaclarAyniMi, useIkinciMenuSayaclari } from '../veri/ikinci-menu-sayaclari.ts';
import { useCihazTercihi } from '../veri/cihaz-tercihi.ts';
import { YENI_EKRAN_GRUBU, yeniEkranAdresiMi, yeniEkranBaglantilari } from '../rota/yeni-ekran-menusu.ts';
import { usePerformans } from '../veri/gorunum.ts';
import { DERLEME, derlemeTarihi } from '../veri/surum.ts';
import { tanitimGoruldu, tanitimGorulduMu } from '../veri/tanitim.ts';
import { useTema } from '../veri/tema.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { BaglantiSeridi } from './BaglantiSeridi.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { GenelArama } from './GenelArama.tsx';
import { GeziDugmeleri } from './GeziDugmeleri.tsx';
import { IkinciMenu } from './IkinciMenu.tsx';
import { IsPaneli } from './IsPaneli.tsx';
import { Menu } from './Menu.tsx';
import { ParolaPenceresi } from './ParolaPenceresi.tsx';
import { RehberPenceresi } from './Rehber.tsx';
import { Simge } from './Simge.tsx';
import { TanitimDaveti, TanitimPenceresi } from './Tanitim.tsx';
import { useKatman } from './katman.ts';
import './kabuk.css';
import './hareket.css';

// Kişinin kendi sayfası (profil modülü): menü sayfası değildir, oturumu olan herkese açıktır; üst çubuktaki ad oraya götürür.
const PROFIL_YOLU = '/profil';

function basHarfler(ad: string): string {
  const parcalar = ad.trim().split(/\s+/).filter(Boolean);
  const ilk = parcalar[0]?.[0] ?? '';
  const son = parcalar.length > 1 ? parcalar[parcalar.length - 1]?.[0] ?? '' : '';
  return `${ilk}${son}`.toLocaleUpperCase('tr-TR') || '?';
}

const ALT_CUBUK_SAYISI = 4;

// Grup sırası listedeki ilk görünüş sırasıdır.
function grupla(sayfalar: readonly Sayfa[]) {
  return [...new Set(sayfalar.map((s) => s.grup))].map((grup) => ({
    grup,
    sayfalar: sayfalar.filter((s) => s.grup === grup),
  }));
}

interface Ozellikler {
  // Kullanıcının görebildiği sayfalar; menü yalnız bunlardan üretilir.
  sayfalar: readonly Sayfa[];
  kullaniciAdi: string;
  cikis: () => void;
  // Kullanıcının işlemleri: ikinci menünün maddeleri bununla süzülür. Verilmezse ikinci menü açılmaz.
  islemler?: readonly string[];
  // Testin kendi menüsünü verebilmesi için; uygulama modüllerin bildirdiklerini kullanır.
  ikinciMenuler?: readonly IkinciMenuTanimi[];
  // Sistem Ayarları'ndan kapatılan yollar: menüden ve aramadan kalkar, adresle açılınca içerik yerine "kapalı" yazar.
  kapali?: readonly string[];
  // Sistem Ayarları'ndan yüklenen kurum logosu (veri adresi); yoksa TMI işareti durur.
  logo?: string | null;
  // Ana sayfa bağlantısının yolu: rolün açılış sayfası varsa o (rolün kendi panosu), yoksa ortak ana sayfa.
  anaSayfa?: string;
  // Bütün sayfaların üst çubuğundaki modül düğmeleri; uygulama modüllerin bildirdiklerini verir.
  ustEylemler?: readonly UstEylem[];
  // "Ne oldu?" panelinin olayları; uygulama modüllerin bildirdiklerini verir. Kişiye açık olay yoksa düğme çizilmez.
  hizliIsler?: readonly HizliIs[];
  // Ctrl K paletinin genel komutları; uygulama modüllerin bildirdiklerini verir. İşlemi ve sayfası kişiye açık olan görünür.
  komutlar?: readonly Komut[];
  // Sayfaların kullanım tarifi (Yardım); uygulama modüllerin bildirdiklerini verir.
  rehberler?: readonly SayfaRehberi[];
  // Verilirse ilk girişte tanıtım önerilir; görüldü bilgisi kişiye göre tutulur.
  kisiId?: number;
  children: ReactNode;
}

const ISLEMSIZ: readonly string[] = [];
const KAPALISIZ: readonly string[] = [];
const EYLEMSIZ: readonly UstEylem[] = [];
const OLAYSIZ: readonly HizliIs[] = [];
const GENEL_KOMUTSUZ: readonly Komut[] = [];
const SAYFA_KOMUTSUZ: readonly SayfaKomutu[] = [];

// Kapalı maddeler düşer; maddesi kalmayan grup da düşer (menünün kendisi sayfayla birlikte kalkar).
function kapaliMaddeleriSuz(menuler: readonly IkinciMenuTanimi[], kapali: readonly string[]): readonly IkinciMenuTanimi[] {
  if (kapali.length === 0) return menuler;
  return menuler.map((m) => ({
    ...m,
    gruplar: m.gruplar
      .map((g) => ({ ...g, maddeler: g.maddeler.filter((md) => !yolKapaliMi(md.yol, kapali)) }))
      .filter((g) => g.maddeler.length > 0),
  }));
}

// Logo da ana sayfaya gider ama düğme olduğu anlaşılmıyor; ana sayfa her menüde ilk maddedir.
interface BaglantiSayfasi { yol: string; baslik: string; simge: SimgeAdi }
const ANA_SAYFA_BASLIGI = 'Ana sayfa';
// Profil menü sayfası değildir (yetki istemez); her kullanıcının menüsünde ana sayfanın altında durur.
const PROFIL_BAGLANTISI: BaglantiSayfasi = { yol: PROFIL_YOLU, baslik: 'Profilim', simge: 'user' };

// Ana sayfa bağlantısı yalnız kendi yolunda seçili görünür: rolün panosu bir modül sayfasıysa alt yollarda modülün maddesi seçilidir.
function Baglanti({ sayfa, kapat, tam = sayfa.yol === '/' }: { sayfa: BaglantiSayfasi; kapat?: () => void; tam?: boolean }) {
  return (
    <NavLink
      to={sayfa.yol}
      end={tam}
      className={({ isActive }) => `tc-kabuk-bag${isActive ? ' tc-kabuk-bag-acik' : ''}`}
      aria-label={sayfa.baslik}
      title={sayfa.baslik}
      onClick={kapat}
    >
      <Simge ad={sayfa.simge} />
      <span className="tc-kabuk-bag-metin">{sayfa.baslik}</span>
    </NavLink>
  );
}

// Yetkisi sade maddelerin hiçbirine yetmeyen kişi menüsüz kalmasın diye tam menü kalır.
function sadeGorunum(menu: IkinciMenuTanimi | null, acik: boolean): IkinciMenuTanimi | null {
  if (menu === null || !acik || menu.sade === undefined) return menu;
  const sade = menu.sade.maddeler;
  const gruplar = menu.gruplar
    .map((g) => ({ ...g, maddeler: g.maddeler.filter((m) => sade.includes(m.anahtar)) }))
    .filter((g) => g.maddeler.length > 0);
  return gruplar.length === 0 ? menu : { ...menu, gruplar };
}

export function Kabuk({
  sayfalar: tumSayfalar, kullaniciAdi, cikis, islemler = ISLEMSIZ, ikinciMenuler: tumMenuler = IKINCI_MENU_TANIMLARI, kapali = KAPALISIZ, logo = null, anaSayfa = '/', ustEylemler = EYLEMSIZ, hizliIsler = OLAYSIZ, komutlar = GENEL_KOMUTSUZ, rehberler = sayfaRehberleri, kisiId, children,
}: Ozellikler) {
  const anaBaglanti = useMemo<BaglantiSayfasi>(() => ({ yol: anaSayfa, baslik: ANA_SAYFA_BASLIGI, simge: 'home' }), [anaSayfa]);
  const sayfalar = useMemo(() => tumSayfalar.filter((s) => !yolKapaliMi(s.yol, kapali)), [tumSayfalar, kapali]);
  const ikinciMenuler = useMemo(() => kapaliMaddeleriSuz(tumMenuler, kapali), [tumMenuler, kapali]);
  // Sayfası görünmeyen ama arama işlemi olan kişi de o sayfanın kayıtlarını arar (aramaIslemi).
  const aramaSayfalari = useMemo(() => SAYFALAR.filter((s) => {
    const islem = (s as Pick<SayfaTanimi, 'aramaIslemi'>).aramaIslemi;
    return islem !== undefined && islemler.includes(islem) && !sayfalar.some((g) => g.yol === s.yol) && !yolKapaliMi(s.yol, kapali);
  }), [islemler, sayfalar, kapali]);
  const { tema, degistir } = useTema();
  const [performans, performansDegistir] = usePerformans();
  const performansEtiketi = performans ? 'Performans modunu kapat' : 'Performans modunu aç';
  const [tumuAcik, tumuYaz] = useState(false);
  const [parolaAcik, parolaYaz] = useState(false);
  const [tamEkran, tamEkranYaz] = useState(false);
  const konum = useLocation();
  const gezin = useNavigate();
  // Bekletilen sayfanın bağlantısı çizilmez; adresi açılır ve başlığı görünür.
  const menudekiler = useMemo(() => sayfalar.filter(menudeGorunur), [sayfalar]);
  const gruplar = useMemo(() => grupla(menudekiler), [menudekiler]);
  // Geçici (308 d): yeni ekran satırları yalnız yöneticide, ayrı grupta; bağlamada kalkar.
  const yeniEkranlar = useMemo(() => yeniEkranBaglantilari(menudekiler, islemler), [menudekiler, islemler]);
  const olayGruplari = useMemo(
    () => gorunenHizliIsler(hizliIsler, { sayfalar, menuler: ikinciMenuler, islemler }),
    [hizliIsler, sayfalar, ikinciMenuler, islemler],
  );
  const gorunenKomutListesi = useMemo(
    () => gorunenKomutlar(komutlar, { sayfalar, menuler: ikinciMenuler, islemler }),
    [komutlar, sayfalar, ikinciMenuler, islemler],
  );
  // Açık sayfanın komutları (sayfa-komutlari.ts): kaynak başına liste, palet kayıt sırasıyla birleştirir.
  const [sayfaKomutKayitlari, sayfaKomutKayitlariniYaz] = useState<ReadonlyMap<string, readonly SayfaKomutu[]>>(() => new Map());
  const sayfaKomutYaz = useCallback<SayfaKomutYazici>((kaynak, liste) => {
    sayfaKomutKayitlariniYaz((onceki) => {
      if (liste === null && !onceki.has(kaynak)) return onceki;
      if (liste !== null && onceki.get(kaynak) === liste) return onceki;
      const yeni = new Map(onceki);
      if (liste === null) yeni.delete(kaynak);
      else yeni.set(kaynak, liste);
      return yeni;
    });
  }, []);
  const sayfaKomutlari = useMemo(() => [...sayfaKomutKayitlari.values()].flat(), [sayfaKomutKayitlari]);
  // Değer alan komutu öneren sayfa paletin sorgusunu buradan dinler (sayfa-komutlari.ts).
  const [paletSorgusu] = useState(paletSorgusuKur);
  const tumKutu = useKatman<HTMLDivElement>(tumuAcik, () => tumuYaz(false));
  const [yardimAcik, yardimYaz] = useState(false);
  const [acmaIstekleri, acmaIstekleriYaz] = useState<Readonly<Record<string, number>>>({});
  const [tanitimAcik, tanitimYaz] = useState(false);
  const [davet, davetYaz] = useState(() => kisiId !== undefined && !tanitimGorulduMu(kisiId));
  const rehber = useMemo(
    () => rehberMaddeleri({ sayfalar, menuler: ikinciMenuler, islemler, rehberler }),
    [sayfalar, ikinciMenuler, islemler, rehberler],
  );
  const tanitimBitti = useCallback(() => {
    tanitimYaz(false);
    davetYaz(false);
    if (kisiId !== undefined) tanitimGoruldu(kisiId);
  }, [kisiId]);
  // F1 her sayfada Yardım'ı açar (çerçevenin içindeki tuş modülündür, buraya ulaşmaz).
  useEffect(() => {
    const tus = (o: KeyboardEvent) => { if (o.key === 'F1') { o.preventDefault(); yardimYaz(true); } };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, []);

  useEffect(() => { tumuYaz(false); }, [konum.pathname]);

  // Sayfa değişince içerik bir kez girer: öznitelik kaldırılıp yeniden konunca CSS animasyonu baştan oynar (hareket.css).
  const kok = useRef<HTMLDivElement>(null);
  const ilkSayfa = useRef(true);
  useEffect(() => {
    const ogesi = kok.current;
    if (ogesi === null) return;
    if (ilkSayfa.current) { ilkSayfa.current = false; return; }
    ogesi.removeAttribute('data-gecis');
    void ogesi.offsetWidth;
    ogesi.setAttribute('data-gecis', '');
  }, [konum.pathname]);

  const sayfaYolu = rotaninSayfasi(konum.pathname);
  // Başlık kişinin sayfalarından alınır: yetkisi olmayan sayfanın adresinde "bulunamadı" içeriğinin üstünde o sayfanın adı
  // yazmasın. Kapalı sayfa kişinindir; adı kalır, içerik "kapalı" der.
  const baslik = konum.pathname === '/' ? ANA_SAYFA_BASLIGI
    : konum.pathname === PROFIL_YOLU || konum.pathname.startsWith(`${PROFIL_YOLU}/`) ? 'Profilim'
      : tumSayfalar.find((s) => s.yol === sayfaYolu)?.baslik ?? 'TMI CORE';

  // Menü yalnız kullanıcının gördüğü sayfada açılır; hiç maddesi kalmayan menü yoktur. Cihazın sade görünüm tercihi
  // açıksa yetkiyle süzülmüş maddelerden yalnız sade listedekiler kalır.
  const yetkiyleSuzulen = useMemo(
    () => acikIkinciMenu(ikinciMenuler, sayfalar.some((s) => s.yol === sayfaYolu) ? sayfaYolu : null, islemler),
    [ikinciMenuler, sayfalar, sayfaYolu, islemler],
  );
  const [sadeAcik] = useCihazTercihi(yetkiyleSuzulen?.sade?.tercih ?? null);
  const ikinci = useMemo(() => sadeGorunum(yetkiyleSuzulen, sadeAcik), [yetkiyleSuzulen, sadeAcik]);
  const sunucuSayaclari = useIkinciMenuSayaclari(ikinci?.sayacUcu);
  // Çerçevedeki modülün bildirdiği sayılar, o menü açıkken sunucunun sayılarının yerine geçer. Kök tutulur: başka
  // sayfaya geçilince eski menünün sayıları açık menüye düşmez; çerçeve kalkınca kaydını kendisi siler.
  const [cerceveSayaclari, cerceveSayaclariniYaz] = useState<{ kok: string; sayaclar: CerceveSayaclari } | null>(null);
  const cerceveSayacYaz = useCallback<CerceveSayacYazici>((kok, yeni) => {
    cerceveSayaclariniYaz((onceki) => {
      if (yeni === null) return onceki?.kok === kok ? null : onceki;
      // Aynı içerikli yeni ileti menüyü yeniden ölçtürüp kaydırmasın.
      return onceki?.kok === kok && sayaclarAyniMi(onceki.sayaclar, yeni) ? onceki : { kok, sayaclar: yeni };
    });
  }, []);
  const sayaclar = ikinci !== null && cerceveSayaclari?.kok === ikinci.kok ? cerceveSayaclari.sayaclar : sunucuSayaclari;
  // Menüler açılıp kapanmaz (kullanıcı kararı, kart #172): ana menü solda sabittir (1024 altında yalnız simge),
  // ikinci menü başlığın altında sekme şerididir.
  const cik = () => { gecmisiSil(); cikis(); };

  // Tam ekran yalnız çerçeveli sayfadadır ve hatırlanmaz: sayfa değişince kapanır.
  const cerceveli = ikinci?.cerceveli === true;
  const kapaliAdres = yolKapaliMi(konum.pathname, kapali);
  const tamEkranAcik = tamEkran && cerceveli;
  useEffect(() => { tamEkranYaz(false); }, [sayfaYolu]);
  // Esc kabuktaki odakta çalışır; çerçevenin içindeki tuşlar modülündür (kendi pencerelerini Esc ile kapatır).
  // Kabuğun pencere ve menüleri Esc'yi kendi katmanında durdurur, buraya ulaşmaz.
  useEffect(() => {
    if (!tamEkranAcik) return undefined;
    const tus = (o: KeyboardEvent) => { if (o.key === 'Escape') tamEkranYaz(false); };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [tamEkranAcik]);

  const gorunenler = gorunenUstEylemler(ustEylemler, islemler);
  const hesapMaddeleri = gorunenler.flatMap((e) => (e.hesapMaddesi === undefined ? [] : [{ anahtar: e.anahtar, hesapMaddesi: e.hesapMaddesi }]));
  return (
    <div className="tc-kabuk-cati">
      <BaglantiSeridi />
      <div
        ref={kok}
        className="tc-kabuk"
        data-ikinci={ikinci ? '' : undefined}
        data-cerceveli={cerceveli ? '' : undefined}
        data-tam-ekran={tamEkranAcik ? '' : undefined}
      >
        <nav className="tc-kabuk-menu" aria-label="Ana menü">
          {/* Klavye ve ekran okuyucu için ana sayfa bağlantısı aşağıdaki maddedir; logo yalnız fareyle tıklanan kısayoldur. */}
          <NavLink to={anaSayfa} className="tc-kabuk-marka" aria-hidden="true" tabIndex={-1} end>
            {logo === null
              ? <span className="tc-kabuk-marka-isaret mono">TMI</span>
              : <img className="tc-kabuk-marka-logo" src={logo} alt="" />}
            <span className="tc-kabuk-marka-metin">CORE</span>
          </NavLink>
          <p className="tc-kabuk-surum mono" title={`Sürüm ${DERLEME.surum}, derleme ${derlemeTarihi(DERLEME.tarih, true)}`}>
            v{DERLEME.surum} · {derlemeTarihi(DERLEME.tarih)}
          </p>
          <Baglanti sayfa={anaBaglanti} tam />
          <Baglanti sayfa={PROFIL_BAGLANTISI} />
          {gruplar.map((g) => (
            <div className="tc-kabuk-grup" key={g.grup}>
              <p className="tc-kabuk-grup-ad">{g.grup}</p>
              {g.sayfalar.map((s) => <Baglanti key={s.yol} sayfa={s} />)}
            </div>
          ))}
          {yeniEkranlar.length > 0 && (
            <div className="tc-kabuk-grup">
              <p className="tc-kabuk-grup-ad">{YENI_EKRAN_GRUBU}</p>
              {yeniEkranlar.map((s) => <Baglanti key={s.yol} sayfa={s} />)}
            </div>
          )}
        </nav>

        <header className="tc-kabuk-ust">
          {gorunenler.filter((e) => e.yer === 'sol').map((e) => <e.dugme key={e.anahtar} />)}
          <GeziDugmeleri menuler={ikinciMenuler} />
          <h1 className="tc-kabuk-baslik">{baslik}</h1>
          <GenelArama
            sayfalar={sayfalar}
            menuler={ikinciMenuler}
            islemler={islemler}
            aramaSayfalari={aramaSayfalari}
            komutlar={gorunenKomutListesi}
            sayfaKomutlari={kapaliAdres ? SAYFA_KOMUTSUZ : sayfaKomutlari}
            sorguDegisti={paletSorgusu.yaz}
          />
          <IsPaneli gruplar={olayGruplari} />
          {gorunenler.filter((e) => e.yer !== 'sol').map((e) => (e.hesapMaddesi === undefined
            ? <e.dugme key={e.anahtar} />
            : <span key={e.anahtar} className="tc-kabuk-hesapta"><e.dugme acmaIstegi={acmaIstekleri[e.anahtar] ?? 0} /></span>))}
          <button
            type="button"
            className="tc-kabuk-tema tc-kabuk-ayri"
            onClick={() => yardimYaz(true)}
            aria-haspopup="dialog"
            aria-label="Yardım ve rehber"
            title="Yardım ve rehber (F1)"
          >
            <Simge ad="help" />
          </button>
          {cerceveli && (
            <button
              type="button"
              className="tc-kabuk-tema"
              onClick={() => tamEkranYaz((a) => !a)}
              aria-pressed={tamEkranAcik}
              aria-label={tamEkranAcik ? 'Tam ekrandan çık' : 'Tam ekran'}
              title={tamEkranAcik ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'}
            >
              <Simge ad={tamEkranAcik ? 'x' : 'expand'} />
            </button>
          )}
          {/* Seyrek kullanılanlar (profil, tema, hareket, parola, çıkış) her genişlikte adın olduğu tek düğmenin menüsündedir:
              üst çubukta yalnız sık kullanılanlar kalır. Yardım masaüstünde ayrıca görünür; menüdeki kopya dar ekran içindir. */}
          <span className="tc-kabuk-hesap">
            <Menu
              etiket="Hesap"
              ipucu={`Hesap: ${kullaniciAdi}`}
              simge={null}
              metin={(
                <>
                  <span className="tc-kabuk-kisi-avatar" aria-hidden="true">{basHarfler(kullaniciAdi)}</span>
                  <span className="tc-kabuk-kisi-ad">{kullaniciAdi}</span>
                </>
              )}
              ogeler={[
                { anahtar: 'profil', baslik: 'Profilim', simge: 'user', sec: () => { void gezin(PROFIL_YOLU); } },
                { anahtar: 'yardim', baslik: 'Yardım ve rehber', simge: 'help', sec: () => { yardimYaz(true); } },
                ...hesapMaddeleri.map(({ anahtar, hesapMaddesi }) => ({
                  anahtar: `eylem-${anahtar}`, baslik: hesapMaddesi.baslik, simge: hesapMaddesi.simge,
                  sec: () => { acmaIstekleriYaz((o) => ({ ...o, [anahtar]: (o[anahtar] ?? 0) + 1 })); },
                })),
                { anahtar: 'tema', baslik: tema === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç', simge: tema === 'dark' ? 'sun' : 'moon', sec: degistir },
                { anahtar: 'performans', baslik: performansEtiketi, simge: 'gauge', sec: performansDegistir },
                { anahtar: 'parola', baslik: 'Parolamı değiştir', simge: 'edit', sec: () => { parolaYaz(true); } },
                { anahtar: 'cikis', baslik: 'Çıkış yap', simge: 'lock', sec: cik },
              ]}
            />
          </span>
        </header>

        {/* Yeni ekran menünün maddelerini kendi sekmesi olarak çizer; şerit yalnız çizilmez, menü açık kalır: çerçeveli düzen,
            tam ekran ve sayaçlar kökün menüsünden gelmeye devam eder. */}
        {ikinci && !yeniEkranAdresiMi(konum.pathname) && (
          <IkinciMenu menu={ikinci} adres={konum.pathname} sayaclar={sayaclar} />
        )}

        <span className="tc-kabuk-tarama" aria-hidden="true" />
        <main className="tc-kabuk-icerik" data-cerceveli={cerceveli && !kapaliAdres ? '' : undefined}>
          {kapaliAdres
            ? <DurumKutusu durum="bos" mesaj="Bu sayfa şu an kapalı" />
            : (
              <CerceveSayacBaglami.Provider value={cerceveSayacYaz}>
                <SayfaKomutBaglami.Provider value={sayfaKomutYaz}>
                  <PaletSorgusuBaglami.Provider value={paletSorgusu}>{children}</PaletSorgusuBaglami.Provider>
                </SayfaKomutBaglami.Provider>
              </CerceveSayacBaglami.Provider>
            )}
        </main>

        <nav className="tc-kabuk-alt" aria-label="Alt gezinme">
          <Baglanti sayfa={anaBaglanti} tam />
          {menudekiler.slice(0, ALT_CUBUK_SAYISI - 1).map((s) => <Baglanti key={s.yol} sayfa={s} />)}
          <button type="button" className="tc-kabuk-bag" onClick={() => tumuYaz(true)} aria-haspopup="dialog">
            <Simge ad="dash" />
            <span className="tc-kabuk-bag-metin">Tümü</span>
          </button>
        </nav>

        {parolaAcik && <ParolaPenceresi kapat={() => parolaYaz(false)} />}

        <RehberPenceresi
          acik={yardimAcik}
          kapat={() => yardimYaz(false)}
          maddeler={rehber}
          konular={GENEL_KONULAR}
          kisayollar={olayGruplari}
          tanitimiBaslat={() => { davetYaz(false); tanitimYaz(true); }}
        />
        <TanitimPenceresi acik={tanitimAcik} kapat={tanitimBitti} maddeler={rehber} kisayolVar={olayGruplari.length > 0} />
        {davet && !tanitimAcik && <TanitimDaveti baslat={() => { davetYaz(false); tanitimYaz(true); }} vazgec={tanitimBitti} />}

        {tumuAcik && (
          <div ref={tumKutu} className="tc-kabuk-tum" role="dialog" tabIndex={-1} aria-modal="true" aria-label="Tüm sayfalar">
            <div className="tc-kabuk-tum-ust">
              <h2 className="tc-kabuk-baslik">Tüm sayfalar</h2>
              <button type="button" className="tc-kabuk-tema" onClick={() => tumuYaz(false)} aria-label="Kapat">
                <Simge ad="x" />
              </button>
            </div>
            <p className="tc-kabuk-tum-kisi"><Simge ad="user" boyut="k" />{kullaniciAdi}</p>
            <Baglanti sayfa={anaBaglanti} tam kapat={() => tumuYaz(false)} />
            <Baglanti sayfa={PROFIL_BAGLANTISI} kapat={() => tumuYaz(false)} />
            {gruplar.map((g) => (
              <div className="tc-kabuk-grup" key={g.grup}>
                <p className="tc-kabuk-grup-ad">{g.grup}</p>
                {g.sayfalar.map((s) => <Baglanti key={s.yol} sayfa={s} kapat={() => tumuYaz(false)} />)}
              </div>
            ))}
            {yeniEkranlar.length > 0 && (
              <div className="tc-kabuk-grup">
                <p className="tc-kabuk-grup-ad">{YENI_EKRAN_GRUBU}</p>
                {yeniEkranlar.map((s) => <Baglanti key={s.yol} sayfa={s} kapat={() => tumuYaz(false)} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
