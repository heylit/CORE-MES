import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';
import { PAY_TURLERI } from './stok-kontrol-sabitleri.ts';

// 3437: İkame ve alternatifler. Muadil türü: tam (doğrudan), üst (genelde sorunsuz, çoğu zaman pahalı), şartlı (uygulamaya bağlı; açıkça izin ister).
export const MUADIL_TURLERI = ['tam', 'ust', 'sartli'] as const;
export type MuadilTuru = (typeof MUADIL_TURLERI)[number];
export const KAPSAM_TURLERI = ['aile', 'sinif', 'kalite', 'kart'] as const;
export type KapsamTuru = (typeof KAPSAM_TURLERI)[number];

const kod = (n: number) => z.string().trim().min(1).max(n);
const not = z.string().trim().min(1).max(300).nullable();

export const kaliteMuadili = z.object({ kalite: z.string(), muadil: z.string(), tur: z.enum(MUADIL_TURLERI), notu: z.string().nullable(), surum: surumSemasi });
export const durumMuadili = z.object({ durum: z.string(), muadil: z.string(), tur: z.enum(MUADIL_TURLERI), notu: z.string().nullable(), surum: surumSemasi });
export type KaliteMuadili = z.output<typeof kaliteMuadili>;
export type DurumMuadili = z.output<typeof durumMuadili>;

// Boş (null) alan üst kapsamdan miras alınır.
const kuralAlanlari = {
  kaliteAcik: z.boolean().nullable(),
  durumAcik: z.boolean().nullable(),
  sartliAcik: z.boolean().nullable(),
  boyUzunKesilir: z.boolean().nullable(),
  yuzeySerbest: z.boolean().nullable(),
  payTuru: z.enum(PAY_TURLERI).nullable(),
  payDeger: z.number().min(0).max(1000).nullable(),
  payEnAzMm: z.number().min(0).max(1000).nullable(),
  kapali: z.boolean().nullable(),
  gerekce: not,
};

export const alternatifKurali = z.object({
  id: z.number().int(),
  kapsamTuru: z.enum(KAPSAM_TURLERI),
  kapsam: z.string(),
  // Kart kapsamında kartın stok kodu ve adı; kart yoksa null.
  kapsamAdi: z.string().nullable(),
  ...kuralAlanlari,
  gerekce: z.string().nullable(),
  surum: surumSemasi,
  guncelleyen: z.string().nullable(),
  guncelleme: zamanSemasi,
});
export type AlternatifKurali = z.output<typeof alternatifKurali>;

export const alternatifTanimlariCevabi = z.object({
  kurallar: z.array(alternatifKurali),
  kaliteMuadilleri: z.array(kaliteMuadili),
  durumMuadilleri: z.array(durumMuadili),
});
export type AlternatifTanimlariCevabi = z.output<typeof alternatifTanimlariCevabi>;

export const alternatifKuraliKaydetGovdesi = z.object({
  kapsamTuru: z.enum(KAPSAM_TURLERI),
  kapsam: kod(64),
  ...kuralAlanlari,
  // Yeni kuralda yok; var olanı değiştirirken okunan sürüm.
  surum: surumSemasi.optional(),
}).strict();
export type AlternatifKuraliKaydetGovdesi = z.input<typeof alternatifKuraliKaydetGovdesi>;

export const alternatifKuraliParametresi = z.object({ id: z.coerce.number<number>().int().positive() });
export const alternatifKuraliKaldirGovdesi = z.object({ ...beklenenSurum }).strict();

export const kaliteMuadiliKaydetGovdesi = z.object({
  kalite: kod(40), muadil: kod(40), tur: z.enum(MUADIL_TURLERI), notu: not, surum: surumSemasi.optional(),
}).strict();
export const durumMuadiliKaydetGovdesi = z.object({
  durum: kod(60), muadil: kod(60), tur: z.enum(MUADIL_TURLERI), notu: not, surum: surumSemasi.optional(),
}).strict();
export const kaliteMuadiliKaldirGovdesi = z.object({ kalite: kod(40), muadil: kod(40), ...beklenenSurum }).strict();
export const durumMuadiliKaldirGovdesi = z.object({ durum: kod(60), muadil: kod(60), ...beklenenSurum }).strict();
export const alternatifKomutCevabi = z.object({ tamam: z.literal(true) });

