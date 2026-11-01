import type { Islem } from './islemler.ts';
import { KAYIT_ARAMA_EN_COK_SONUC, KAYIT_ARAMA_EN_KISA, KAYIT_ARAMA_EN_UZUN, type KayitAramaSonucu } from './sayfa-tanimi.ts';

// Genel aramanın (Ctrl K) kayıt türleri. Her türün tek sahibi modüldür; çekirdek, modülün bildirdiği kaynağın türü
// başka modülünse sunucuyu açmaz. Önek süzgeçtir: "e:1234" yalnız emirleri arar. Sıra, eşit puanlı türlerin dizilişidir.
export const KAYIT_TURLERI = {
  emir: { onek: 'e', ad: 'Üretim emri', modul: 'uretim-emirleri' },
  malzeme: { onek: 'm', ad: 'Malzeme', modul: 'malzemeler' },
  parti: { onek: 'p', ad: 'Parti / lot', modul: 'stok' },
  konum: { onek: 'd', ad: 'Depo konumu', modul: 'stok' },
  firma: { onek: 'f', ad: 'Firma', modul: 'musteri-tedarikci' },
  kisi: { onek: 'k', ad: 'Kişi', modul: 'kisiler' },
  talep: { onek: 't', ad: 'Satın alma talebi', modul: 'satin-alma' },
  alim: { onek: 'a', ad: 'Satın alma siparişi', modul: 'satin-alma' },
  siparis: { onek: 'sp', ad: 'Müşteri siparişi', modul: 'siparisler' },
  sevk: { onek: 's', ad: 'Sevkiyat', modul: 'sevkiyat' },
  ncr: { onek: 'n', ad: 'NCR', modul: 'kalite-merkezi' },
  hatali: { onek: 'h', ad: 'Hatalı parça', modul: 'kalite-merkezi' },
  cizim: { onek: 'c', ad: 'Çizim', modul: 'belge-merkezi' },
  rota: { onek: 'r', ad: 'Reçete ve rota', modul: 'recete-rota' },
  olcuAleti: { onek: 'ol', ad: 'Ölçü aleti', modul: 'kalibrasyon' },
  istasyon: { onek: 'i', ad: 'İstasyon', modul: 'istasyonlar' },
} as const satisfies Record<string, { onek: string; ad: string; modul: string }>;

export type KayitTuru = keyof typeof KAYIT_TURLERI;

export const KAYIT_TURU_SIRASI = Object.keys(KAYIT_TURLERI) as readonly KayitTuru[];
export const kayitTuruMu = (deger: unknown): deger is KayitTuru => typeof deger === 'string' && Object.hasOwn(KAYIT_TURLERI, deger);

// Süzgeçsiz aramada her tür en çok KAYIT_ARAMA_EN_COK_SONUC sonuç verir, toplam bu sınırı aşmaz. Süzgeçli aramada tek tür
// toplamın tamamını alır.
export const GENEL_ARAMA_EN_COK_SONUC = 25;
// Önek ve iki nokta ham sorguyu uzatır; sınır öneksiz sorguya uygulanır.
export const GENEL_ARAMA_HAM_EN_UZUN = KAYIT_ARAMA_EN_UZUN + 4;

export interface AyrilmisSorgu {
  tur: KayitTuru | null;
  q: string;
}

const ONEKLER = new Map<string, KayitTuru>(KAYIT_TURU_SIRASI.map((t) => [KAYIT_TURLERI[t].onek, t]));
const ONEKLI = /^([a-z]{1,3}):\s*(.*)$/is;

// Bilinmeyen önek süzgeç değildir ("saat:10" bütünüyle aranır). Önek büyük harfle de yazılabilir.
export function aramaSorgusunuAyir(ham: string): AyrilmisSorgu {
  const metin = ham.trim();
  const parca = ONEKLI.exec(metin);
  const tur = parca === null ? undefined : ONEKLER.get(parca[1]!.toLowerCase());
  return tur === undefined ? { tur: null, q: metin } : { tur, q: parca![2]!.trim() };
}

export const aramaSorgusuGecerliMi = (q: string): boolean => q.length >= KAYIT_ARAMA_EN_KISA && q.length <= KAYIT_ARAMA_EN_UZUN;

