import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Satış siparişi (soru 144 a, karar 56): sipariş başlığı ve satırları ilişkisel tutulur; üretim emri ve sevk satırı sipariş satırına bağlanır.

export const SIPARIS_DURUMLARI = ['taslak', 'onayli', 'kapandi', 'iptal'] as const;
export const siparisDurumuSemasi = z.enum(SIPARIS_DURUMLARI);

export const SATIR_EN_COK = 200;

// Miktar ve para metin taşınır (numeric): kayan nokta yuvarlaması saklanmaz.
const MIKTAR = /^\d{1,11}(\.\d{1,3})?$/;
const FIYAT = /^\d{1,13}(\.\d{1,4})?$/;
const ORAN = /^\d{1,3}(\.\d{1,2})?$/;
export const miktarSemasi = z.string().trim().regex(MIKTAR, 'Miktar en çok üç ondalıklı bir sayı olmalı (örnek: 12.5).')
  .refine((v) => /[1-9]/.test(v), 'Miktar sıfırdan büyük olmalı.');
export const birimFiyatSemasi = z.string().trim().regex(FIYAT, 'Birim fiyat en çok dört ondalıklı bir sayı olmalı (örnek: 12.50).');
export const kdvOraniSemasi = z.string().trim().regex(ORAN, 'KDV oranı en çok iki ondalıklı bir sayı olmalı (örnek: 20).')
  .refine((v) => Number(v) <= 100, 'KDV oranı 0 ile 100 arasındadır.');
// Gecikme cezası günlük yüzde (üç ondalık), tavan tutarın yüzdesi; boş "bilinmiyor" demektir, plan taban bedel kullanır (177-179 a).
const CEZA = /^\d{1,3}(\.\d{1,3})?$/;
export const cezaOraniSemasi = z.string().trim().regex(CEZA, 'Ceza oranı en çok üç ondalıklı bir yüzde olmalı (örnek: 0.5).')
  .refine((v) => Number(v) <= 100, 'Ceza oranı 0 ile 100 arasındadır.');
export const cezaTavaniSemasi = z.string().trim().regex(ORAN, 'Ceza tavanı en çok iki ondalıklı bir yüzde olmalı (örnek: 10).')
  .refine((v) => Number(v) <= 100, 'Ceza tavanı 0 ile 100 arasındadır.');
// 205 a: plan finansman bedeli için; boşsa plan sabit oranı kullanır.
export const odemeVadesiSemasi = z.number().int('Ödeme vadesi tam gün olmalı.').min(0, 'Ödeme vadesi 0 ile 365 gün arasındadır.').max(365, 'Ödeme vadesi 0 ile 365 gün arasındadır.');
export const paraBirimiSemasi = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Para birimi üç harfli koddur (TRY gibi).');

// Boş ya da yalnız boşluk "yok" demektir; boş dizgi saklanmaz.
const istege = (azami: number) =>
  z.string().max(azami, `En çok ${azami} karakter.`).nullish().transform((m) => {
    const kirpik = m?.trim();
    return kirpik ? kirpik : null;
  });

export const siparisSatiriGovdesi = z.object({
  malzemeNo: z.number().int().positive(),
  miktar: miktarSemasi,
  // 201 a: fiyatı yalnız `siparisler.fiyat-oku` olan girer; öteki yazar kalemi fiyatsız (null) gönderir.
  birimFiyat: birimFiyatSemasi.nullish().transform((f) => f ?? null),
  // Boşsa siparişin termini geçerlidir.
  termin: tarihSemasi.nullish().transform((t) => t ?? null),
  aciklama: istege(500),
});

const siparisAlanlari = {
  firmaId: z.number().int().positive(),
  musteriSiparisNo: istege(40),
  siparisTarihi: tarihSemasi,
  termin: tarihSemasi,
  paraBirimi: paraBirimiSemasi.default('TRY'),
  kdvOrani: kdvOraniSemasi,
  odemeKosulu: istege(200),
  aciklama: istege(1000),
  cezaOraniGun: cezaOraniSemasi.nullish().transform((v) => v ?? null),
  cezaTavaniOrani: cezaTavaniSemasi.nullish().transform((v) => v ?? null),
  odemeVadesiGun: odemeVadesiSemasi.nullish().transform((v) => v ?? null),
  satirlar: z.array(siparisSatiriGovdesi).min(1, 'Siparişte en az bir satır olmalı.').max(SATIR_EN_COK, `Siparişte en çok ${SATIR_EN_COK} satır olabilir.`),
};

