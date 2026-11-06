import { z } from 'zod';

// 2151 (2151-1 b, 2151-2 a, 2151-3 b): Satın alma analizi. Tedarikçi başarımı firma karnesinden (musteri-tedarikci) okunur; satın alma
// yalnız kendi sipariş satırlarından tedarik süresini, harcamayı ve fiyat değişimini, stok hareketlerinden tüketim tahminini çıkarır.
// Bilinmeyen değer null'dır; eşiğin altında tahmin ve istatistik verilmez, örnek sayısı verilir ("yetersiz veri").
export const SATIN_ALMA_ANALIZI_HARCAMA_AY = 12;
export const SATIN_ALMA_ANALIZI_GECMIS_AY = 24;
// Tedarik süresinin ortanca ve %80 değeri için en az tam teslim sayısı.
export const SATIN_ALMA_ANALIZI_SURE_EN_AZ = 5;
// Tüketim tahmini ve XYZ sınıfı için en az tam ay geçmişi.
export const SATIN_ALMA_ANALIZI_TAHMIN_EN_AZ_AY = 12;
// Güvenlik stoğu için malzemenin kendi tam teslim sayısı (tedarik süresi ortancası).
export const SATIN_ALMA_ANALIZI_GUVENLIK_EN_AZ = 3;

const KIMLIK = z.number().int().positive().max(2_147_483_647);
const SAYI = z.number().int().nonnegative();
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.');
const ay = z.string().regex(/^\d{4}-\d{2}$/, 'Ay YYYY-AA olmalı.');
const yuzde = z.number().min(0).max(100);

const tedarikci = z.object({
  firmaId: KIMLIK,
  ad: z.string(),
  // Son 24 ayda verilen sipariş satırı sayısı.
  siparisSatiri: SAYI,
  // Firma karnesi (kayan 12 ay): teslim oranı, kalite ve genel puan karnenin kendi eşikleriyle; yetersizse puan null.
  karne: z.object({
    teslimToplam: SAYI,
    zamanindaOran: yuzde.nullable(),
    kalitePuani: yuzde.nullable(),
    puan: yuzde.nullable(),
    sinif: z.string().nullable(),
    yetersizVeri: z.boolean(),
  }).nullable(),
  // Zamanında teslim oranının Bayes kestirimi (önsel Beta(1,1)): ortalama ve %90 olasılıkla altına düşmediği değer. Teslim yoksa null.
  zamanindaBayes: z.object({ ortalama: yuzde, alt90: yuzde }).nullable(),
  // Karnedeki satın alma teslim gecikmesi (gün; erken teslim 0 sayılır). Örnek yoksa null.
  gecikme: z.object({ teslim: SAYI, gecKalan: SAYI, ortalamaGun: z.number(), yuzde80Gun: z.number(), enCokGun: z.number() }).nullable(),
  // Sipariş gününden son teslimin gününe gerçek süre ve teklifteki termin; ornek eşiğin altındaysa ortanca ve %80 null.
  tedarikSuresi: z.object({
    ornek: SAYI,
    ortancaGun: z.number().nullable(),
    yuzde80Gun: z.number().nullable(),
    teklifOrtancaGun: z.number().nullable(),
  }),
});

const harcamaKalemi = z.object({
  anahtar: z.string(),
  ad: z.string(),
  tutarTl: z.number().nonnegative(),
  pay: yuzde,
  sinif: z.enum(['A', 'B', 'C']),
});

const fiyatNoktasi = z.object({ tarih, birimFiyat: z.number().nonnegative(), kur: z.number().positive() });

const tuketimMalzemesi = z.object({
  malzemeNo: KIMLIK,
  ad: z.string(),
  // Penceredeki tam ay geçmişi (ilk stok hareketinden bu yana).
  gecmisAy: SAYI,
  // Pencere ayları boyunca aylık net tüketim (stok biriminde); hareket öncesi aylar null.
  seri: z.array(z.number().nullable()),
  // Değişkenlik katsayısı ve XYZ sınıfı (X < 0,5 <= Y < 1 <= Z); geçmiş eşiğin altında ya da tüketim yoksa null.
  degiskenlik: z.number().nonnegative().nullable(),
  xyz: z.enum(['X', 'Y', 'Z']).nullable(),
  // TSB yöntemiyle gelecek ayın beklenen tüketimi; geçmiş eşiğin altındaysa null.
  tahminAylik: z.number().nonnegative().nullable(),
  // Malzemenin kendi tam teslimlerinden tedarik süresi ortancası; eşik altındaysa null.
  tedarikSuresiGun: z.number().nonnegative().nullable(),
  // %95 hizmet düzeyi için güvenlik stoğu (1,645 x aylık sapma x kök(tedarik süresi / 30)); tahmin ya da süre yoksa null.
  guvenlikStogu: z.number().nonnegative().nullable(),
});

export const satinAlmaAnaliziCevabi = z.object({
  hesaplanan: z.string(),
  tedarikciler: z.array(tedarikci),
  // Tedarik süresi ortancası için gereken tam teslim sayısı (ekran yetersiz veri metninde yazar).
  sureGereken: SAYI,
  // Firmaya bağlı olmayan (serbest adla girilmiş) teklifin sipariş satırı: karneye ve tedarikçi tablosuna girmez.
  firmasizSatir: SAYI,
  harcama: z.object({
    basTarih: tarih,
    bitTarih: tarih,
    // Kuru bilinen satırların toplamı; hiç satır yoksa null.
    toplamTl: z.number().nonnegative().nullable(),
    kalemSayisi: SAYI,
    siniflar: z.object({ A: SAYI, B: SAYI, C: SAYI }),
    // Tutarı en büyük kalemler.
    kalemler: z.array(harcamaKalemi),
    // Yabancı para biriminde kuru girilmemiş satır: tutar uydurulmaz, sayılır.
    kursuzSatir: SAYI,
  }),
  // Aynı malzemenin aynı para birimi ve birimdeki son iki siparişi: TL birim fiyat değişimi, fiyat etkisi ve kur etkisi (toplamları değişime eşittir).
  fiyatDegisimleri: z.array(z.object({
    katalogId: z.string().uuid(),
    ad: z.string(),
    paraBirimi: z.string(),
    birim: z.string(),
    onceki: fiyatNoktasi,
    son: fiyatNoktasi,
    degisimTl: z.number(),
    fiyatEtkisiTl: z.number(),
    kurEtkisiTl: z.number(),
    degisimYuzde: z.number().nullable(),
  })),
  tuketim: z.object({
    // Stok tüketim serisinin bağı (kablolama); yoksa malzeme listesi boştur.
    stokBagi: z.boolean(),
    aylar: z.array(ay),
    gereken: SAYI,
    malzemeler: z.array(tuketimMalzemesi),
  }),
});

export type SatinAlmaAnaliziCevabi = z.output<typeof satinAlmaAnaliziCevabi>;
export type SatinAlmaTedarikcisi = z.output<typeof tedarikci>;
export type SatinAlmaTuketimMalzemesi = z.output<typeof tuketimMalzemesi>;
