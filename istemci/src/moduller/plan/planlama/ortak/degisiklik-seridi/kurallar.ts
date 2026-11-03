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

const deger = (x: unknown): string => (x === undefined || x === null ? 'boş' : typeof x === 'string' ? x : JSON.stringify(x));

export function kaynakSatiri(kd: KaynakDegisikligi, t: number, dataVer: number): BekleyenDegisiklik {
  const adlar = kd.alanlar.map((a) => ALAN_ADLARI[a]);
  const ne = adlar.length > 0 ? `Başka sayfada değişti: ${adlar.join(', ')}` : 'Başka sayfada değişti';
  const farklar = kd.farklar.slice(0, AYRINTI_FARK).map((f) => `${f.yol}: ${deger(f.eski)} → ${deger(f.yeni)}`);
  const kalan = kd.farklar.length - farklar.length;
  const ek = kalan > 0 || kd.kesik ? [`ve ${kd.kesik ? 'daha çok' : String(kalan)} fark`] : [];
  const ayrinti = farklar.length > 0 ? [...farklar, ...ek].join('; ') : 'Ayrıntısı birleşmede bulunamadı.';
  // Kişi birleşmede bilinmez; değişiklik defterinden 1975 ile gelir. Uydurulmaz.
  return { id: `${DIS_ONEK}${String(dataVer)}`, ne, ayrinti, kim: '', t, isler: ['*'], geri: null, dis: true };
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
