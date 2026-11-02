import { z } from 'zod';
import { ORTAMLAR } from '../ortam.ts';
import { zamanSemasi } from '../zaman.ts';

export const saglikCevabi = z.object({
  durum: z.enum(['ok', 'hata']),
});

export const IS_SONUCLARI = ['tamam', 'hata', 'atlandi', 'bekliyor'] as const;

// Zamanlanmış işin son turu; sunucu yeniden açılınca açılıştan önceki son tur tablodan okunur. Hiç koşmamış işte alanlar null.
export const isDurumuSemasi = z.object({
  ad: z.string(),
  sonBaslama: zamanSemasi.nullable(),
  sonBitis: zamanSemasi.nullable(),
  sonSonuc: z.enum(IS_SONUCLARI).nullable(),
  sonHata: z.string().nullable(),
  // İş koşamayacağını bildirdiyse (ayar kapalı, bağlantı bilgisi yok) nedeni; yalnız son sonuç "bekliyor"ken dolu.
  sonNeden: z.string().nullable(),
});

// Disk boş yeri bayt olarak; `az` eşiği sunucu kuralıdır (5 GB ya da yüzde 10 altı).
export const diskDurumuSemasi = z.object({
  bosBayt: z.number().int().nonnegative(),
  toplamBayt: z.number().int().nonnegative(),
  az: z.boolean(),
});

export const UYARI_TURLERI = ['yedek', 'is', 'disk'] as const;

// Sunucunun hesapladığı uyarı: yedek alınmadı, iş asıldı ya da hata verdi, disk az. Eşikler sunucu kuralıdır.
export const uyariSemasi = z.object({
  tur: z.enum(UYARI_TURLERI),
  ileti: z.string(),
});

export const OTOMATIK_ACILIS_DURUMLARI = ['kurulu', 'kapali', 'kurulu-degil', 'bilinmiyor'] as const;

// Görev Zamanlayıcı'daki bekçi görevi. "kurulu-degil": görev yok ya da sunucu hesabı göremiyor (Windows ikisini aynı çıkış koduyla verir);
// "kapali": görev var ama kapalı ya da "Başlangıçta" tetikleyicisi yok; "bilinmiyor": sorgu süre aştı ya da çalışmadı.
export const otomatikAcilisSemasi = z.object({
  durum: z.enum(OTOMATIK_ACILIS_DURUMLARI),
  gorevAdi: z.string(),
});

export const ayrintiCevabi = z.object({
  // Veritabanının durumu yalnız `/saglik` cevabındadır; yoklama başarısızsa gecikme null.
  veritabaniGecikmeMs: z.number().int().nonnegative().nullable(),
  sonGoc: z.string().nullable(),
  commit: z.string().nullable(),
  // Güncelleyicinin kurduğu yayının adı (`2026.11.01-1`); elle kurulumda ya da güncelleme kanalı kapalıyken null. Ekran
  // okumadığı için isteğe bağlı.
  yayin: z.string().nullable().optional(),
  calismaSuresiSn: z.number().int().nonnegative(),
  ortam: z.enum(ORTAMLAR),
  isler: z.array(isDurumuSemasi),
  // Klasör bilinmiyor ya da okunamadıysa null. Ekran okumadığı için isteğe bağlı: sözleşmeyi kullanan eski istemci kırılmaz.
  yedekDiski: diskDurumuSemasi.nullable().optional(),
  veritabaniDiski: diskDurumuSemasi.nullable().optional(),
  uyarilar: z.array(uyariSemasi),
  // Süreç belleği (bayt), olay döngüsünün son ölçümden beri 99. yüzdelik gecikmesi ve veritabanındaki açık bağlantı sayısı.
  // Ölçülemeyen null; ekran okumadığı için isteğe bağlı.
  bellek: z.object({ rssBayt: z.number().int().nonnegative(), yiginBayt: z.number().int().nonnegative() }).optional(),
  olayDongusuGecikmeMs: z.number().nonnegative().nullable().optional(),
  vtBaglantiSayisi: z.number().int().nonnegative().nullable().optional(),
  // Windows dışında null.
  otomatikAcilis: otomatikAcilisSemasi.nullable().optional(),
});

