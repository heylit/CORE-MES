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

export const UYARI_TURLERI = ['yedek', 'is', 'disk', 'esik'] as const;

// Sunucunun hesapladığı uyarı: yedek alınmadı, iş asıldı ya da hata verdi, disk az, ölçü eşiği aşıldı (1663). Eşikler sunucu kuralıdır.
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

// Yedeğin ayrı veritabanına yüklenerek denenmesi (1670, 1743 a): `npm run geri-yukle-deneme` yedek klasörüne yazar, sunucu son kaydı okur.
export const GERI_YUKLEME_SONUCLARI = ['basarili', 'basarisiz'] as const;
export const geriYuklemeDenemesiSemasi = z.object({
  zaman: zamanSemasi,
  // Denenen yedek dosyasının adı (klasörsüz).
  yedek: z.string(),
  sonuc: z.enum(GERI_YUKLEME_SONUCLARI),
  sureSn: z.number().nonnegative(),
  // Yüklenen veritabanındaki kişi ve göç kaydı sayısı; başarısız denemede null.
  kisiSayisi: z.number().int().nonnegative().nullable(),
  gocSayisi: z.number().int().nonnegative().nullable(),
  hata: z.string().nullable(),
});

// Veritabanı büyümesi (1761): saklama kararı (1764 a) üç ay bu ölçüyle verilecek. Satır sayıları PostgreSQL istatistik
// tahminidir; ölü satır oranı canlı ve ölü toplamı sıfırsa null. Hiç autovacuum ya da autoanalyze koşmamışsa zaman null.
export const tabloBuyukluguSemasi = z.object({
  ad: z.string(),
  toplamBayt: z.number().int().nonnegative(),
  dizinBayt: z.number().int().nonnegative(),
  canliSatir: z.number().int().nonnegative(),
  oluSatir: z.number().int().nonnegative(),
  oluOraniYuzde: z.number().nonnegative().nullable(),
  sonAutovacuum: zamanSemasi.nullable(),
  sonAutoanalyze: zamanSemasi.nullable(),
});

export const veritabaniBuyumesiSemasi = z.object({
  boyutBayt: z.number().int().nonnegative(),
  // Wraparound'a uzaklık (2 milyara yaklaşınca PostgreSQL yazmayı durdurur); okunamazsa null.
  xidYasi: z.number().int().nonnegative().nullable(),
  // Görünen en uzun açık transaction (sn): uzun açık transaction autovacuum'un ölü satırı temizlemesini engeller; yoksa null.
  enUzunTxSn: z.number().nonnegative().nullable(),
  // En büyükten küçüğe, en çok 10 tablo (dizin ve TOAST dahil boyut).
  tablolar: z.array(tabloBuyukluguSemasi),
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
  // Son geri yükleme denemesi; hiç yapılmamışsa ya da yedek klasörü okunamazsa null. Eski istemci kırılmasın diye isteğe bağlı.
  geriYuklemeDenemesi: geriYuklemeDenemesiSemasi.nullable().optional(),
  // Veritabanı okunamadıysa null. Eski istemci kırılmasın diye isteğe bağlı.
  veritabaniBuyumesi: veritabaniBuyumesiSemasi.nullable().optional(),
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

// Saatlik özet (1662): dakikalardan çıkar; yüzdelikler birleştirilemediği için saatin en kötü dakikası yazılır.
const ortVeEnCok = z.object({ ort: z.number().nonnegative(), enCok: z.number().nonnegative() }).nullable();
export const saatOzetiSemasi = z.object({
  saat: zamanSemasi,
  // Saatte ölçülen dakika; sunucu kapalıyken eksilir.
  dakikaSayisi: sayi,
  istek: z.object({
    sayi, saniyede: sure, p95MsEnCok: sure, p99MsEnCok: sure, istemciHatasi: sayi, sunucuHatasi: sayi, mesgul: sayi,
  }),
  havuz: z.object({ kullanimdaEnCok: sayi, bekleyenEnCok: sayi, mesgul: sayi }).nullable(),
  surecIslemciYuzde: ortVeEnCok,
  makineIslemciYuzde: ortVeEnCok,
  bellek: z.object({ rssBaytEnCok: sayi, makineBosBaytEnAz: sayi }),
  olayDongusuP99MsEnCok: sure,
  veritabani: z.object({
    boyutBayt: sayi, xidYasi: z.number().int().nonnegative().nullable(), saniyedeIslem: z.number().nonnegative(), geriAlma: sayi, deadlock: sayi,
    onbellekIsabetiYuzdeEnAz: sure, geciciBayt: sayi, baglantiEnCok: sayi, kilitBekleyenEnCok: sayi, enUzunTxSnEnCok: sure,
  }).nullable(),
});

// Sistem durumu grafiklerinin aralıkları: 24 saat, 7 gün, 13 ay (saatlik özetin saklama süresi, 1619 a).
export const SAATLIK_ARALIKLAR = ['gun', 'hafta', 'yil'] as const;
export const saatlikSorgusu = z.object({ aralik: z.enum(SAATLIK_ARALIKLAR) });
export const saatlikCevabi = z.object({ saatler: z.array(saatOzetiSemasi) });

export type SaglikCevabi = z.output<typeof saglikCevabi>;
export type Ayrinti = z.output<typeof ayrintiCevabi>;
export type DiskDurumu = z.output<typeof diskDurumuSemasi>;
export type IsDurumuOzeti = z.output<typeof isDurumuSemasi>;
export type Uyari = z.output<typeof uyariSemasi>;
export type OtomatikAcilis = z.output<typeof otomatikAcilisSemasi>;
export type IstekOzeti = z.output<typeof istekOzetiSemasi>;
export type UcOzeti = z.output<typeof ucOzetiSemasi>;
export type SaatOzeti = z.output<typeof saatOzetiSemasi>;
export type TabloBuyuklugu = z.output<typeof tabloBuyukluguSemasi>;
export type VeritabaniBuyumesi = z.output<typeof veritabaniBuyumesiSemasi>;
export type GeriYuklemeDenemesi = z.output<typeof geriYuklemeDenemesiSemasi>;
export type SaatlikAralik = (typeof SAATLIK_ARALIKLAR)[number];
export type SaatlikCevabi = z.output<typeof saatlikCevabi>;
export type MetrikDakikasi = z.output<typeof metrikDakikasiSemasi>;
export type MetriklerCevabi = z.output<typeof metriklerCevabi>;