// Türkçe harf eşlemesi veritabanının dil ayarına bırakılmaz (C.UTF-8'de 'IŞIK' ILIKE 'ışık' yanlıştır): iki yan da aynı
// tabloyla sadeleşir. SQL karşılığı `public.arama_sade(text)` (göç 20261029125000) bu tablonun aynısıdır; ikisi birlikte değişir.
// Büyük harf küçülür, Türkçe ve şapkalı harf düz harfe iner ("Çek" ve "cek" aynıdır); başka harf olduğu gibi kalır.
export const SADE_KAYNAK = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİıÖŞÜçğöşüÂâÎîÛû';
export const SADE_HEDEF = 'abcdefghijklmnopqrstuvwxyzcgiiosucgosuaaiiuu';
const SADE = new Map(Array.from(SADE_KAYNAK, (h, i) => [h, SADE_HEDEF[i]!]));
export const aramaSade = (metin: string): string => Array.from(metin, (h) => SADE.get(h) ?? h).join('');

// LIKE'ın joker karakterleri kaçırılır (varsayılan kaçış karakteri ters bölü): "%" yazan herkesi bulmasın. Desen sadeleşmiştir.
const kacir = (q: string): string => q.replace(/[\\%_]/g, (c) => `\\${c}`);
export const icindeDeseni = (q: string): string => `%${kacir(aramaSade(q))}%`;
export const basDeseni = (q: string): string => `${kacir(aramaSade(q))}%`;

// Modül kaynağına giden istek. Çekirdek sorguyu doğrulamış ve kırpmıştır; `sade` ve desenler hazırdır.
// SQL kalıbı: aranan sütun da aynı işlevden geçer; pg_trgm GIN indeksi bu ifadeye kurulur ve LIKE '%x%'i hızlandırır
// (strpos, position ve sadeleşmemiş sütunda ILIKE indeksi kullanmaz):
//   indeks: CREATE INDEX <modul>_<tablo>_<sutun>_trgm ON <tablo> USING gin (public.arama_sade(<sutun>) public.gin_trgm_ops)
//   WHERE public.arama_sade(kod) LIKE $icinde OR public.arama_sade(ad) LIKE $icinde
//   ORDER BY (public.arama_sade(kod) = $sade) DESC, (public.arama_sade(kod) LIKE $bas) DESC, <yeniden eskiye> LIMIT $sinir
export interface KayitAramaIstegi {
  q: string;
  sade: string;
  icindeDeseni: string;
  basDeseni: string;
  sinir: number;
  kullanici: { id: number; islemler: readonly Islem[] };
}

// Modülün `disari.ts` dosyasında `export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[]` olarak verdiği
// kaynak; çekirdek onu kayıt satırı olmadan bulur. D sunucunun veritabanı tipidir (paylaşılan sunucuyu ithal etmez).
export interface KayitAramaKaynagi<D> {
  tur: KayitTuru;
  // Kişide bunlardan biri yoksa çekirdek kaynağı hiç çağırmaz. Kaynak daha dar görmesi gerekeni (ör. yalnız kendi
  // istasyonu) `kullanici` ile kendisi daraltır.
  yetki: readonly [Islem, ...Islem[]];
  // En çok `sinir` sonuç, en iyi eşleşme önde. Yol kayıt ayrıntısının uygulama içi adresidir (`kayitYoluMu`); başlık kod.
  ara: (db: D, istek: KayitAramaIstegi) => Promise<readonly KayitAramaSonucu[]>;
}

export interface GenelAramaSonucu extends KayitAramaSonucu {
  tur: KayitTuru;
}

export interface GenelAramaCevabi {
  sonuclar: GenelAramaSonucu[];
  // Hata veren ya da süresi dolan türler: sonuçsuzluk "kayıt yok" diye gösterilmesin.
  eksik: KayitTuru[];
}

// Başlık (kod) ile sorgunun eşleşmesi: 3 tam, 2 baştan, 1 içinde, 0 başka alanda. Karşılaştırma sadeleşmiş metinle.
export function eslesmePuani(q: string, baslik: string): 0 | 1 | 2 | 3 {
  const a = aramaSade(q.trim());
  const b = aramaSade(baslik.trim());
  if (a === '') return 0;
  if (a === b) return 3;
  if (b.startsWith(a)) return 2;
  return b.includes(a) ? 1 : 0;
}

export const turBasinaSinir = (suzgecli: boolean): number => (suzgecli ? GENEL_ARAMA_EN_COK_SONUC : KAYIT_ARAMA_EN_COK_SONUC);