// Zarf: bir kartın kabul sınırları ve her sınırın kaynağı (hangi kuraldan geldiği; null varsayılan).
const kaynak = z.object({ kapsamTuru: z.enum(KAPSAM_TURLERI), kapsam: z.string() }).nullable();
const secenek = z.object({ deger: z.string(), tur: z.enum(MUADIL_TURLERI), notu: z.string().nullable() });
export const alternatifZarfi = z.object({
  kapali: z.boolean(),
  gerekce: z.string().nullable(),
  kapaliKaynak: kaynak,
  sartliAcik: z.boolean(),
  sartliKaynak: kaynak,
  // sinir: seçenekler kartta seçilen kabul sınırından (3463); o zaman yalnız listedekiler kabul edilir, kaynak sınırın kapsamıdır.
  kalite: z.object({ istenen: z.string().nullable(), acik: z.boolean(), secenekler: z.array(secenek), kaynak, sinir: z.boolean() }),
  durum: z.object({ istenen: z.string().nullable(), acik: z.boolean(), secenekler: z.array(secenek), kaynak, sinir: z.boolean() }),
  form: z.string().nullable(),
  // Kesit ölçüleri: en az enAz (sınır yoksa istenen), en çok enCok kadar. sinirKaynak: aralık kartta seçildiyse kapsamı.
  olcu: z.array(z.object({ anahtar: z.string(), istenen: z.number(), enAz: z.number(), enCok: z.number(), sinirKaynak: kaynak })),
  pay: z.object({ tur: z.enum(PAY_TURLERI), deger: z.number(), enAzMm: z.number(), kaynak }),
  // Boyda aralık seçildiyse enAz/enCok dolu, uzun boy kuralının yerine geçer.
  boy: z.object({
    anahtar: z.string(), istenen: z.number().nullable(), uzunKesilir: z.boolean(), kaynak,
    enAz: z.number().nullable(), enCok: z.number().nullable(), sinirKaynak: kaynak,
  }).nullable(),
  // Yüzeyde liste seçildiyse (secenekler dolu) yalnız listedekiler kabul edilir; serbest yok sayılır.
  yuzey: z.object({ istenen: z.string().nullable(), serbest: z.boolean(), kaynak, secenekler: z.array(secenek), sinir: z.boolean() }),
});
export type AlternatifZarfi = z.output<typeof alternatifZarfi>;

export const ZARF_SONUCLARI = ['ayni', 'icinde', 'sartli', 'disi'] as const;
export type ZarfSonucu = (typeof ZARF_SONUCLARI)[number];

export const zarfKarti = z.object({
  no: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), kalite: z.string().nullable(), durum: z.string().nullable(),
  form: z.string().nullable(), olcu: z.record(z.string(), z.number()), sonuc: z.enum(ZARF_SONUCLARI), nedenler: z.array(z.string()),
});
export type ZarfKarti = z.output<typeof zarfKarti>;

export const kartZarfiParametresi = z.object({ no: z.coerce.number<number>().int().positive() });
export const kartZarfiCevabi = z.object({
  kart: z.object({ no: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), aile: z.string().nullable(), sinif: z.string().nullable() }),
  // Hammadde dışı ya da kalitesiz kartta zarf hesaplanmaz.
  zarf: alternatifZarfi.nullable(),
  kartlar: z.array(zarfKarti),
});
export type KartZarfiCevabi = z.output<typeof kartZarfiCevabi>;

