import type { KaynakDegisikligi, KaynakDegisiklikAlani } from '#paylasilan/sozlesme/planlama.ts';
import { bekleyenListesi, bekleyenler } from '../../kayit.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../../tipler.ts';

// 1962 / 1965 a: planlama sayfasının üst şeridi. Sunucu birleşmesinin bulduğu başka sayfa değişikliği bekleyen değişiklik listesine (755 a)
// "başka sayfadan" satırı olarak girer; kaynak değişikliği plandan geri alınamaz (sahibinde geri alınır), yalnız uygulanabilir.

export const ALAN_ADLARI: Readonly<Record<KaynakDegisiklikAlani, string>> = {
  tezgahlar: 'Tezgâhlar', personel: 'Personel', vardiyalar: 'Vardiyalar', calismaGunleri: 'Çalışma günleri', tatiller: 'Tatiller',
  urunler: 'Ürün ve rotalar', malzemeler: 'Malzemeler', siparisler: 'Siparişler', fasoncular: 'Fasoncular', opAdet: 'Operasyon adetleri',
  devamsizlik: 'Devamsızlık', satinalma: 'Satın alma', ariza: 'Makine arızası', receteRotaKaydi: 'Reçete ve Rota kaydı',
};

export const DIS_ONEK = 'dis-';
// Ayrıntı satırında en çok bu kadar fark yazılır; tamamı sunucunun 50 farkıdır.
export const AYRINTI_FARK = 8;

// B-2499-8: fark kullanıcıya alan yolu ("ariza.length", "saSurum") olarak değil, alan adı, kayıt ve değişimle yazılır. Adı bilinmeyen
// iç alanın değeri yazılmaz; yalnız "değişti" denir (iç sayaçlar kullanıcıya anlam taşımaz).
const ALT_ALAN_ADLARI: Readonly<Record<string, string>> = {
  ad: 'ad', kod: 'kod', durum: 'durum', adet: 'adet', termin: 'termin', due: 'termin', oncelik: 'öncelik', stok: 'stok', miktar: 'miktar',
  baslangic: 'başlangıç', bitis: 'bitiş', sure: 'süre', ucret: 'ücret', aktif: 'etkin', arizali: 'arızalı',
};
const ilkel = (x: unknown): boolean => x === null || x === undefined || typeof x !== 'object';
const deger = (x: unknown): string => (x === undefined || x === null ? 'boş' : x === true ? 'evet' : x === false ? 'hayır' : typeof x === 'string' ? x : JSON.stringify(x));

export function farkMetni(f: { yol: string; eski: unknown; yeni: unknown }): string {
  const parca = f.yol.replace(/\[([^\]]*)\]/g, '.[$1]').split('.').filter((x) => x !== '');
  const [kok = '', ...kalan] = parca;
  const alan = (ALAN_ADLARI as Readonly<Record<string, string>>)[kok] ?? 'Planlama verisi';
  const kayit = kalan[0] !== undefined && kalan[0] !== 'length' ? kalan[0] : null;
  const kayitAdi = kayit === null ? null : /^\[\d+\]$/.test(kayit) ? `${String(Number(kayit.slice(1, -1)) + 1)}. kayıt` : kayit.replace(/^\[|\]$/g, '');
  const yaprak = parca[parca.length - 1] ?? '';
  const bas = kayitAdi === null ? alan : `${alan}, ${kayitAdi}`;
  if (yaprak === 'length') return `${bas}: kayıt sayısı ${deger(f.eski)} → ${deger(f.yeni)}`;
  if (f.eski == null && !ilkel(f.yeni)) return `${bas}: eklendi`;
  if (f.yeni == null && !ilkel(f.eski)) return `${bas}: çıkarıldı`;
  if (!ilkel(f.eski) || !ilkel(f.yeni)) return `${bas}: değişti`;
  const altAd = kalan.length >= 2 ? ALT_ALAN_ADLARI[yaprak] : kalan.length === 1 ? '' : undefined;
  if (altAd === undefined) return kok in ALAN_ADLARI && kalan.length === 0 ? `${bas}: ${deger(f.eski)} → ${deger(f.yeni)}` : `${bas}: değişti`;
  return `${bas}${altAd ? ` ${altAd}` : ''}: ${deger(f.eski)} → ${deger(f.yeni)}`;
}

