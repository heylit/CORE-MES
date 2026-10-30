import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

export const FIRMA_TURLERI = ['musteri', 'tedarikci', 'ikisi'] as const;
export const LOGO_GONDERIM_DURUMLARI = ['bekliyor', 'gonderildi', 'hata'] as const;
export const FIRMA_ARAMA_SINIRI = 50;
// Firmanın kartındaki adres merkez adresidir; bu türler kartın yanında tutulan öteki adreslerdir (karar S5, kart #1164).
export const ADRES_TURLERI = ['fatura', 'teslim', 'sube'] as const;
export const ADRES_SINIRI = 50;
// Plan bedelinin müşteri sınıfı (265 a); çarpanları plan tutar, boş sınıf 1,0 sayılır.
export const MUSTERI_SINIFLARI = ['A', 'B', 'C'] as const;

export const firmaTuru = z.enum(FIRMA_TURLERI);
export type FirmaTuru = z.output<typeof firmaTuru>;
export const adresTuru = z.enum(ADRES_TURLERI);
export type AdresTuru = z.output<typeof adresTuru>;
export const musteriSinifi = z.enum(MUSTERI_SINIFLARI);
export type MusteriSinifi = z.output<typeof musteriSinifi>;

// Boş metin "yok" demektir: saklanmaz, null olur.
const istegeBagli = (azami: number) => z
  .string()
  .trim()
  .max(azami, `En çok ${azami} karakter.`)
  .nullish()
  .transform((m) => (m === undefined || m === null || m === '' ? null : m));

const mantiksal = z.enum(['true', 'false']).optional().transform((d) => (d === undefined ? undefined : d === 'true'));
// Koordinat ondalık derecedir (WGS84); enlem ve boylam ya ikisi birlikte verilir ya hiçbiri (kural sunucuda ve kısıtta).
const enlem = z.number().min(-90, 'Enlem -90 ile 90 arasındadır.').max(90, 'Enlem -90 ile 90 arasındadır.').nullish().transform((v) => v ?? null);
const boylam = z.number().min(-180, 'Boylam -180 ile 180 arasındadır.').max(180, 'Boylam -180 ile 180 arasındadır.').nullish()
  .transform((v) => v ?? null);

export const kimlikParametresi = z.object({ id: z.coerce.number().int().positive() });
export const adresParametresi = z.object({ id: z.coerce.number().int().positive(), adresId: z.coerce.number().int().positive() });

// Firma kartının kimlik alanları. Bakiye, risk ve tutar burada yoktur (finans rakamı, FNS-48); Logo kayıt numarası ve gönderim
// durumunu ekrandan kimse yazamaz, yalnız Logo köprüsü yazar (şemada yok, gelirse atılır).
export const firmaKimligi = z.object({
  kod: istegeBagli(40),
  ad: z.string().trim().min(1, 'Firma adı boş olamaz.').max(200, 'En çok 200 karakter.'),
  tur: firmaTuru,
  fason: z.boolean().default(false),
  ulkeKodu: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Ülke kodu iki harftir (TR gibi).').default('TR'),
  vergiNo: istegeBagli(30),
  vergiDairesi: istegeBagli(100),
  paraBirimi: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Para birimi üç harfli koddur (TRY gibi).').default('TRY'),
  vadeGunu: z.number().int().min(0, 'Vade günü 0 ile 365 arasındadır.').max(365, 'Vade günü 0 ile 365 arasındadır.').nullish()
    .transform((v) => v ?? null),
  adres: istegeBagli(500),
  ilce: istegeBagli(100),
  il: istegeBagli(100),
  postaKodu: istegeBagli(20),
  enlem,
  boylam,
  telefon: istegeBagli(40),
  ePosta: istegeBagli(200).refine((e) => e === null || /^[^@\s]+@[^@\s]+$/.test(e), 'E-posta biçimi geçersiz.'),
  logoCariKodu: istegeBagli(40),
  musteriSinifi: musteriSinifi.nullish().transform((v) => v ?? null),
});
export type FirmaKimligi = z.output<typeof firmaKimligi>;

