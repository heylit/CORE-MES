import type { Sayfa } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';

// TS geçişinde yeni ekranları denemek için ana menüde geçici satırlar (soru 308 d): yalnız yeni ekran kapısını geçen
// (yönetici) görür. Ana menüde modül başına tek sayfa kuralının onaylı geçici istisnasıdır; bağlamada bu dosya ve
// Kabuk'taki kullanımları birlikte kalkar. Satır menü verisi değil, var olan `/yeni` rotasına bağlantıdır.
export const YENI_EKRAN_GRUBU = 'Yeni ekranlar (deneme)';

// kok: ekranın bağlı olduğu ana menü sayfası; başlık ve simge ondan gelir, sayfa kişiye görünmüyorsa satır da çizilmez.
const YENI_EKRANLAR: readonly { kok: `/${string}`; yol: `/${string}`; baslik?: string }[] = [
  { kok: '/arkon', yol: '/arkon/yeni' },
  // Eski sistemde Üretim Terminali ve Kuyruk ana menüde ayrı satırdır (497/5 a); yeni ekranda da Arkon sekmesi değil, ayrı sayfadır.
  { kok: '/uretim-terminali', yol: '/arkon/yeni/operator' },
  { kok: '/recete-rota', yol: '/recete-rota/planlama-yeni', baslik: 'Planlama' },
  { kok: '/malzemeler', yol: '/malzemeler/yeni-ekran' },
  { kok: '/kalite-merkezi', yol: '/kalite-merkezi/yeni' },
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
// kişi menüsündeki "Eski görünüm" ile açılır. Görünürlük sayfanın kendi işlemidir; `eski` sayfanın alt yolu olduğu için aynı işlemle açılır.
// tam: yalnız bu adres (alt yolu değil); Reçete ve Rota'nın kök adresinin altında eski kalan Planlama sayfaları ve bölümlerin eski adresi vardır.
// serit: kabuğun ikinci menü şeridi yeni ekranda da durur, yeni ekran kendi sekmesini çizmez (553 1 a); yoksa aynı menüdeki eski sayfalara
// (Reçete ve Rota'dan Planlama'ya) yol kalmaz.
interface TasinanEkran { yol: `/${string}`; eski: `/${string}`; tam?: true; serit?: true }
export const TASINAN_EKRANLAR: readonly TasinanEkran[] = [
  { yol: '/kuyruk', eski: '/kuyruk/eski' },
  ...(['', '/stock', '/schema', '/ops', '/sureler', '/items', '/res'] as const).map((b): TasinanEkran => ({
    yol: `/recete-rota${b}`, eski: `/recete-rota/eski${b}`, tam: true, serit: true,
  })),
];

const altYolMu = (adres: string, yol: string): boolean => adres === yol || adres.startsWith(`${yol}/`);
const yeniMi = (adres: string, t: TasinanEkran): boolean => (t.tam ? adres === t.yol : altYolMu(adres, t.yol) && !altYolMu(adres, t.eski));
const eskiMi = (adres: string, t: TasinanEkran): boolean => (t.tam ? adres === t.eski : altYolMu(adres, t.eski));
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
  return TASINAN_EKRANLAR.find((t) => t.serit && eskiMi(a, t))?.yol ?? adres;
}

// Kişi menüsündeki geçiş: yeni ekrandayken eskisine, eski ekrandayken yenisine. Eskisi olmayan adreste null.
export function gorunumGecisi(adres: string): { baslik: string; yol: string } | null {
  const a = temiz(adres);
  for (const t of TASINAN_EKRANLAR) {
    if (eskiMi(a, t)) return { baslik: 'Yeni görünüm', yol: t.yol };
    if (yeniMi(a, t)) return { baslik: 'Eski görünüm', yol: t.eski };
  }
  return null;
}

// Yeni ekran adresinin satırı ve bağlı olduğu ana menü sayfası. En uzun yol kazanır: `/arkon/yeni/operator` Üretim
// Terminali'dir, önekteki `/arkon` (Üretim Hazırlık) değil. Kabuk başlığı ve menü seçimi bununla bulunur.
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