// SIP-07: termin sipariş tarihinden önce olamaz (başlık ve satır; veritabanında başlık kısıtı da var).
type Tarihli = { siparisTarihi: string; termin: string; satirlar: { termin: string | null }[] };
const tarihSirasi = (g: Tarihli) => g.termin >= g.siparisTarihi && g.satirlar.every((s) => s.termin === null || s.termin >= g.siparisTarihi);
const TARIH_SIRASI = { message: 'Termin sipariş tarihinden önce olamaz.', path: ['termin'] };

export const idParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });

export const siparisEkleGovdesi = z.object(siparisAlanlari).refine(tarihSirasi, TARIH_SIRASI);
// Güncelleme tam kayıttır: satırlar bütün olarak yeniden yazılır (SIP-03: yalnız taslak).
export const siparisGuncelleGovdesi = z.object({ ...siparisAlanlari, ...beklenenSurum }).refine(tarihSirasi, TARIH_SIRASI);
export const durumGovdesi = z.object({ ...beklenenSurum });
export const iptalGovdesi = z.object({
  ...beklenenSurum,
  neden: z.string().trim().min(1, 'İptal nedeni zorunlu.').max(500, 'En çok 500 karakter.'),
});

export const siparisListesiSorgusu = z.object({
  ...listeSorguAlanlari(['no', 'siparisTarihi', 'termin']),
  ara: z.string().trim().max(80).optional(),
  durum: siparisDurumuSemasi.optional(),
  firmaId: z.coerce.number().int().positive().max(2147483647).optional(),
});

export const siparisSatiriSemasi = z.object({
  id: z.number().int(),
  sira: z.number().int(),
  malzemeNo: z.number().int(),
  // Kod, ad ve birim malzemeden okunur; bulunamazsa null (uydurulmaz).
  malzemeKodu: z.string().nullable(),
  malzemeAdi: z.string().nullable(),
  birim: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  // Fiyatsız kalemde (201 a) ya da fiyatı görmeyene (180) null.
  birimFiyat: ondalikMetinSemasi.nullable(),
  tutar: ondalikMetinSemasi.nullable(),
  termin: tarihSemasi.nullable(),
  aciklama: z.string().nullable(),
});

export const siparisSemasi = z.object({
  id: z.number().int(),
  no: z.string(),
  durum: siparisDurumuSemasi,
  firmaId: z.number().int(),
  // Firma adı müşteri-tedarikçiden okunur; bulunamazsa null.
  firmaAd: z.string().nullable(),
  musteriSiparisNo: z.string().nullable(),
  siparisTarihi: tarihSemasi,
  termin: tarihSemasi,
  paraBirimi: z.string(),
  kdvOrani: ondalikMetinSemasi,
  odemeKosulu: z.string().nullable(),
  aciklama: z.string().nullable(),
  // KDV hariç toplam, KDV ve genel toplam; satır tutarları iki ondalığa yuvarlanarak toplanır. Fiyatsız kalem varsa ya da fiyatı
  // görmeyene null.
  araToplam: ondalikMetinSemasi.nullable(),
  kdvTutari: ondalikMetinSemasi.nullable(),
  genelToplam: ondalikMetinSemasi.nullable(),
  cezaOraniGun: ondalikMetinSemasi.nullable(),
  cezaTavaniOrani: ondalikMetinSemasi.nullable(),
  odemeVadesiGun: z.number().int().nullable(),
  iptalNedeni: z.string().nullable(),
  olusturma: zamanSemasi,
  guncelleme: zamanSemasi.nullable(),
  onayZamani: zamanSemasi.nullable(),
  surum: surumSemasi,
});

export const siparisAyrintiSemasi = siparisSemasi.extend({ satirlar: z.array(siparisSatiriSemasi) });

export const siparisListesiCevabi = listeCevapSemasi(siparisSemasi);

export type SiparisDurumu = z.output<typeof siparisDurumuSemasi>;
export type SiparisEkleGovdesi = z.input<typeof siparisEkleGovdesi>;
export type SiparisEkleVerisi = z.output<typeof siparisEkleGovdesi>;
export type SiparisGuncelleGovdesi = z.input<typeof siparisGuncelleGovdesi>;
export type SiparisGuncelleVerisi = z.output<typeof siparisGuncelleGovdesi>;
export type SiparisSatiriVerisi = z.output<typeof siparisSatiriGovdesi>;
export type SiparisListesiSorgusu = z.input<typeof siparisListesiSorgusu>;
export type SiparisListesiSuzgeci = z.output<typeof siparisListesiSorgusu>;
export type Siparis = z.output<typeof siparisSemasi>;
export type SiparisSatiri = z.output<typeof siparisSatiriSemasi>;
export type SiparisAyrintisi = z.output<typeof siparisAyrintiSemasi>;
export type SiparisListesiCevabi = z.output<typeof siparisListesiCevabi>;

