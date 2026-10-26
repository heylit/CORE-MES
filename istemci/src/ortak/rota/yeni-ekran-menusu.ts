import type { Sayfa } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';

// TS geçişinde yeni ekranları denemek için ana menüde geçici satırlar (soru 308 d): yalnız yeni ekran kapısını geçen
// (yönetici) görür. Ana menüde modül başına tek sayfa kuralının onaylı geçici istisnasıdır; bağlamada bu dosya ve
// Kabuk'taki kullanımları birlikte kalkar. Satır menü verisi değil, var olan `/yeni` rotasına bağlantıdır.
export const YENI_EKRAN_GRUBU = 'Yeni ekranlar (deneme)';

// kok: ekranın bağlı olduğu ana menü sayfası; başlık ve simge ondan gelir, sayfa kişiye görünmüyorsa satır da çizilmez.
const YENI_EKRANLAR: readonly { kok: `/${string}`; yol: `/${string}`; baslik?: string }[] = [
  { kok: '/finans', yol: '/finans/yeni' },
  { kok: '/ik', yol: '/ik/yeni' },
  { kok: '/ik-islemlerim', yol: '/ik-islemlerim/yeni' },
  { kok: '/mesaj', yol: '/mesaj/yeni' },
  { kok: '/portal', yol: '/portal/yeni' },
  { kok: '/denetim-hazirlik', yol: '/denetim-hazirlik/yeni' },
  { kok: '/cnc-kurulum', yol: '/cnc-kurulum/yeni' },
];

export const YENI_EKRAN_YOLLARI: readonly string[] = YENI_EKRANLAR.map((e) => e.yol);

// Eski adresine geçen yeni ekranlar (541, 527 1 a; 2. adım): deneme satırı kalkar, eski ekran bir süre `eski` adresinde kalır ve
// kişi menüsündeki "Eski görünüm" ile açılır. Eski görünüm yalnız yeni ekran kapısını geçene (yönetici) açıktır (681 a): operatör
// yalnız yeni ekranı görür; başkası eski adreste "yetkiniz yok" görür (App.tsx).
// Alt yol eski adreste aynı alt yoldur (`/arkon/kalite` -> `/arkon/eski/kalite`).
// tam: yalnız bu adres (alt yolu değil); Reçete ve Rota'nın kök adresinin altında eski kalan Planlama sayfaları ve bölümlerin eski adresi vardır.
// haric: kökün altında olup eskisi olmayan TMI ekranı (TMI'ye yazılamayanlar, Logo gönderimi).
// yalnizYonetici: eski ekran yalnız yöneticide açılır ve geçiş yalnız ona görünür (659 a: Planlama'nın eski çerçevesi).
// serit: kabuğun ikinci menü şeridi yeni ekranda da durur, yeni ekran kendi sekmesini çizmez (553 1 a); yoksa aynı menüdeki eski sayfalara
// (Reçete ve Rota'dan Planlama'ya) yol kalmaz. Tek maddelik menü de eski sayfadaki gibi şerit çizer (Kuyruk, Üretim Terminali).
interface TasinanEkran { yol: `/${string}`; eski: `/${string}`; tam?: true; serit?: true; haric?: readonly string[]; yalnizYonetici?: true }
export const TASINAN_EKRANLAR: readonly TasinanEkran[] = [
  { yol: '/kuyruk', eski: '/kuyruk/eski', serit: true },
  { yol: '/uretim-terminali', eski: '/uretim-terminali/eski', serit: true },
  { yol: '/arkon', eski: '/arkon/eski', serit: true, haric: ['/arkon/tmi-yansimalari'] },
  { yol: '/malzemeler', eski: '/malzemeler/eski', serit: true, haric: ['/malzemeler/logo'] },
  // Resim ve modeller ile Analiz (217 b) yalnız çerçevededir: eskisi ve yenisi yoktur.
  { yol: '/kalite-merkezi', eski: '/kalite-merkezi/eski', serit: true, haric: ['/kalite-merkezi/resimler', '/kalite-merkezi/analiz'] },
  ...(['', '/stock', '/schema', '/ops', '/sureler', '/items', '/res'] as const).map((b): TasinanEkran => ({
    yol: `/recete-rota${b}`, eski: `/recete-rota/eski${b}`, tam: true, serit: true,
  })),
  { yol: '/plan', eski: '/plan/eski', serit: true, yalnizYonetici: true },
];

