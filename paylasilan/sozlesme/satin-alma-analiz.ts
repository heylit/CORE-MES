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

// 2471: Satın alma süreci ve fiyat ölçüleri. Dönem son 12 ay (harcama penceresi), kıyas önceki 12 ay.
export const SATIN_ALMA_ASAMALARI = ['teklif-istegi', 'teklif', 'karar', 'onay', 'siparis', 'ilk-teslim', 'tam-teslim'] as const;
export type SatinAlmaAsamasi = (typeof SATIN_ALMA_ASAMALARI)[number];
export const SATIN_ALMA_KIRILIMLARI = ['kategori', 'birim', 'alici'] as const;
// Hedef fiyat sapmasında listelenen en çok kalem.
export const SATIN_ALMA_SAPMA_ILK = 10;

const asamaOlcusu = z.object({
  // Önceki uçtan bu aşamanın ucuna geçen gün (tesis günü). Atlanan aşama sayılmaz.
  asama: z.enum(SATIN_ALMA_ASAMALARI),
  ornek: SAYI,
  ortancaGun: z.number().nonnegative().nullable(),
  yuzde80Gun: z.number().nonnegative().nullable(),
});
const sureOzeti = z.object({ ornek: SAYI, ortancaGun: z.number().nonnegative().nullable(), yuzde80Gun: z.number().nonnegative().nullable() });
const asamaOzeti = z.object({
  asamalar: z.array(asamaOlcusu),
  // Talebin açılışından tam teslime; aşamaların toplamı değildir.
  toplam: sureOzeti,
  // Ortancası en uzun aşama; eşiği geçen aşama yoksa null.
  darbogaz: z.enum(SATIN_ALMA_ASAMALARI).nullable(),
  // Ucu öncekinden önce kalan (eksi süre) aralık: veri hatası, sayılmaz.
  hataliAralik: SAYI,
});
// Son alışa göre fiyat farkında aynı döviz kalemin kur etkisi tutara girmez, ayrı verilir; kaçınılan maliyette null.
const tutarOlcusu = z.object({ tutarTl: z.number().nullable(), ornek: SAYI, kursuz: SAYI, kurEtkisiTl: z.number().nullable() });
const sapmaDonemi = z.object({
  // Hedefi hesaplanan satır; toplam sapma TL ((fiili - hedef) x miktar, sipariş günü kuruyla); bant dışı satır.
  satir: SAYI,
  toplamTl: z.number().nullable(),
  bantDisi: SAYI,
  // TL kalemde enflasyon endeksi olmadığından hedefi hesaplanamayan satır.
  endeksYok: SAYI,
});
const kuralDisiDonemi = z.object({
  azTeklif: z.object({ siparis: SAYI, tutarTl: z.number().nonnegative() }),
  talepOncesi: z.object({ siparis: SAYI, tutarTl: z.number().nonnegative() }),
  // İki durumdan en az birine giren siparişlerin tutarının dönem harcamasına payı; harcama yoksa null.
  payYuzde: yuzde.nullable(),
});
const donem = <T extends z.ZodType>(t: T) => z.object({ simdi: t, onceki: t });

// 2477 (2467 a): Raporlar'dan Analiz'e taşınan dağılımlar. Raporlar ayrı hesap yapmaz, bunları okur.
// Tedarik riskinde listelenen en çok tek kaynak kalemi.
export const SATIN_ALMA_TEK_KAYNAK_ILK = 15;
const dagilimKalemi = z.object({ anahtar: z.string(), ad: z.string(), tutarTl: z.number().nonnegative(), pay: yuzde });
const harcamaDagilimi = z.object({
  // Bu ay dahil son 12 takvim ayı; ilk siparişten önceki ay null (veri yok), siparişsiz ay 0. Bu ay sürüyor.
  aylar: z.array(z.object({ ay, tutarTl: z.number().nonnegative().nullable() })),
  // Harcama penceresinde (donem.bas - donem.bit) kuru bilinen satırlar; kategorisiz kalem boş anahtarla.
  kategoriler: z.array(dagilimKalemi),
  // Firmaya bağlı teklif firma kimliğiyle (f:<id>), firmasız teklif adıyla (ad:<ad>).
  tedarikciler: z.array(dagilimKalemi),
  // En büyük bir ve üç tedarikçinin harcama payı; harcama yoksa null.
  ilkBirPay: yuzde.nullable(),
  ilkUcPay: yuzde.nullable(),
});
const tedarikRiski = z.object({
  // Dönemde siparişe dönen taleplerin teklif sayısı: talep, ortanca ve ayardaki en az teklifin altında kalan talep.
  teklif: z.object({ talep: SAYI, ortanca: z.number().nonnegative().nullable(), hedefAlti: SAYI }),
  // Dönemde alınan ve aldığı her talepte fiyatı tek tedarikçiden gelen kalem (katalog, katalogsuzsa ad).
  tekKaynak: z.object({
    kalemSayisi: SAYI,
    kalemler: z.array(z.object({ anahtar: z.string(), ad: z.string(), tedarikci: z.string(), siparisSatiri: SAYI, tutarTl: z.number().nonnegative().nullable() })),
  }),
});

