import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientContext } from '@tanstack/react-query';
import { SAYFALAR, menudeGorunur, yolKapaliMi, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { SayfaGrubu } from '#paylasilan/sayfa-tanimi.ts';
import { UYGULAMA_ADI, birlesikAd } from '#paylasilan/uygulama.ts';
import type { SayfaTanimi } from '#paylasilan/sayfa-tanimi.ts';
import type { CerceveSayaclari } from '../rota/cerceve-iletisi.ts';
import { CerceveSayacBaglami, type CerceveSayacYazici } from '../rota/cerceve-sayaclari.ts';
import { IKINCI_MENU_TANIMLARI, acikIkinciMenu, menuMaddeleri, type IkinciMenu as IkinciMenuTanimi } from '../rota/ikinci-menu.ts';
import { gecmisiSil, sonYerler, useGezinmeGecmisi } from '../rota/gezinme-gecmisi.ts';
import { gorunenHizliIsler, type HizliIs } from '../rota/hizli-isler.ts';
import { gorunenKomutlar, type Komut } from '../rota/komutlar.ts';
import { rehberMaddeleri, sayfaRehberleri, type SayfaRehberi } from '../rota/rehber.ts';
import { GENEL_KONULAR } from '../rota/rehber-genel.ts';
import { HesapMaddesiBaglami, gorunenUstEylemler, type HesapMaddesiDurumu, type HesapMaddesiYazici, type UstEylem } from '../rota/ust-eylemler.ts';
import { gorunenUstSeritler, type UstSerit } from '../rota/ust-seritler.ts';
import { rotaninSayfasi } from '../rota/sayfa.ts';
import { useEkranGorunur } from '../rota/kalici.tsx';
import { PaletSorgusuBaglami, SayfaKomutBaglami, paletSorgusuKur, type SayfaKomutu, type SayfaKomutYazici } from '../rota/sayfa-komutlari.ts';
import { sayaclarAyniMi, useIkinciMenuSayaclari } from '../veri/ikinci-menu-sayaclari.ts';
import { useCihazTercihi } from '../veri/cihaz-tercihi.ts';
import { YENI_EKRAN_GRUBU, yeniEkranAdresiMi, yeniEkranBaglantilari, yeniEkranEslesmesi } from '../rota/yeni-ekran-menusu.ts';
import { performansOturumdaAc, usePerformans } from '../veri/gorunum.ts';
import { hareketliEtki } from '../veri/etki.ts';
import { takilmaIzle } from '../veri/takilma.ts';
import { DERLEME, derlemeTarihi } from '../veri/surum.ts';
import { useKurumAdi } from '../veri/kurum.ts';
import { useMenuTercihi } from '../veri/menu-tercihi.ts';
import type { MenuTercihiCevabi } from '#paylasilan/sozlesme/profil.ts';
import { tanitimGoruldu, tanitimGorulduMu } from '../veri/tanitim.ts';
import { useTema } from '../veri/tema.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { BaglantiSeridi } from './BaglantiSeridi.tsx';
import { CoreYazisi } from './CoreYazisi.tsx';
import { KisayolYardimi } from './KisayolYardimi.tsx';
import { YuklemeCizgisi } from './YuklemeCizgisi.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { GenelArama } from './GenelArama.tsx';
import { GeziDugmeleri } from './GeziDugmeleri.tsx';
import { IkinciMenu } from './IkinciMenu.tsx';
import { IsPaneli } from './IsPaneli.tsx';
import { Menu } from './Menu.tsx';
import { ParolaPenceresi } from './ParolaPenceresi.tsx';
import { MenuDuzenle } from './MenuDuzenle.tsx';
import { RehberPenceresi } from './Rehber.tsx';
import { Simge } from './Simge.tsx';
import { TanitimDaveti, TanitimPenceresi } from './Tanitim.tsx';
import { useKatman } from './katman.ts';
import './kabuk.css';
import './hareket.css';

// Kişinin kendi sayfası (profil modülü): her rolün menü sayfasıdır (2192-4 b); üst çubuktaki ad ve Hesap menüsü de oraya götürür.
const PROFIL_YOLU = '/profil';

function basHarfler(ad: string): string {
  const parcalar = ad.trim().split(/\s+/).filter(Boolean);
  const ilk = parcalar[0]?.[0] ?? '';
  const son = parcalar.length > 1 ? parcalar[parcalar.length - 1]?.[0] ?? '' : '';
  return `${ilk}${son}`.toLocaleUpperCase('tr-TR') || '?';
}

const ALT_CUBUK_SAYISI = 4;

const MENU_DAR_TERCIHI = 'ana-menu-dar';
// kabuk.css'teki masaüstü sınırıyla aynı olmalı: daraltma düğmesi yalnız bu genişlikte görünür.
function masaustuMu(): boolean {
  try { return window.matchMedia('(min-width: 1024px)').matches; } catch { return true; }
}

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
  // Sistem Ayarları'ndan yüklenen kurum logosu (veri adresi); yoksa firma adı, o da yoksa yalnız uygulama adı durur.
  logo?: string | null;
  // Ana sayfa bağlantısının yolu: rolün açılış sayfası varsa o (rolün kendi panosu), yoksa ortak ana sayfa.
  anaSayfa?: string;
  // Bütün sayfaların üst çubuğundaki modül düğmeleri; uygulama modüllerin bildirdiklerini verir.
  ustEylemler?: readonly UstEylem[];
  // Bütün sayfaların en üstündeki modül şeritleri (939); uygulama modüllerin bildirdiklerini verir.
  ustSeritler?: readonly UstSerit[];
  // "Ne oldu?" panelinin olayları; uygulama modüllerin bildirdiklerini verir. Kişiye açık olay yoksa düğme çizilmez.
  hizliIsler?: readonly HizliIs[];
  // Ctrl K paletinin genel komutları; uygulama modüllerin bildirdiklerini verir. İşlemi ve sayfası kişiye açık olan görünür.
  komutlar?: readonly Komut[];
  // Sayfaların kullanım tarifi (Yardım); uygulama modüllerin bildirdiklerini verir.
  rehberler?: readonly SayfaRehberi[];
  // Verilirse ilk girişte tanıtım önerilir; görüldü bilgisi kişiye göre tutulur.
  kisiId?: number;
  // Rolün önerdiği kısa liste (1390 a), sırasıyla sayfa yolları; yetki değildir. Menüde ayrı durmaz (2951): "Menüyü düzenle"de
  // öneri olarak çıkar, kişi sık kullanılan seçmemişse telefonun alt çubuğu bunu kullanır.
  menuSirasi?: readonly string[];
  children: ReactNode;
}