const altYolMu = (adres: string, yol: string): boolean => adres === yol || adres.startsWith(`${yol}/`);
const yeniMi = (adres: string, t: TasinanEkran): boolean => (t.tam
  ? adres === t.yol
  : altYolMu(adres, t.yol) && !altYolMu(adres, t.eski) && !(t.haric ?? []).some((h) => altYolMu(adres, h)));
const eskiMi = (adres: string, t: TasinanEkran): boolean => (t.tam ? adres === t.eski : altYolMu(adres, t.eski));
const yenisi = (adres: string, t: TasinanEkran): string => t.yol + adres.slice(t.eski.length);
const eskisi = (adres: string, t: TasinanEkran): string => t.eski + adres.slice(t.yol.length);
// Sondaki `/` aynı adrestir (yönlendirici de öyle eşler).
const temiz = (adres: string): string => adres.replace(/(.)\/+$/, '$1');

// Yeni ekran ikinci menünün maddelerini kendi sekmesi olarak çizer (soru 315 a); kabuk bu adreslerde şeridini çizmez,
// yoksa iki şerit üst üste durur ve üsttekine tıklamak eski ekrana götürür. Alt yollar (`/ik/yeni/izinler`) da sayılır;
// eski adresine geçen ekranın `eski` yolu eski ekrandır, şerit orada çizilir.
export function yeniEkranAdresiMi(adres: string): boolean {
  return YENI_EKRAN_YOLLARI.some((yol) => altYolMu(adres, yol))
    || TASINAN_EKRANLAR.some((t) => !t.serit && yeniMi(temiz(adres), t));
}

// Şeritte seçili görünen madde: eski görünümde de bölümün maddesi seçili durur (`/recete-rota/eski/stock` -> Stok, kök madde değil).
export function seritAdresi(adres: string): string {
  const a = temiz(adres);
  const t = TASINAN_EKRANLAR.find((e) => e.serit && eskiMi(a, e));
  return t === undefined ? adres : yenisi(a, t);
}

// Eski ekranın adresi (`/kuyruk/eski`, `/arkon/eski/pano`); sondaki `/` aynı adrestir.
export function eskiGorunumAdresiMi(adres: string): boolean {
  const a = temiz(adres);
  return TASINAN_EKRANLAR.some((t) => eskiMi(a, t));
}

// Kişi menüsündeki geçiş: yeni ekrandayken eskisine, eski ekrandayken yenisine. Eskisi olmayan adreste ve eskisi yalnız yöneticide olan
// ekranda yönetici olmayana null.
export function gorunumGecisi(adres: string, islemler: readonly string[] = []): { baslik: string; yol: string } | null {
  const a = temiz(adres);
  for (const t of TASINAN_EKRANLAR) {
    if (t.yalnizYonetici && !islemler.includes(YENI_EKRAN_ISLEMI) && (eskiMi(a, t) || yeniMi(a, t))) return null;
    if (eskiMi(a, t)) return { baslik: 'Yeni görünüm', yol: yenisi(a, t) };
    if (yeniMi(a, t)) return { baslik: 'Eski görünüm', yol: eskisi(a, t) };
  }
  return null;
}

// Yeni ekran adresinin satırı ve bağlı olduğu ana menü sayfası. En uzun yol kazanır: `/ik-islemlerim/yeni` İK İşlemlerim'dir,
// önekteki başka sayfa değil. Kabuk başlığı ve menü seçimi bununla bulunur.
export function yeniEkranEslesmesi(adres: string): { yol: string; kok: string } | null {
  let bulunan: { yol: string; kok: string } | null = null;
  for (const e of YENI_EKRANLAR) {
    if ((adres === e.yol || adres.startsWith(`${e.yol}/`)) && (bulunan === null || e.yol.length > bulunan.yol.length)) bulunan = { yol: e.yol, kok: e.kok };
  }
  return bulunan;
}

export interface YeniEkranBaglantisi { yol: string; baslik: string; simge: SimgeAdi }

// sayfalar: kişinin menüdeki sayfaları (kapalılar düşmüş). Kapı işlemi yoksa liste boştur.
export function yeniEkranBaglantilari(sayfalar: readonly Sayfa[], islemler: readonly string[]): readonly YeniEkranBaglantisi[] {
  if (!islemler.includes(YENI_EKRAN_ISLEMI)) return [];
  return YENI_EKRANLAR.flatMap((e) => {
    const sayfa = sayfalar.find((s) => s.yol === e.kok);
    return sayfa === undefined ? [] : [{ yol: e.yol, baslik: `${e.baslik ?? sayfa.baslik} (yeni)`, simge: sayfa.simge }];
  });
}