// 2477: GET /satin-alma-analiz/siparis-satirlari. Analiz döneminin sipariş satırları; sütunlar eski CSV dökümüyle aynı. TL tutar KDV ve
// masraf hariç, iskonto dahil, sipariş günü kuruyla; kuru girilmemiş döviz satırında null.
export const satinAlmaSiparisDokumu = z.object({
  basTarih: tarih,
  bitTarih: tarih,
  satirlar: z.array(z.object({
    siparisTarihi: tarih, talepNo: z.string(), birim: z.string().nullable(), kategori: z.string(), malzeme: z.string(), tedarikci: z.string(),
    paraBirimi: z.string(), tutarTl: z.number().nullable(),
  })),
});
export type SatinAlmaSiparisDokumu = z.output<typeof satinAlmaSiparisDokumu>;

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
    katalogId: z.guid(),
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
  // 2471 ölçüleri.
  donem: z.object({ bas: tarih, bit: tarih, oncekiBas: tarih, oncekiBit: tarih }),
  oncekiHarcamaTl: z.number().nonnegative().nullable(),
  asamaGereken: SAYI,
  asamaSureleri: z.object({
    tumu: asamaOzeti,
    oncekiToplam: sureOzeti,
    kirilimlar: z.array(z.object({ tur: z.enum(SATIN_ALMA_KIRILIMLARI), anahtar: z.string(), ad: z.string(), ozet: asamaOzeti })),
  }),
  // 2468 a: son alışa göre fiyat farkı (eksi = gerçek azalma; döviz kalemde kur hariç) ve en düşük öteki teklife göre kaçınılan maliyet
  // (artı = kazanç; nakliye ve vade hariç).
  tasarruf: z.object({ fiyatFarki: donem(tutarOlcusu), kacinilan: donem(tutarOlcusu) }),
  fiyatSapmasi: z.object({
    esikYuzde: z.number().nonnegative(),
    donem: donem(sapmaDonemi),
    // Dönemde mutlak sapması en büyük satırlar.
    kalemler: z.array(z.object({
      katalogId: z.guid(), ad: z.string(), siparisTarihi: tarih, paraBirimi: z.string(), birim: z.string(),
      hedef: z.number().nonnegative(), fiili: z.number().nonnegative(), farkYuzde: z.number().nullable(),
      sapmaTl: z.number(), kurEtkisiTl: z.number(), bant: z.enum(['icinde', 'ustunde', 'altinda']),
    })),
  }),
  kuralDisi: z.object({ enAzTeklif: SAYI, donem: donem(kuralDisiDonemi) }),
  harcamaDagilimi,
  tedarikRiski,
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
export type SatinAlmaAsamaOzeti = z.output<typeof asamaOzeti>;
export type SatinAlmaTutarOlcusu = z.output<typeof tutarOlcusu>;
export type SatinAlmaSapmaDonemi = z.output<typeof sapmaDonemi>;
export type SatinAlmaKuralDisiDonemi = z.output<typeof kuralDisiDonemi>;
export type SatinAlmaHarcamaDagilimi = z.output<typeof harcamaDagilimi>;
export type SatinAlmaTedarikRiski = z.output<typeof tedarikRiski>;