const ISLEMSIZ: readonly string[] = [];
const KAPALISIZ: readonly string[] = [];
const EYLEMSIZ: readonly UstEylem[] = [];
const SERITSIZ: readonly UstSerit[] = [];
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
// Simgeli şeritte (tablet, daraltılmış menü) grup başlığının adı görünmez; başlık bu simgeyle çizilir, adı ipucudur.
const GRUP_SIMGELERI: Readonly<Record<SayfaGrubu, SimgeAdi>> = {
  'Üretim': 'tool', 'Planlama': 'gantt', 'Stok': 'pallet', 'Satın Alma': 'cart', 'Kalite': 'clipboard-check', 'Tanımlar': 'list', 'Yönetim': 'building',
};

interface BaglantiSayfasi { yol: string; baslik: string; simge: SimgeAdi }
const ANA_SAYFA_BASLIGI = 'Ana sayfa';

// Ana sayfa bağlantısı yalnız kendi yolunda seçili görünür: rolün panosu bir modül sayfasıysa alt yollarda modülün maddesi seçilidir.
// Yeni ekran adresinde (`/ik-islemlerim/yeni`) yalnız o ekranın satırı seçili görünür; adresin önekindeki başka sayfa
// (`/ik`) seçili görünmez.
// Ana menüde sayı gösteren sayfaların sayıları (sayfa yolu -> sayı). Okuyucu kabukta tektir; menü, alt çubuk ve tüm sayfalar
// listesi aynı sayıyı gösterir.
const AnaMenuSayacBaglami = createContext<ReadonlyMap<string, number>>(new Map());

/* Üst çubuk yuvası (2052-1 a): sayfa kendi şeridini kabuğun üst çubuğuna koyar, üç şerit (başlık, tek maddelik ikinci menü, sayfa
   şeridi) tek satıra iner. Yuva doluyken arama, iş paneli ve üst eylemler gizlenir ama bağlı kalır (Ctrl+K, bildirim sayımı sürer);
   geri/ileri, başlık ve hesap menüsü (çıkış) kalır. Kabuk dışında (test, önizleme) içerik yerinde çizilir. */
interface UstYuva { yer: HTMLElement | null; doldur: (dolu: boolean) => void }
const UstYuvaBaglami = createContext<UstYuva | null>(null);