// ---- Satış teklifi (soru 148): talep satırları, fiyatlı sürümler, kabul edilen sürümden sipariş ----

// 291 a: iskontosu eşiği aşan sürüm müdür onaylayana dek 'onay-bekliyor'da kalır, müşteriye gitmez.
export const TEKLIF_DURUMLARI = ['yeni', 'onay-bekliyor', 'verildi', 'revizyon', 'kabul', 'red', 'siparis'] as const;
// Yüzde; bu oranın üstündeki iskonto `siparisler.iskonto-onayla` ister (eşitlik onaysız geçer).
export const ISKONTO_ONAY_ESIGI = 10;
export const teklifDurumuSemasi = z.enum(TEKLIF_DURUMLARI);

const ISKONTO = /^\d{1,2}(\.\d{1,2})?$/;
export const iskontoSemasi = z.string().trim().regex(ISKONTO, 'İskonto 0 ile 99.99 arasında, en çok iki ondalıklı olmalı.');

export const teklifSatiriGovdesi = z.object({
  // Kartı henüz açılmamış parça tanımla girilir; siparişe dönüşmeden kart bağlanır (TKL-06).
  malzemeNo: z.number().int().positive().nullish().transform((m) => m ?? null),
  tanim: z.string().trim().min(1, 'Satır tanımı zorunlu.').max(200, 'En çok 200 karakter.'),
  miktar: miktarSemasi,
});

const teklifAlanlari = {
  firmaId: z.number().int().positive(),
  baslik: z.string().trim().min(1, 'Başlık zorunlu.').max(200, 'En çok 200 karakter.'),
  paraBirimi: paraBirimiSemasi.default('TRY'),
  istenenTarih: tarihSemasi.nullish().transform((t) => t ?? null),
  aciklama: istege(1000),
  satirlar: z.array(teklifSatiriGovdesi).min(1, 'Teklifte en az bir satır olmalı.').max(SATIR_EN_COK, `Teklifte en çok ${SATIR_EN_COK} satır olabilir.`),
};

export const teklifEkleGovdesi = z.object(teklifAlanlari);
// Talep yalnız ilk sürüm verilmeden düzenlenir (TKL-03); satırlar bütün olarak yeniden yazılır.
export const teklifGuncelleGovdesi = z.object({ ...teklifAlanlari, ...beklenenSurum });

// Kâr maliyet üstü yüzdedir (44): fiyat = birim maliyet x (1 + kâr / 100).
export const karOraniSemasi = z.string().trim().regex(ORAN, 'Kâr oranı en çok iki ondalıklı bir yüzde olmalı (örnek: 25).');
// 49, 48 b: verilen sürüm planda satış taslağı olarak yer tutar. İstenen termin boşsa teklif planın arkasına eklenir.
export const planTaslagiGovdesi = z.object({
  karOrani: karOraniSemasi,
  istenenTermin: tarihSemasi.nullish().transform((t) => t ?? null),
});
export const PLAN_TASLAGI_GECERLILIK = 'Satış taslağı geçerlilik tarihine kadar yer tutar; geçerlilik tarihi zorunlu.';
export const PLAN_TASLAGI_TERMINI = 'Plan taslağıyla verilen sürümün termini denemeden gelir; termin elle girilmez.';