const sayi = z.number().int().nonnegative();
// Ölçülemeyen ya da o dakikada örneği olmayan değer null'dır; sıfır uydurulmaz.
const sure = z.number().nonnegative().nullable();

// Bir dakikanın istek toplamı. Yüzdelikler süre kovasının üst sınırıdır (gerçek süre ondan kısa ya da eşit); en üst kovada null.
export const istekOzetiSemasi = z.object({
  sayi,
  saniyede: z.number().nonnegative(),
  p50Ms: sure,
  p95Ms: sure,
  p99Ms: sure,
  istemciHatasi: sayi,
  sunucuHatasi: sayi,
  // 503: havuz dolu ya da veritabanına ulaşılamıyor.
  mesgul: sayi,
});

export const ucOzetiSemasi = istekOzetiSemasi.extend({
  yontem: z.string(),
  // Eşleşen uç yoksa (404) null.
  yol: z.string().nullable(),
});

export const metrikDakikasiSemasi = z.object({
  // Ölçüm aralığının sonu.
  an: zamanSemasi,
  aralikSn: z.number().positive(),
  istek: istekOzetiSemasi,
  // En çok istek alan uçlar, en çoktan aza; liste kısaltılmıştır.
  uclar: z.array(ucOzetiSemasi),
  // Süreçte uygulama havuzu yoksa null. mesgul: bu aralıkta doluluk yüzünden reddedilen istek.
  havuz: z.object({ boyut: sayi, kullanimda: sayi, bekleyen: sayi, mesgul: sayi }).nullable(),
  // Sürecin ve makinenin işlemci kullanımı (yüzde, bütün çekirdekler 100).
  surecIslemciYuzde: sure,
  makineIslemciYuzde: sure,
  bellek: z.object({ rssBayt: sayi, yiginBayt: sayi, makineBosBayt: sayi, makineToplamBayt: sayi }),
  olayDongusuP99Ms: sure,
  // Okunamadıysa null. Sayaç alanları bu aralıktaki farktır; boyut ve xid yaşı o anki değerdir.
  veritabani: z.object({
    boyutBayt: sayi,
    // Wraparound'a uzaklık: PostgreSQL 2 milyara yaklaşınca yazmayı durdurur; okunamazsa null.
    xidYasi: z.number().int().nonnegative().nullable(),
    saniyedeIslem: z.number().nonnegative(),
    geriAlma: sayi,
    deadlock: sayi,
    // Okumaların bellekten karşılanan payı; okuma yoksa null.
    onbellekIsabetiYuzde: sure,
    geciciBayt: sayi,
    // Bu veritabanının istemci bağlantıları. Başka rolün bağlantısının durumu yetkisiz görünmez: "gorunmeyen".
    baglanti: z.object({ toplam: sayi, aktif: sayi, bosta: sayi, bosTx: sayi, kilitBekleyen: sayi, gorunmeyen: sayi }),
    // Görünen en uzun açık transaction (sn); yoksa null.
    enUzunTxSn: sure,
  }).nullable(),
});

export const metriklerCevabi = z.object({ dakikalar: z.array(metrikDakikasiSemasi) });

export type SaglikCevabi = z.output<typeof saglikCevabi>;
export type Ayrinti = z.output<typeof ayrintiCevabi>;
export type DiskDurumu = z.output<typeof diskDurumuSemasi>;
export type IsDurumuOzeti = z.output<typeof isDurumuSemasi>;
export type Uyari = z.output<typeof uyariSemasi>;
export type OtomatikAcilis = z.output<typeof otomatikAcilisSemasi>;
export type IstekOzeti = z.output<typeof istekOzetiSemasi>;
export type UcOzeti = z.output<typeof ucOzetiSemasi>;
export type MetrikDakikasi = z.output<typeof metrikDakikasiSemasi>;
export type MetriklerCevabi = z.output<typeof metriklerCevabi>;