// Kalıcı ekran (Üretim Terminali) başka sayfada gizlenir ama kurulu kalır; şeridi o sürede üst çubukta kalırsa başka sayfanın
// başlığını kaplar ve arama, iş paneli, üst eylemler gizli kalır. Gizliyken yuva boşaltılır, şerit çizilmez.
export function KabukUstYuvasi({ children }: { children: ReactNode }) {
  const yuva = useContext(UstYuvaBaglami);
  const gorunur = useEkranGorunur();
  const doldur = yuva?.doldur;
  const yer = yuva?.yer ?? null;
  useEffect(() => {
    if (!doldur || yer === null || !gorunur) return undefined;
    doldur(true);
    return () => { doldur(false); };
  }, [doldur, yer, gorunur]);
  if (!gorunur) return null;
  if (yer === null) return <>{children}</>;
  return createPortal(children, yer);
}


// Menünün sayaç ucunu okuyup tek maddenin sayısını yazar; görünmez. Kişinin okuma yetkisi yoksa uç sayı vermez.
function AnaMenuSayacOkuyucu({ kok, uc, anahtar, yaz }: { kok: string; uc: string; anahtar: string; yaz: (kok: string, sayi: number | null) => void }) {
  const sayaclar = useIkinciMenuSayaclari(uc);
  const sayi = sayaclar?.[anahtar] ?? null;
  useEffect(() => { yaz(kok, sayi); }, [kok, sayi, yaz]);
  return null;
}