// 3463: bir kartın yerine kabul edilen kartlar, tek okuma (talep, satın alma, stok kontrol bunu okur). esdeger: aynı malzemenin başka
// kartı, her zaman kabul; alternatif: kartın kabul sınırına giren kart. Koşullar kullanım yerine ve mamule göre uygulanır (3463-2).
export const KULLANIM_YERLERI = ['talep', 'satin_alma', 'uretim'] as const;
export type KullanimYeri = (typeof KULLANIM_YERLERI)[number];
export const ALTERNATIF_KART_TURLERI = ['esdeger', 'alternatif'] as const;
export type AlternatifKartTuru = (typeof ALTERNATIF_KART_TURLERI)[number];
export const alternatifKarti = z.object({
  no: z.number().int(),
  kod: z.string().nullable(),
  ad: z.string().nullable(),
  tur: z.enum(ALTERNATIF_KART_TURLERI),
  sonuc: z.enum(['ayni', 'icinde', 'sartli']),
  nedenler: z.array(z.string()),
});
export type AlternatifKarti = z.output<typeof alternatifKarti>;
export interface AlternatifBaglami { kullanimYeri: KullanimYeri; mamulNo?: number | undefined }

// 3463: kabul sınırı (kartta seçilen). Liste niteliğinde izinli değerler ve türleri; ölçüde mm cinsinden alt ve üst.
export const LISTE_NITELIKLERI = ['kalite', 'durum', 'yuzey'] as const;
export const OLCU_NITELIKLERI = ['d', 's', 'a', 'b', 't', 'D', 'h', 'l'] as const;
export const SINIR_NITELIKLERI = [...LISTE_NITELIKLERI, ...OLCU_NITELIKLERI] as const;
export type SinirNiteligi = (typeof SINIR_NITELIKLERI)[number];
const sinirDegeri = z.object({ deger: z.string().trim().min(1).max(60), tur: z.enum(MUADIL_TURLERI) });
export type SinirDegeri = z.output<typeof sinirDegeri>;
const mm = z.number().min(0).max(100000).nullable();
export const kabulSiniri = z.object({
  id: z.number().int(),
  kapsamTuru: z.enum(KAPSAM_TURLERI),
  kapsam: z.string(),
  nitelik: z.enum(SINIR_NITELIKLERI),
  degerler: z.array(sinirDegeri).nullable(),
  alt: z.number().nullable(),
  ust: z.number().nullable(),
  surum: surumSemasi,
});
export type KabulSiniri = z.output<typeof kabulSiniri>;
export const kabulSiniriKaydetGovdesi = z.object({
  kapsamTuru: z.enum(KAPSAM_TURLERI),
  kapsam: kod(64),
  nitelik: z.enum(SINIR_NITELIKLERI),
  degerler: z.array(sinirDegeri).max(40).nullable(),
  alt: mm,
  ust: mm,
  surum: surumSemasi.optional(),
}).strict();
export type KabulSiniriKaydetGovdesi = z.input<typeof kabulSiniriKaydetGovdesi>;
export const kabulSiniriParametresi = z.object({ id: z.coerce.number<number>().int().positive() });
export const kabulSiniriKaldirGovdesi = z.object({ ...beklenenSurum }).strict();

// Eşdeğer kart: aynı malzemenin başka kartı. Bağ aynı tür, form, ölçü anahtarı ve stok biriminde kurulur.
export const esdegerKart = z.object({ no: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable() });
export const esdegerBaglaGovdesi = z.object({ kartNo: z.number().int().positive(), esdegerNo: z.number().int().positive() }).strict();
export const esdegerKaldirGovdesi = z.object({ kartNo: z.number().int().positive() }).strict();

// Kartın Alternatifler bölümü: kendi ve üst kapsamlardan gelen sınırlar, eşdeğerler.
export const kartAlternatifleriCevabi = z.object({
  siniri: z.array(kabulSiniri),
  esdegerler: z.array(esdegerKart),
});
export type KartAlternatifleriCevabi = z.output<typeof kartAlternatifleriCevabi>;

// 3463-1b: grup şablonu; aile, sınıf ve kalite kapsamındaki sınırlar (kart sınırı kartın kendi bölümündedir).
export const grupSinirlariCevabi = z.object({ siniri: z.array(kabulSiniri) });
export type GrupSinirlariCevabi = z.output<typeof grupSinirlariCevabi>;
