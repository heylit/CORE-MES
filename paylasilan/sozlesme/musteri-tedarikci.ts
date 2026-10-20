import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

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