function Baglanti({ sayfa, kapat, tam = sayfa.yol === '/' }: { sayfa: BaglantiSayfasi; kapat?: () => void; tam?: boolean }) {
  const yeni = yeniEkranEslesmesi(useLocation().pathname);
  const yalnizKendiYolu = tam || (yeni !== null && sayfa.yol !== yeni.yol);
  const sayi = useContext(AnaMenuSayacBaglami).get(sayfa.yol) ?? 0;
  return (
    <NavLink
      to={sayfa.yol}
      end={yalnizKendiYolu}
      className={({ isActive }) => `tc-kabuk-bag${isActive ? ' tc-kabuk-bag-acik' : ''}`}
      aria-label={sayi > 0 ? `${sayfa.baslik}, ${String(sayi)} bekleyen` : sayfa.baslik}
      title={sayfa.baslik}
      onClick={kapat}
    >
      <Simge ad={sayfa.simge} />
      <span className="tc-kabuk-bag-metin">{sayfa.baslik}</span>
      {sayi > 0 && <span className="tc-kabuk-bag-sayi mono" aria-hidden="true">{sayi}</span>}
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

// Telefonda tek maddelik şeridi çizilmeyen sayfalar: başlıkları kendi ekranlarındadır, şerit yalnız işi aşağı iter.
const TELEFONDA_SERITSIZ: ReadonlySet<string> = new Set(['/uretim-terminali', '/kuyruk']);

// Firma adı (kabuk.kurum-adi) kabuğa buradan gelir; sekme başlığı "<Firma> CORE" olur, girilmemişse yalnız "CORE".
// Kurulu uygulamanın adı (PWA) kurulumda sabitlenir; o yalnız CORE kalır.
// Kişinin sık kullanılanları (2951) kabuğa buradan gelir; sorgu sağlayıcısı yoksa okunmaz, menü yalnız gruplarla çizilir.
function MenuTercihiOku({ yaz }: { yaz: (t: MenuTercihiCevabi | null) => void }) {
  const { data } = useMenuTercihi();
  useEffect(() => { yaz(data ?? null); }, [data, yaz]);
  return null;
}

function KurumAdiOku({ yaz }: { yaz: (ad: string | null) => void }) {
  const ad = useKurumAdi();
  useEffect(() => {
    yaz(ad);
    document.title = birlesikAd(ad);
  }, [ad, yaz]);
  return null;
}

export function Kabuk({
  sayfalar: tumSayfalar, kullaniciAdi, cikis, islemler = ISLEMSIZ, ikinciMenuler: tumMenuler = IKINCI_MENU_TANIMLARI, kapali = KAPALISIZ, logo = null, anaSayfa = '/', ustEylemler = EYLEMSIZ, ustSeritler = SERITSIZ, hizliIsler = OLAYSIZ, komutlar = GENEL_KOMUTSUZ, rehberler = sayfaRehberleri, kisiId, menuSirasi, children,
}: Ozellikler) {
  // Kabuk sorgu sağlayıcısı olmadan da çizilir (bileşen testleri); o zaman firma adı sorulmaz.
  const sorguVar = useContext(QueryClientContext) !== undefined;
  const [kurumAdi, kurumAdiYaz] = useState<string | null>(null);
  const [menuTercihi, menuTercihiYaz] = useState<MenuTercihiCevabi | null>(null);
  const [menuDuzenleAcik, menuDuzenleYaz] = useState(false);
  const [ustYuvaYeri, ustYuvaYeriYaz] = useState<HTMLDivElement | null>(null);
  const [ustYuvaSayisi, ustYuvaSayisiYaz] = useState(0);
  const ustYuvaDoldur = useCallback((dolu: boolean) => { ustYuvaSayisiYaz((n) => Math.max(0, n + (dolu ? 1 : -1))); }, []);
  const ustYuva = useMemo<UstYuva>(() => ({ yer: ustYuvaYeri, doldur: ustYuvaDoldur }), [ustYuvaYeri, ustYuvaDoldur]);
  const anaBaglanti = useMemo<BaglantiSayfasi>(() => ({ yol: anaSayfa, baslik: ANA_SAYFA_BASLIGI, simge: 'home' }), [anaSayfa]);
  const sayfalar = useMemo(() => tumSayfalar.filter((s) => !yolKapaliMi(s.yol, kapali)), [tumSayfalar, kapali]);
  const ikinciMenuler = useMemo(() => kapaliMaddeleriSuz(tumMenuler, kapali), [tumMenuler, kapali]);
  const [anaMenuSayilari, anaMenuSayilariniYaz] = useState<ReadonlyMap<string, number>>(new Map());
  const anaMenuSayisiYaz = useCallback((kok: string, sayi: number | null) => {
    anaMenuSayilariniYaz((onceki) => {
      if ((onceki.get(kok) ?? null) === sayi) return onceki;
      const yeni = new Map(onceki);
      if (sayi === null) yeni.delete(kok);
      else yeni.set(kok, sayi);
      return yeni;
    });
  }, []);
  // Sayfası görünmeyen ama arama işlemi olan kişi de o sayfanın kayıtlarını arar (aramaIslemi).
  const aramaSayfalari = useMemo(() => SAYFALAR.filter((s) => {
    const islem = (s as Pick<SayfaTanimi, 'aramaIslemi'>).aramaIslemi;
    return islem !== undefined && islemler.includes(islem) && !sayfalar.some((g) => g.yol === s.yol) && !yolKapaliMi(s.yol, kapali);
  }), [islemler, sayfalar, kapali]);
  const { tema, degistir } = useTema();
  const [performans, performansDegistir] = usePerformans();
  const performansEtiketi = performans ? 'Performans modunu kapat' : 'Performans modunu aç';
  const [tumuAcik, tumuYaz] = useState(false);
  const [tumAramasi, tumAramasiYaz] = useState('');
  const [parolaAcik, parolaYaz] = useState(false);
  const [tamEkran, tamEkranYaz] = useState(false);
  // Ana menünün daraltılmışlığı tarayıcıya aittir: aynı bilgisayarda çalışan herkes aynı genişlikte bulur (karar 682 a).
  const [menuDar, menuDarYaz] = useCihazTercihi(MENU_DAR_TERCIHI);
  const konum = useLocation();
  const gezin = useNavigate();
  // Bekletilen sayfanın bağlantısı çizilmez; adresi açılır ve başlığı görünür.
  const menudekiler = useMemo(() => sayfalar.filter(menudeGorunur), [sayfalar]);
  const gruplar = useMemo(() => grupla(menudekiler), [menudekiler]);
  // Rol listesi (1390 a) artık menüde ayrı durmaz (2951); telefon çubuğunun yedeği ve "Rolümün önerisi"dir.
  const rolMenusu = useMemo(
    () => (menuSirasi === undefined ? null : menuSirasi.flatMap((yol) => menudekiler.filter((s) => s.yol === yol))),
    [menuSirasi, menudekiler],
  );
  // Sık kullanılanlar kişinin seçtiği sırayla, yalnız açabildiği sayfalardan; yetkisi kalkan sayfa listede olsa da çıkmaz.
  const sikKullanilanlar = useMemo(
    () => (menuTercihi?.sayfalar ?? []).flatMap((yol) => menudekiler.filter((s) => s.yol === yol)),
    [menuTercihi, menudekiler],
  );
  // Kişinin açıp kapadığı gruplar; dokunulmamış grup, açık sayfayı içeriyorsa açık gelir.
  const grupKimligi = useId();
  const [grupSecimleri, grupSecimleriYaz] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const grubuAcKapa = useCallback((grup: string, acik: boolean) => {
    grupSecimleriYaz((o) => new Map(o).set(grup, !acik));
  }, []);
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
  // Geri ve İleri düğmeleri ile aramanın son yerleri aynı sayımı okur: tek kez tutulur.
  const gecmis = useGezinmeGecmisi();
  const [acmaIstekleri, acmaIstekleriYaz] = useState<Readonly<Record<string, number>>>({});
  const [maddeDurumlari, maddeDurumlariYaz] = useState<ReadonlyMap<string, HesapMaddesiDurumu>>(new Map());
  const maddeDurumuYaz = useCallback<HesapMaddesiYazici>((anahtar, durum) => {
    maddeDurumlariYaz((o) => {
      const eski = o.get(anahtar);
      if (durum === null ? eski === undefined : eski?.gizli === durum.gizli && eski.baslik === durum.baslik) return o;
      const yeni = new Map(o);
      if (durum === null) yeni.delete(anahtar); else yeni.set(anahtar, durum);
      return yeni;
    });
  }, []);
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

  // Ctrl+B yalnız menünün daraldığı genişlikte çalışır; tablette menü zaten şerittir, telefonda yoktur.
  useEffect(() => {
    const tus = (o: KeyboardEvent) => {
      if (!(o.ctrlKey || o.metaKey) || o.altKey || o.shiftKey || o.key.toLocaleLowerCase('en') !== 'b' || !masaustuMu()) return;
      o.preventDefault();
      menuDarYaz(!menuDar);
    };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [menuDar, menuDarYaz]);

  useEffect(() => { tumuYaz(false); }, [konum.pathname]);
  useEffect(() => { if (!tumuAcik) tumAramasiYaz(''); }, [tumuAcik]);

  // Takılma koruması (kart 2092, karar 2081-29): kare hızı düşünce bu oturumda sade kipe geçilir ve bir kez söylenir.
  const [sadelesti, sadelestiYaz] = useState(false);
  useEffect(() => {
    // Hareket yoksa (kapalı, azaltılmış, ölçülemeyen ortam) koruyacak bir şey de yoktur.
    if (performans || !hareketliEtki('takilma-korumasi')) return undefined;
    return takilmaIzle(() => { performansOturumdaAc(); sadelestiYaz(true); });
  }, [performans]);

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

  // Yeni ekran kendi ana menü sayfasına bağlıdır; adres önekine bakılsa Üretim Terminali'nin yeni ekranı Üretim Hazırlık sayılırdı.
  const sayfaYolu = yeniEkranEslesmesi(konum.pathname)?.kok ?? rotaninSayfasi(konum.pathname);
  // Başlık kişinin sayfalarından alınır: yetkisi olmayan sayfanın adresinde "bulunamadı" içeriğinin üstünde o sayfanın adı
  // yazmasın. Kapalı sayfa kişinindir; adı kalır, içerik "kapalı" der.
  const baslik = konum.pathname === '/' ? ANA_SAYFA_BASLIGI
    : konum.pathname === PROFIL_YOLU || konum.pathname.startsWith(`${PROFIL_YOLU}/`) ? 'Profilim'
      : tumSayfalar.find((s) => s.yol === sayfaYolu)?.baslik ?? UYGULAMA_ADI;

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
  // Ana menü solda durur; masaüstünde kişi onu simge şeridine daraltabilir (682 a), 1024 altında hep şerittir.
  // İkinci menü başlığın altında sekme şerididir ve kapanmaz.
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
  const seritler = gorunenUstSeritler(ustSeritler, islemler);
  const sonYerListesi = sonYerler(gecmis);
  const hesapMaddeleri = gorunenler.flatMap((e) => {
    const durum = maddeDurumlari.get(e.anahtar);
    if (e.hesapMaddesi === undefined || durum?.gizli === true) return [];
    return [{ anahtar: e.anahtar, hesapMaddesi: { ...e.hesapMaddesi, baslik: durum?.baslik ?? e.hesapMaddesi.baslik } }];
  });
  // Yalnız kişinin gördüğü sayfaların sayısı okunur: görmediği sayfanın ucunu yoklamaz.
  const anaMenuSayaclari = ikinciMenuler.filter((m) => m.anaMenuSayaci !== undefined && m.sayacUcu !== undefined && sayfalar.some((p) => p.yol === m.kok));
  const altSayfalar = (sikKullanilanlar.length > 0 ? sikKullanilanlar : rolMenusu ?? menudekiler)
    .slice(0, ALT_CUBUK_SAYISI - (olayGruplari.length > 0 ? 2 : 1));
  // Telefonda "Tümü" elli sayfaya yakın listedir: ad yazılınca gruplar yerine yalnız eşleşen sayfalar kalır.
  const tumSorgu = tumAramasi.trim().toLocaleLowerCase('tr');
  // Grup adı da eşleşir: "stok" yazan kişi Stok grubunun bütün sayfalarını bulur.
  const tumBulunanlar = tumSorgu === ''
    ? null
    : [...new Map([
      ...gruplar.flatMap((g) => (g.grup.toLocaleLowerCase('tr').includes(tumSorgu) ? g.sayfalar : g.sayfalar.filter((s) => s.baslik.toLocaleLowerCase('tr').includes(tumSorgu)))),
      ...yeniEkranlar.filter((s) => s.baslik.toLocaleLowerCase('tr').includes(tumSorgu)),
    ].map((s) => [s.yol, s] as const)).values()];
  return (
    <AnaMenuSayacBaglami.Provider value={anaMenuSayilari}>
    <HesapMaddesiBaglami.Provider value={maddeDurumuYaz}>
    {anaMenuSayaclari.map((m) => (
      <AnaMenuSayacOkuyucu key={m.kok} kok={m.kok} uc={m.sayacUcu ?? ''} anahtar={m.anaMenuSayaci ?? ''} yaz={anaMenuSayisiYaz} />
    ))}
    <div className="tc-kabuk-cati">
      {seritler.map((s) => <s.serit key={s.anahtar} />)}
      <BaglantiSeridi />
      <YuklemeCizgisi />
      <KisayolYardimi />
      {sadelesti && (
        <div className="tc-kabuk-sade-not" role="status">
          <span>Cihaz yavaşladı; bu oturumda hareketler sadeleşti.</span>
          <button type="button" className="tc-kabuk-sade-kapat" onClick={() => { sadelestiYaz(false); }}>Tamam</button>
        </div>
      )}
      <div
        ref={kok}
        className="tc-kabuk"
        data-ikinci={ikinci ? '' : undefined}
        data-ikinci-tek={ikinci && TELEFONDA_SERITSIZ.has(ikinci.kok) && menuMaddeleri(ikinci).length === 1 ? '' : undefined}
        data-ust-yuva={ustYuvaSayisi > 0 ? '' : undefined}
        data-cerceveli={cerceveli ? '' : undefined}
        data-tam-ekran={tamEkranAcik ? '' : undefined}
        data-menu-dar={menuDar ? '' : undefined}
      >
        <nav className="tc-kabuk-menu" aria-label="Ana menü">
          {/* Klavye ve ekran okuyucu için ana sayfa bağlantısı aşağıdaki maddedir; logo yalnız fareyle tıklanan kısayoldur. */}
          <NavLink to={anaSayfa} className="tc-kabuk-marka" aria-hidden="true" tabIndex={-1} end>
            {logo !== null
              ? <img className="tc-kabuk-marka-logo" src={logo} alt="" />
              : kurumAdi !== null && <span className="tc-kabuk-marka-isaret mono">{kurumAdi}</span>}
            <CoreYazisi className="tc-kabuk-marka-metin" />
          </NavLink>
          <p className="tc-kabuk-surum mono" title={`Sürüm ${DERLEME.surum}, derleme ${derlemeTarihi(DERLEME.tarih, true)}`}>
            {/^0\.0\.0/.test(DERLEME.surum) ? 'geliştirme' : DERLEME.surum} · {derlemeTarihi(DERLEME.tarih)}
          </p>
          <button
            type="button"
            className="tc-kabuk-bag tc-kabuk-daralt"
            onClick={() => menuDarYaz(!menuDar)}
            aria-expanded={!menuDar}
            aria-label={menuDar ? 'Menüyü genişlet' : 'Menüyü daralt'}
            title={menuDar ? 'Menüyü genişlet (Ctrl+B)' : 'Menüyü daralt (Ctrl+B)'}
          >
            <Simge ad={menuDar ? 'chev-right' : 'chev-left'} />
            <span className="tc-kabuk-bag-metin">Menüyü daralt</span>
          </button>
          <Baglanti sayfa={anaBaglanti} tam />
          {/* Menüyü düzenle bir sayfa satırı gibi Ana sayfa'nın altında durur (2952-1); sık kullanılanlar onun altındadır. */}
          {sorguVar && (
            <button type="button" className="tc-kabuk-bag" onClick={() => menuDuzenleYaz(true)} aria-haspopup="dialog" title="Menüyü düzenle">
              <Simge ad="edit" />
              <span className="tc-kabuk-bag-metin">Menüyü düzenle</span>
            </button>
          )}
          {sorguVar && sikKullanilanlar.length > 0 && (
            <div className="tc-kabuk-grup tc-kabuk-sik" aria-label="Sık kullanılanlar" role="group">
              <p className="tc-kabuk-grup-ad">Sık kullanılanlar</p>
              {sikKullanilanlar.map((s) => <Baglanti key={s.yol} sayfa={s} />)}
            </div>
          )}
          {gruplar.map((g, i) => {
            const acik = grupSecimleri.get(g.grup) ?? g.sayfalar.some((s) => konum.pathname === s.yol || konum.pathname.startsWith(`${s.yol}/`));
            return (
              <div className="tc-kabuk-grup tc-kabuk-acilir" key={g.grup} data-acik={acik ? '' : undefined}>
                <button type="button" className="tc-kabuk-bag tc-kabuk-acilir-bas" aria-expanded={acik} aria-label={g.grup} aria-describedby={`${grupKimligi}-${String(i)}`} title={g.grup} onClick={() => grubuAcKapa(g.grup, acik)}>
                  <span className="tc-kabuk-acilir-simge"><Simge ad={GRUP_SIMGELERI[g.grup]} /></span>
                  <span className="tc-kabuk-bag-metin">{g.grup}</span>
                  <span className="tc-kabuk-acilir-sayi">{g.sayfalar.length}</span>
                  <span className="tc-kabuk-ac-ok"><Simge ad="chev-right" boyut="k" /></span>
                  {/* Görünen sayı erişilebilir ada girmez (ad grup adıdır); ekran okuyucu onu açıklama olarak duyar. */}
                  <span id={`${grupKimligi}-${String(i)}`} hidden>{g.sayfalar.length} sayfa</span>
                </button>
                {g.sayfalar.map((s) => <Baglanti key={s.yol} sayfa={s} />)}
              </div>
            );
          })}
          {yeniEkranlar.length > 0 && (
            <div className="tc-kabuk-grup">
              <p className="tc-kabuk-grup-ad">{YENI_EKRAN_GRUBU}</p>
              {yeniEkranlar.map((s) => <Baglanti key={s.yol} sayfa={s} />)}
            </div>
          )}
        </nav>

        <header className="tc-kabuk-ust">
          {gorunenler.filter((e) => e.yer === 'sol').map((e) => <e.dugme key={e.anahtar} />)}
          <GeziDugmeleri menuler={ikinciMenuler} gecmis={gecmis} />
          <h1 className="tc-kabuk-baslik">{baslik}</h1>
          <div ref={ustYuvaYeriYaz} className="tc-kabuk-yuva" />
          <GenelArama
            sayfalar={sayfalar}
            menuler={ikinciMenuler}
            islemler={islemler}
            aramaSayfalari={aramaSayfalari}
            komutlar={gorunenKomutListesi}
            sayfaKomutlari={kapaliAdres ? SAYFA_KOMUTSUZ : sayfaKomutlari}
            sorguDegisti={paletSorgusu.yaz}
            sonYerler={sonYerListesi}
          />
          <IsPaneli gruplar={olayGruplari} />
          {/* Sarmalayıcı yalnız sayfa şeridi üst çubuktayken anlam taşır (kabuk.css); başka sayfada görünüm değişmez. */}
          {gorunenler.filter((e) => e.yer !== 'sol').map((e) => (e.hesapMaddesi === undefined
            ? (e.seritte === true ? <span key={e.anahtar} className="tc-kabuk-seritte"><e.dugme /></span> : <e.dugme key={e.anahtar} />)
            : (
              <span key={e.anahtar} className={e.yer === 'hesap' ? 'tc-kabuk-yalniz-hesapta' : 'tc-kabuk-hesapta'}>
                <e.dugme acmaIstegi={acmaIstekleri[e.anahtar] ?? 0} />
              </span>
            )))}
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
          {/* Seyrek kullanılanlar (profil, kişinin kendi işleri, yardım, tema, hareket, parola, çıkış) her genişlikte adın olduğu
              tek düğmenin menüsündedir: üst çubukta yalnız sık kullanılanlar kalır (516 a). Yardım F1 ile de açılır. Menüdeki
              eylemin dikkat isteyen durumu kişinin yuvarlağında işaretle görünür. */}
          <span className="tc-kabuk-hesap">
            <Menu
              etiket="Hesap"
              ipucu={`Hesap: ${kullaniciAdi}`}
              simge={null}
              metin={(
                <>
                  <span className="tc-kabuk-kisi-avatar">
                    <span aria-hidden="true">{basHarfler(kullaniciAdi)}</span>
                    {gorunenler.map((e) => (e.isaret === undefined ? null : <e.isaret key={e.anahtar} />))}
                  </span>
                  <span className="tc-kabuk-kisi-ad">{kullaniciAdi}</span>
                </>
              )}
              ogeler={[
                { anahtar: 'profil', baslik: 'Profilim', simge: 'user', sec: () => { void gezin(PROFIL_YOLU); } },
                ...hesapMaddeleri.map(({ anahtar, hesapMaddesi }) => ({
                  anahtar: `eylem-${anahtar}`, baslik: hesapMaddesi.baslik, simge: hesapMaddesi.simge,
                  sec: () => { acmaIstekleriYaz((o) => ({ ...o, [anahtar]: (o[anahtar] ?? 0) + 1 })); },
                })),
                { anahtar: 'yardim', baslik: 'Yardım ve rehber', simge: 'help', sec: () => { yardimYaz(true); } },
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
        {/* Davet köşede sabit durur; içerik altına onun payı kadar boşluk alır ki son düğmeler davetin üstüne kaydırılabilsin (A7). */}
        <main className="tc-kabuk-icerik" data-cerceveli={cerceveli && !kapaliAdres ? '' : undefined} data-davet={davet && !tanitimAcik ? '' : undefined}>
          {kapaliAdres
            ? <DurumKutusu durum="bos" mesaj="Bu sayfa şu an kapalı" />
            : (
              <CerceveSayacBaglami.Provider value={cerceveSayacYaz}>
                <SayfaKomutBaglami.Provider value={sayfaKomutYaz}>
                  <PaletSorgusuBaglami.Provider value={paletSorgusu}>
                    <UstYuvaBaglami.Provider value={ustYuva}>{children}</UstYuvaBaglami.Provider>
                  </PaletSorgusuBaglami.Provider>
                </SayfaKomutBaglami.Provider>
              </CerceveSayacBaglami.Provider>
            )}
        </main>

        <nav className="tc-kabuk-alt" aria-label="Alt gezinme">
          <Baglanti sayfa={anaBaglanti} tam />
          {/* Kayıt gir olan kişide orta yuva onundur; sık kullanılanların ikisi onun iki yanında durur. */}
          {altSayfalar.slice(0, 1).map((s) => <Baglanti key={s.yol} sayfa={s} />)}
          {olayGruplari.length > 0 && <IsPaneli gruplar={olayGruplari} altta />}
          {altSayfalar.slice(1).map((s) => <Baglanti key={s.yol} sayfa={s} />)}
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
          kurumAdi={kurumAdi}
        />
        <TanitimPenceresi acik={tanitimAcik} kapat={tanitimBitti} maddeler={rehber} kisayolVar={olayGruplari.length > 0} kurumAdi={kurumAdi} />
        {sorguVar && <KurumAdiOku yaz={kurumAdiYaz} />}
        {sorguVar && <MenuTercihiOku yaz={menuTercihiYaz} />}
        {menuDuzenleAcik && (
          <MenuDuzenle
            kapat={() => menuDuzenleYaz(false)}
            gruplar={gruplar}
            secili={menuTercihi?.sayfalar ?? []}
            surum={menuTercihi?.surum ?? 0}
            oneri={menuSirasi ?? []}
          />
        )}
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
            <label className="tc-kabuk-tum-ara">
              <Simge ad="search" boyut="k" />
              <input
                className="tc-alan-kutu"
                type="search"
                value={tumAramasi}
                onChange={(o) => tumAramasiYaz(o.target.value)}
                placeholder="Sayfa ara"
                aria-label="Sayfa ara"
                enterKeyHint="search"
              />
            </label>
            {tumBulunanlar !== null ? (
              <div className="tc-kabuk-grup tc-kabuk-tum-izgara" role="group" aria-label="Bulunan sayfalar">
                {tumBulunanlar.length === 0
                  ? <p className="tc-kabuk-tum-yok">Bu adla sayfa yok</p>
                  : tumBulunanlar.map((s) => <Baglanti key={s.yol} sayfa={s} kapat={() => tumuYaz(false)} />)}
              </div>
            ) : (
              <>
            <Baglanti sayfa={anaBaglanti} tam kapat={() => tumuYaz(false)} />
            {/* Telefonda ana menü yoktur; sık kullanılanlar buradan seçilir, alt çubuk ilk ikisini alır (Kayıt gir olmayan kişide ilk üçünü). */}
            {sorguVar && (
              <button type="button" className="tc-kabuk-bag" onClick={() => { tumuYaz(false); menuDuzenleYaz(true); }} aria-haspopup="dialog">
                <Simge ad="edit" />
                <span className="tc-kabuk-bag-metin">Menüyü düzenle</span>
              </button>
            )}
            {sikKullanilanlar.length > 0 && (
              <div className="tc-kabuk-grup tc-kabuk-tum-izgara" role="group" aria-label="Sık kullanılanlar">
                <p className="tc-kabuk-grup-ad">Sık kullanılanlar</p>
                {sikKullanilanlar.map((s) => <Baglanti key={s.yol} sayfa={s} kapat={() => tumuYaz(false)} />)}
              </div>
            )}
            {gruplar.map((g) => (
              <div className="tc-kabuk-grup tc-kabuk-tum-izgara" key={g.grup}>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
    </HesapMaddesiBaglami.Provider>
    </AnaMenuSayacBaglami.Provider>
  );
}