export const teklifSurumuGovdesi = z.object({
  ...beklenenSurum,
  // Talep satırlarının her biri için birim fiyat, satır sırasıyla (TKL-04).
  fiyatlar: z.array(z.object({ satirId: z.number().int().positive(), birimFiyat: birimFiyatSemasi })).min(1).max(SATIR_EN_COK),
  iskontoOrani: iskontoSemasi.default('0'),
  teslimGun: z.number().int().min(1).max(365).nullish().transform((t) => t ?? null),
  odemeKosulu: istege(200),
  gecerlilik: tarihSemasi.nullish().transform((t) => t ?? null),
  aciklama: istege(1000),
});
export const teklifNotGovdesi = z.object({
  ...beklenenSurum,
  not: z.string().trim().min(1, 'Not zorunlu.').max(500, 'En çok 500 karakter.'),
});
export const teklifKabulGovdesi = z.object({ ...beklenenSurum, surumNo: z.number().int().min(1).max(99) });
export const iskontoOnayGovdesi = z.object(beklenenSurum);
export const kartBaglaGovdesi = z.object({ ...beklenenSurum, malzemeNo: z.number().int().positive() });
export const siparisDonusumGovdesi = z.object({
  ...beklenenSurum,
  musteriSiparisNo: istege(40),
  siparisTarihi: tarihSemasi,
  termin: tarihSemasi,
  kdvOrani: kdvOraniSemasi,
  cezaOraniGun: cezaOraniSemasi.nullish().transform((v) => v ?? null),
  cezaTavaniOrani: cezaTavaniSemasi.nullish().transform((v) => v ?? null),
  odemeVadesiGun: odemeVadesiSemasi.nullish().transform((v) => v ?? null),
}).refine((g) => g.termin >= g.siparisTarihi, TARIH_SIRASI);

export const teklifSatirParametresi = z.object({
  id: z.coerce.number().int().positive().max(2147483647),
  satirId: z.coerce.number().int().positive().max(2147483647),
});

export const teklifListesiSorgusu = z.object({
  ...listeSorguAlanlari(['no', 'olusturma']),
  ara: z.string().trim().max(80).optional(),
  durum: teklifDurumuSemasi.optional(),
  firmaId: z.coerce.number().int().positive().max(2147483647).optional(),
});

export const teklifSatiriSemasi = z.object({
  id: z.number().int(),
  sira: z.number().int(),
  malzemeNo: z.number().int().nullable(),
  malzemeKodu: z.string().nullable(),
  tanim: z.string(),
  birim: z.string().nullable(),
  miktar: ondalikMetinSemasi,
});

export const teklifSurumuSemasi = z.object({
  surumNo: z.number().int(),
  iskontoOrani: ondalikMetinSemasi,
  teslimGun: z.number().int().nullable(),
  odemeKosulu: z.string().nullable(),
  gecerlilik: tarihSemasi.nullable(),
  aciklama: z.string().nullable(),
  olusturma: zamanSemasi,
  // İskontolu birim fiyat sipariş satırına giden fiyattır (dört ondalık); tutar iki ondalık.
  fiyatlar: z.array(z.object({ satirId: z.number().int(), birimFiyat: ondalikMetinSemasi, iskontoluFiyat: ondalikMetinSemasi, tutar: ondalikMetinSemasi })),
  toplam: ondalikMetinSemasi,
  // 291 a: eşiği aşan iskontoyu onaylayan ve anı; onay gerekmeyen ya da bekleyen sürümde null.
  iskontoOnaylayan: z.string().nullable(),
  iskontoOnayAni: zamanSemasi.nullable(),
});

export const teklifSemasi = z.object({
  id: z.number().int(),
  no: z.string(),
  durum: teklifDurumuSemasi,
  firmaId: z.number().int(),
  firmaAd: z.string().nullable(),
  baslik: z.string(),
  paraBirimi: z.string(),
  istenenTarih: tarihSemasi.nullable(),
  aciklama: z.string().nullable(),
  not: z.string().nullable(),
  kabulSurumu: z.number().int().nullable(),
  siparisId: z.number().int().nullable(),
  sonSurumNo: z.number().int().nullable(),
  olusturma: zamanSemasi,
  guncelleme: zamanSemasi.nullable(),
  surum: surumSemasi,
});

export const teklifAyrintiSemasi = teklifSemasi.extend({
  satirlar: z.array(teklifSatiriSemasi),
  surumler: z.array(teklifSurumuSemasi),
});
export const teklifListesiCevabi = listeCevapSemasi(teklifSemasi);