export const firmaEkleGovdesi = firmaKimligi;
export type FirmaEkleGovdesi = z.input<typeof firmaEkleGovdesi>;
// Düzeltmede koordinat gönderilmezse (ikisi de yoksa) kartınki korunur: koordinatı bilmeyen ekran (finans çerçevesi) onu silmesin.
// null açıkça siler.
const koordinatKorunur = { enlem: z.number().min(-90).max(90).nullable().optional(), boylam: z.number().min(-180).max(180).nullable().optional() };
// Sınıf da öyle: gönderilmezse korunur, null siler.
export const firmaGuncelleGovdesi = firmaKimligi.extend({ ...koordinatKorunur, musteriSinifi: musteriSinifi.nullable().optional(), ...beklenenSurum });
export type FirmaGuncelleGovdesi = z.input<typeof firmaGuncelleGovdesi>;
export type FirmaDuzeltmesi = z.output<typeof firmaGuncelleGovdesi>;
export const firmaDurumGovdesi = z.object(beklenenSurum);
export type FirmaDurumGovdesi = z.input<typeof firmaDurumGovdesi>;

export const firmaSemasi = z.object({
  id: z.number().int().positive(),
  kod: z.string().nullable(),
  ad: z.string(),
  tur: firmaTuru,
  fason: z.boolean(),
  ulkeKodu: z.string(),
  vergiNo: z.string().nullable(),
  vergiDairesi: z.string().nullable(),
  paraBirimi: z.string(),
  vadeGunu: z.number().int().nullable(),
  adres: z.string().nullable(),
  ilce: z.string().nullable(),
  il: z.string().nullable(),
  postaKodu: z.string().nullable(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  telefon: z.string().nullable(),
  ePosta: z.string().nullable(),
  aktif: z.boolean(),
  logoCariKodu: z.string().nullable(),
  logoKayitNo: z.number().int().nullable(),
  logoGonderimDurumu: z.enum(LOGO_GONDERIM_DURUMLARI).nullable(),
  // Sunucu her zaman yazar; isteğe bağlı olması alandan önce yazılmış istemci örneklerini (Finans çerçevesi testi) kırmamak içindir.
  musteriSinifi: musteriSinifi.nullable().optional(),
  olusturma: zamanSemasi,
  guncelleme: zamanSemasi.nullable(),
  surum: surumSemasi,
});
export type Firma = z.output<typeof firmaSemasi>;
export const firmaCevabi = z.object({ firma: firmaSemasi });
export type FirmaCevabi = z.output<typeof firmaCevabi>;

// Kartın yanındaki adresler (fatura, teslim, şube); her biri kendi koordinatıyla.
export const adresKimligi = z.object({
  tur: adresTuru,
  ad: z.string().trim().min(1, 'Adresin adı boş olamaz.').max(100, 'En çok 100 karakter.'),
  adres: istegeBagli(500),
  ilce: istegeBagli(100),
  il: istegeBagli(100),
  postaKodu: istegeBagli(20),
  enlem,
  boylam,
});
export type AdresKimligi = z.output<typeof adresKimligi>;
export const adresEkleGovdesi = adresKimligi.extend(beklenenSurum);
export type AdresEkleGovdesi = z.input<typeof adresEkleGovdesi>;
export const adresGuncelleGovdesi = adresKimligi.extend(beklenenSurum);
export type AdresGuncelleGovdesi = z.input<typeof adresGuncelleGovdesi>;
export const adresKaldirGovdesi = z.object(beklenenSurum);
export type AdresKaldirGovdesi = z.input<typeof adresKaldirGovdesi>;

export const adresSemasi = z.object({
  id: z.number().int().positive(),
  firmaId: z.number().int().positive(),
  tur: adresTuru,
  ad: z.string(),
  adres: z.string().nullable(),
  ilce: z.string().nullable(),
  il: z.string().nullable(),
  postaKodu: z.string().nullable(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  olusturma: zamanSemasi,
  guncelleme: zamanSemasi.nullable(),
});
export type Adres = z.output<typeof adresSemasi>;

// Kart ve adresleri birlikte: ayrıntı okuması ve adres komutları bunu döner (adres yazması kartın sürümünü artırır).
export const firmaAyrintiCevabi = z.object({ firma: firmaSemasi, adresler: z.array(adresSemasi).max(ADRES_SINIRI) });
export type FirmaAyrintiCevabi = z.output<typeof firmaAyrintiCevabi>;

export const firmaSatiri = firmaSemasi.pick({
  id: true, kod: true, ad: true, tur: true, fason: true, vergiNo: true, il: true, aktif: true, logoCariKodu: true,
}).extend({ adresSayisi: z.number().int().nonnegative(), koordinatli: z.boolean() });
export type FirmaSatiri = z.output<typeof firmaSatiri>;

export const firmaListeSorgusu = z.object({
  ...listeSorguAlanlari(['ad', 'kod']),
  ara: z.string().trim().max(100).optional(),
  // musteri ya da tedarikci süzgeci "ikisi" türünü de kapsar; ikisi yalnız ikisi'ni getirir.
  tur: firmaTuru.optional(),
  fason: mantiksal,
  aktif: mantiksal,
});
export type FirmaListeSorgusu = z.input<typeof firmaListeSorgusu>;
export const firmaListesiCevabi = listeCevapSemasi(firmaSatiri);
export type FirmaListesiCevabi = z.output<typeof firmaListesiCevabi>;

// Kayıt akışlarındaki seçim kutusu: yalnız aktif firmalar; varsayılan para birimi ve vade yeni belgeye öneridir (FNS-52).
export const firmaSecimSorgusu = z.object({
  ara: z.string().trim().max(100).default(''),
  tur: firmaTuru.optional(),
});
export const firmaSecimSatiri = firmaSemasi.pick({ id: true, kod: true, ad: true, tur: true, paraBirimi: true, vadeGunu: true });
export const firmaSecimCevabi = z.object({ firmalar: z.array(firmaSecimSatiri).max(FIRMA_ARAMA_SINIRI) });
export type FirmaSecimCevabi = z.output<typeof firmaSecimCevabi>;

// Tedarikçi karnesi (1259 c, 1260 a). Karnenin sahibi Müşteri-Tedarikçi'dir; satın alma teslimi, Kalite Merkezi lot kararını kendi
// işlemi içinde olay olarak iter (disari.ts), çünkü Müşteri-Tedarikçi onları ithal ederse modül döngüsü olur (ADR 0006).
export const KARNE_AGIRLIKLARI = { teslim: 40, kalite: 40, hizmet: 20 } as const;
// Az alım yapılan tedarikçide kısa dönem anlamlı veri vermez; puan her gün kayan son 12 ayla hesaplanır.
export const KARNE_DONEM_AYI = 12;
export const TESLIM_TOLERANS_GUNU = 2;
export const KARNE_EN_AZ_TESLIM = 3;
export const KARNE_EN_AZ_LOT = 3;
export const KARNE_SINIFLARI = ['A', 'B', 'C', 'D'] as const;
export const KARNE_SINIF_ALT_SINIRLARI = { A: 90, B: 75, C: 60, D: 0 } as const;
export const HIZMET_PUANI_EN_AZ = 1;
export const HIZMET_PUANI_EN_COK = 5;
export const KARNE_OLAY_KAYNAKLARI = ['satin-alma', 'kalite-merkezi', 'uretim-emirleri'] as const;
// Kalite lot başına sayılır: hammadde kg ve metreyle gelir, adet tabanlı PPM orada anlamsızdır.
export const LOT_KARARLARI = ['kabul', 'sartli_kabul', 'hatali_kabul', 'red', 'iade'] as const;
export const LOT_KARAR_PUANI = { kabul: 1, sartli_kabul: 0.5, hatali_kabul: 0.5, red: 0, iade: 0 } as const;
export const YILLIK_KARNE_SINIRI = 50;
export const HIZMET_PUANI_SINIRI = 100;

export const karneSinifi = z.enum(KARNE_SINIFLARI);
export type KarneSinifi = z.output<typeof karneSinifi>;
export const karneOlayKaynagi = z.enum(KARNE_OLAY_KAYNAKLARI);
export type KarneOlayKaynagi = z.output<typeof karneOlayKaynagi>;
export const lotKarari = z.enum(LOT_KARARLARI);
export type LotKarari = z.output<typeof lotKarari>;

// Olay kaynak ve anahtarıyla tektir: aynı kaydın sonraki kararı (lot NCR'den iadeye döndü gibi) öncekinin yerine geçer,
// geçmişi geri doldurma da tekrar güvenlidir.
const olayOrtak = {
  kaynak: karneOlayKaynagi,
  anahtar: z.string().trim().min(1).max(120),
  firmaId: z.number().int().positive(),
  zaman: zamanSemasi,
};
export const teslimOlayi = z.object({
  ...olayOrtak,
  tur: z.literal('teslim'),
  termin: tarihSemasi,
  teslimGunu: tarihSemasi,
  // Eksik teslim zamanında sayılmaz; satırın kalanı geldiğinde aynı anahtarla yeni olay yazılır.
  tam: z.boolean(),
});
export const lotOlayi = z.object({ ...olayOrtak, tur: z.literal('lot'), karar: lotKarari });
export const karneOlayi = z.discriminatedUnion('tur', [teslimOlayi, lotOlayi]);
export type TeslimOlayi = z.output<typeof teslimOlayi>;
export type LotOlayi = z.output<typeof lotOlayi>;
export type KarneOlayi = z.input<typeof karneOlayi>;

export const hizmetPuaniGovdesi = z.object({
  puan: z.number().int().min(HIZMET_PUANI_EN_AZ, 'Puan 1 ile 5 arasındadır.').max(HIZMET_PUANI_EN_COK, 'Puan 1 ile 5 arasındadır.'),
  not: istegeBagli(500),
});
export type HizmetPuaniGovdesi = z.input<typeof hizmetPuaniGovdesi>;
// Yıllık karne o anki kayan puanın kaydıdır (ISO 9001 8.4.1 kaydı); puanı sunucu hesaplar, gövde yalnız yılı ve notu taşır.
export const yillikKarneGovdesi = z.object({
  yil: z.number().int().min(2000, 'Yıl geçersiz.').max(2100, 'Yıl geçersiz.'),
  not: istegeBagli(1000),
});
export type YillikKarneGovdesi = z.input<typeof yillikKarneGovdesi>;

const yuzluk = z.number().min(0).max(100).nullable();
export const karneOzetiSemasi = z.object({
  firmaId: z.number().int().positive(),
  donemBasi: tarihSemasi,
  donemSonu: tarihSemasi,
  teslim: z.object({ toplam: z.number().int().nonnegative(), zamaninda: z.number().int().nonnegative(), oran: yuzluk }),
  kalite: z.object({ lot: z.number().int().nonnegative(), puan: yuzluk }),
  hizmet: z.object({ sayi: z.number().int().nonnegative(), puan: yuzluk }),
  puan: yuzluk,
  sinif: karneSinifi.nullable(),
  // En az veri yoksa puan ve sınıf null'dır; ekran "Yetersiz veri" yazar.
  yetersizVeri: z.boolean(),
});
export type KarneOzeti = z.output<typeof karneOzetiSemasi>;

export const yillikKarneSemasi = z.object({
  id: z.number().int().positive(),
  firmaId: z.number().int().positive(),
  yil: z.number().int(),
  teslimOrani: yuzluk,
  kalitePuani: yuzluk,
  hizmetPuani: yuzluk,
  puan: yuzluk,
  sinif: karneSinifi.nullable(),
  not: z.string().nullable(),
  degerlendiren: z.string(),
  olusturma: zamanSemasi,
});
export type YillikKarne = z.output<typeof yillikKarneSemasi>;

export const hizmetPuaniSemasi = z.object({
  id: z.number().int().positive(),
  puan: z.number().int().min(HIZMET_PUANI_EN_AZ).max(HIZMET_PUANI_EN_COK),
  not: z.string().nullable(),
  giren: z.string(),
  olusturma: zamanSemasi,
});
export type HizmetPuani = z.output<typeof hizmetPuaniSemasi>;

export const karneCevabi = z.object({
  karne: karneOzetiSemasi,
  yillikKarneler: z.array(yillikKarneSemasi).max(YILLIK_KARNE_SINIRI),
  hizmetPuanlari: z.array(hizmetPuaniSemasi).max(HIZMET_PUANI_SINIRI),
});
export type KarneCevabi = z.output<typeof karneCevabi>;
