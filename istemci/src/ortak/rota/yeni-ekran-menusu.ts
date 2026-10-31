import { kapaliModulYoluMu, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';

// TS geçişinde yeni ekranları denemek için ana menüde geçici satırlar (soru 308 d): yalnız yeni ekran kapısını geçen
// (yönetici) görür. Ana menüde modül başına tek sayfa kuralının onaylı geçici istisnasıdır; bağlamada bu dosya ve
// Kabuk'taki kullanımları birlikte kalkar. Satır menü verisi değil, var olan `/yeni` rotasına bağlantıdır.
export const YENI_EKRAN_GRUBU = 'Yeni ekranlar (deneme)';

// kok: ekranın bağlı olduğu ana menü sayfası; başlık ve simge ondan gelir, sayfa kişiye görünmüyorsa satır da çizilmez.
const TUM_YENI_EKRANLAR: readonly { kok: `/${string}`; yol: `/${string}`; baslik?: string }[] = [
  { kok: '/ik', yol: '/ik/yeni' },
  { kok: '/ik-islemlerim', yol: '/ik-islemlerim/yeni' },
  { kok: '/mesaj', yol: '/mesaj/yeni' },
  { kok: '/portal', yol: '/portal/yeni' },
];
const YENI_EKRANLAR = TUM_YENI_EKRANLAR.filter((e) => !kapaliModulYoluMu(e.kok));

export const YENI_EKRAN_YOLLARI: readonly string[] = YENI_EKRANLAR.map((e) => e.yol);

// Eski ekranı kalkmış yeni ekranlar (1272 a, 1392 a): deneme satırı yoktur, ekran menünün kökünde ve `/yeni` altında açılır;
// ikinci menünün maddelerini kendi sekmesi olarak çizer, kabuk şeridini çizmez.
const ESKISI_KALKAN_YENI_EKRANLAR: readonly `/${string}`[] = ['/cnc-kurulum', '/finans', '/denetim-hazirlik'];

// Yeni ekran ikinci menünün maddelerini kendi sekmesi olarak çizer (soru 315 a); kabuk bu adreslerde şeridini çizmez,
// yoksa iki şerit üst üste durur ve üsttekine tıklamak eski ekrana götürür. Alt yollar (`/ik/yeni/izinler`) da sayılır.
// Kuyruk, Üretim Terminali ve Üretim Hazırlık (Arkon) listede yoktur: kabuğun şeridi onlarda durur, yeni ekran kendi sekmesini
// çizmez (553 1 a); tek maddelik menü de şerit çizer.
export function yeniEkranAdresiMi(adres: string): boolean {
  return [...YENI_EKRAN_YOLLARI, ...ESKISI_KALKAN_YENI_EKRANLAR].some((yol) => adres === yol || adres.startsWith(`${yol}/`));
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