export type TeklifDurumu = z.output<typeof teklifDurumuSemasi>;
export type TeklifEkleGovdesi = z.input<typeof teklifEkleGovdesi>;
export type TeklifEkleVerisi = z.output<typeof teklifEkleGovdesi>;
export type TeklifGuncelleVerisi = z.output<typeof teklifGuncelleGovdesi>;
export type TeklifSurumuVerisi = z.output<typeof teklifSurumuGovdesi>;
export type SiparisDonusumVerisi = z.output<typeof siparisDonusumGovdesi>;
export type TeklifListesiSuzgeci = z.output<typeof teklifListesiSorgusu>;
export type Teklif = z.output<typeof teklifSemasi>;
export type TeklifAyrintisi = z.output<typeof teklifAyrintiSemasi>;
export type TeklifSatiri = z.output<typeof teklifSatiriSemasi>;
export type TeklifSurumu = z.output<typeof teklifSurumuSemasi>;
export type TeklifListesiCevabi = z.output<typeof teklifListesiCevabi>;
// 180: teklif fiyatı, iskontosu ve toplamı yalnız `siparisler.fiyat-oku` olana gider; olmayana uç null verir (teklif yine görünür).
// Modül içi ve disari teklif tipleri dolu kalır; null yalnız uç cevabındadır.
const fiyat = ondalikMetinSemasi.nullable();
export const teklifSurumuCevapSemasi = teklifSurumuSemasi.extend({
  iskontoOrani: fiyat,
  fiyatlar: z.array(z.object({ satirId: z.number().int(), birimFiyat: fiyat, iskontoluFiyat: fiyat, tutar: fiyat })),
  toplam: fiyat,
});
export const teklifAyrintiCevabi = teklifAyrintiSemasi.extend({ surumler: z.array(teklifSurumuCevapSemasi) });
export const siparisDonusumCevabi = z.object({ teklif: teklifAyrintiCevabi, siparisId: z.number().int() });
export type SiparisDonusumCevabi = z.output<typeof siparisDonusumCevabi>;
export type TeklifSurumuCevabi = z.output<typeof teklifSurumuCevapSemasi>;
export type TeklifAyrintiCevabi = z.output<typeof teklifAyrintiCevabi>;

// Satılabilir kart seçimi: yalnız aktif mamul, yarı mamul ve ticari mal (SIP-02); arama stok kodu ve adda.
export const malzemeSecenekSorgusu = z.object({
  ara: z.string().trim().max(60).optional().transform((m) => (m ? m : null)),
  sayfa: z.coerce.number().int().min(1).max(10_000).default(1),
});
export const malzemeSecenegiSemasi = z.object({
  no: z.number().int(),
  kod: z.string(),
  ad: z.string().nullable(),
  tur: z.string(),
  birim: z.string().nullable(),
});
export const malzemeSecenekleriCevabi = z.object({
  satirlar: z.array(malzemeSecenegiSemasi), toplam: z.number().int().nullable(), sayfa: z.number().int(), sayfaBoyu: z.number().int(),
});
export type MalzemeSecenegi = z.output<typeof malzemeSecenegiSemasi>;
export type MalzemeSecenekleriCevabi = z.output<typeof malzemeSecenekleriCevabi>;

// ---- Teklif termin ve fiyat denemesi (44) ----
// Teklifin kartlı kalemleri planlama tezgâhının ortak motoruyla mevcut planın arkasına birlikte denenir (64 a); termin ve maliyet
// aynı yerleşimden çıkar. Kartsız kalem denenmez, fiyatı ve termini elle girilir (62 a). Motor yoksa cevap "cozucu-yok" der.
export const terminDenemesiSorgusu = z.object({
  gecerlilik: tarihSemasi.optional().transform((t) => t ?? null),
  istenenTermin: tarihSemasi.optional().transform((t) => t ?? null),
});
export const denemeTaslagiGovdesi = z.object({
  gecerlilik: tarihSemasi.nullish().transform((t) => t ?? null),
  istenenTermin: tarihSemasi.nullish().transform((t) => t ?? null),
  karOrani: karOraniSemasi,
});
export const terminOnayGovdesi = z.object(beklenenSurum);