export function kaynakSatiri(kd: KaynakDegisikligi, t: number, dataVer: number): BekleyenDegisiklik {
  const adlar = kd.alanlar.map((a) => ALAN_ADLARI[a]);
  const ne = adlar.length > 0 ? `Başka sayfada değişti: ${adlar.join(', ')}` : 'Başka sayfada değişti';
  const ilk = kd.farklar.slice(0, AYRINTI_FARK);
  const farklar = [...new Set(ilk.map(farkMetni))];
  const kalan = kd.farklar.length - ilk.length;
  const ek = kalan > 0 || kd.kesik ? [`ve ${kd.kesik ? 'daha çok' : String(kalan)} fark`] : [];
  const ayrinti = farklar.length > 0 ? [...farklar, ...ek].join('; ') : 'Ayrıntısı birleşmede bulunamadı.';
  // Kişi birleşmede bilinmez; değişiklik defterinden 1975 ile gelir. Uydurulmaz.
  // 3233 a: yalnız yeni emir eklendiyse yalnız o dizilir; kimlikleri sunucu verir (yol metnindeki sayı dizin de olabilir, ondan okunmaz).
  const isler = kd.eklenenSiparisler != null && kd.eklenenSiparisler.length > 0 ? [...kd.eklenenSiparisler] : ['*'];
  return { id: `${DIS_ONEK}${String(dataVer)}`, ne, ayrinti, kim: '', t, isler, geri: null, dis: true };
}

export interface SeritOzeti { toplam: number; dis: number }

export function seritOzeti(liste: readonly BekleyenDegisiklik[]): SeritOzeti {
  return { toplam: liste.length, dis: liste.filter((b) => b.dis === true).length };
}

export function seritMetni(o: SeritOzeti): string {
  if (o.toplam === 0) return 'Plan çözüldüğünden bu yana değişiklik yok';
  const dis = o.dis > 0 ? `, ${String(o.dis)} tanesi başka sayfadan` : '';
  return `Plan çözüldüğünden bu yana ${String(o.toplam)} değişiklik${dis}; plan güncel değil`;
}

// Şeridin listesi: kayıtlı bekleyenler ve henüz yazılmamış başka sayfa satırı (salt okunur kişide hiç yazılmaz). Kayıtlı bekleyen yokken
// yalnız başka sayfa satırı gösterilir: planı bayatlatan bu birleşmedir (VARSAYIM: birleşmeden önce plan güncel ya da izi tutulmuş).
export function seritListesi(c: PlanlamaCalismasi, dis: BekleyenDegisiklik | null): BekleyenDegisiklik[] {
  const kayitli = bekleyenler(c);
  if (dis === null || kayitli.some((b) => b.id === dis.id)) return bekleyenListesi(c);
  return [...kayitli, dis];
}

// 2319 (2311 S7): canlı plan bayat işareti (sunucu plan/bayat; GET /plan/surum ile gelir). Yalnız işarettir: plan kendiliğinden değişmez.
// Biçim sunucunun PlanBayatligi'nin şeridin okuduğu kısmıdır; sözleşme 2321'de gelene kadar burada yazılı.
export type CanliBayatNedeni = 'emir-bitti' | 'adim-bitti' | 'fason-donusu' | 'durus' | 'rota-degisti' | 'emir-iptal';
export interface CanliBayatlik {
  bayat: boolean;
  // Sözleşmenin neden listesi sunucuyla birlikte büyür; ekranın bilmediği ya da sunucunun henüz göndermediği neden sıfır sayılır.
  sayilar: Readonly<Partial<Record<CanliBayatNedeni, number>>>;
  olaylar: readonly { neden: CanliBayatNedeni; zaman: string; emirNo: string | null; makineKod: string | null }[];
}
const NEDEN_ADLARI: Readonly<Record<CanliBayatNedeni, string>> = { 'emir-bitti': 'emir erken bitti', 'adim-bitti': 'adım erken bitti', durus: 'makine duruşu', 'fason-donusu': 'fason dönüşü', 'rota-degisti': 'emir adımı değişti', 'emir-iptal': 'emir iptal edildi' };

export function canliBayatMetni(b: CanliBayatlik): string | null {
  if (!b.bayat) return null;
  const parcalar = (['emir-bitti', 'adim-bitti', 'durus', 'fason-donusu', 'rota-degisti', 'emir-iptal'] as const).filter((n) => (b.sayilar[n] ?? 0) > 0).map((n) => `${String(b.sayilar[n])} ${NEDEN_ADLARI[n]}`);
  return `Canlı plan son canlıya almadan sonra eskidi: ${parcalar.join(', ')}; planı gözden geçirin`;
}

export function canliBayatSatiri(o: CanliBayatlik['olaylar'][number]): string {
  const ne = o.emirNo ?? o.makineKod ?? '';
  return ne === '' ? NEDEN_ADLARI[o.neden] : `${NEDEN_ADLARI[o.neden]}: ${ne}`;
}