const tutar = ondalikMetinSemasi.nullable();
export const MALIYET_KALEMI_TURLERI = ['malzeme', 'isleme', 'fason', 'genel-gider'] as const;
export const maliyetKalemiSemasi = z.object({
  tur: z.enum(MALIYET_KALEMI_TURLERI),
  ad: z.string(),
  tezgah: z.string().nullable(),
  saat: ondalikMetinSemasi.nullable(),
  tutar,
});
// 61 a: eksik hammadde kartındaki tedarik süresiyle farazi satın alınmış sayılır; ekranda "satın alma ister" görünür.
export const denemeSatinalmaSemasi = z.object({ kod: z.string(), miktar: ondalikMetinSemasi, birim: z.string().nullable(), gelis: zamanSemasi });
export const terminDenemesiKalemiSemasi = z.object({
  satirId: z.number().int(),
  sira: z.number().int(),
  tanim: z.string(),
  malzemeNo: z.number().int().nullable(),
  adet: ondalikMetinSemasi,
  plansiz: z.boolean(),
  yerlesti: z.boolean(),
  bitis: zamanSemasi.nullable(),
  planTermini: tarihSemasi.nullable(),
  malzemeGelisi: zamanSemasi.nullable(),
  satinalma: z.array(denemeSatinalmaSemasi),
  // Toplam fiyat görene, döküm maliyet okuyana gider; görmeyene null. Eksik ücret ya da fiyat varsa toplam null (sıfır uydurulmaz).
  birimMaliyet: tutar,
  toplamMaliyet: tutar,
  dokum: z.array(maliyetKalemiSemasi).nullable(),
  eksikVeri: z.array(z.string()),
});
export const kayanSiparisSemasi = z.object({
  siparis: z.string(),
  once: zamanSemasi,
  sonra: zamanSemasi,
  termin: tarihSemasi.nullable(),
  gecikir: z.boolean(),
});
export const terminDenemesiCevabi = z.object({
  durum: z.enum(['hazir', 'cozucu-yok']),
  planSurumu: z.string().nullable(),
  gecerlilik: tarihSemasi.nullable(),
  istenenTermin: tarihSemasi.nullable(),
  planTermini: tarihSemasi.nullable(),
  // İstenen termin varsa odur, yoksa plan termini; 59 a: geçerlilik tarihinden itibaren gün olarak da yazılır.
  termin: tarihSemasi.nullable(),
  terminGun: z.number().int().nullable(),
  yetisir: z.boolean().nullable(),
  // 63 b: istenen termin başka bir siparişi geciktiriyorsa satış taslağı plancı onayı bekler.
  onayGerekli: z.boolean(),
  satinalmaGerekli: z.boolean(),
  kalemler: z.array(terminDenemesiKalemiSemasi),
  maliyetToplami: tutar,
  genelGiderSaatBasi: tutar,
  kayanlar: z.array(kayanSiparisSemasi),
});

export const PLAN_TASLAGI_TURLERI = ['deneme', 'satis'] as const;
// Görünüm okuma anında çıkar: geçerliliği geçen satış taslağı plandan kalkmış "satış denemesi"dir (49); yerine yenisi gelen "kalktı".
export const PLAN_TASLAGI_GORUNUMLERI = ['deneme', 'satis', 'onay-bekliyor', 'satis-deneme', 'kalkti'] as const;
export const planTaslagiSemasi = z.object({
  id: z.number().int(),
  teklifId: z.number().int(),
  surumNo: z.number().int().nullable(),
  tur: z.enum(PLAN_TASLAGI_TURLERI),
  gorunum: z.enum(PLAN_TASLAGI_GORUNUMLERI),
  planSurumu: z.string().nullable(),
  gecerlilik: tarihSemasi.nullable(),
  istenenTermin: tarihSemasi.nullable(),
  planTermini: tarihSemasi.nullable(),
  termin: tarihSemasi.nullable(),
  karOrani: tutar,
  maliyetToplami: tutar,
  kayanSayisi: z.number().int(),
  gecikenSayisi: z.number().int(),
  onayGerekli: z.boolean(),
  onaylayan: z.string().nullable(),
  onayAni: zamanSemasi.nullable(),
  olusturan: z.string().nullable(),
  olusturma: zamanSemasi,
});
export const planTaslaklariCevabi = z.object({ taslaklar: z.array(planTaslagiSemasi) });

export type PlanTaslagiVerisi = z.output<typeof planTaslagiGovdesi>;
export type TerminDenemesiSuzgeci = z.output<typeof terminDenemesiSorgusu>;
export type DenemeTaslagiVerisi = z.output<typeof denemeTaslagiGovdesi>;
export type MaliyetKalemi = z.output<typeof maliyetKalemiSemasi>;
export type TerminDenemesiKalemi = z.output<typeof terminDenemesiKalemiSemasi>;
export type KayanSiparis = z.output<typeof kayanSiparisSemasi>;
export type TerminDenemesiCevabi = z.output<typeof terminDenemesiCevabi>;
export type PlanTaslagiTuru = (typeof PLAN_TASLAGI_TURLERI)[number];
export type PlanTaslagiGorunumu = (typeof PLAN_TASLAGI_GORUNUMLERI)[number];
export type PlanTaslagi = z.output<typeof planTaslagiSemasi>;
export type PlanTaslaklariCevabi = z.output<typeof planTaslaklariCevabi>;
