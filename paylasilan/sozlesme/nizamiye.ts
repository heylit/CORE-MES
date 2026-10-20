import { z } from 'zod';
import { adresCoz } from '../ag-araligi.ts';
import { gizli } from '../gizli.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { KART_DURUMLARI, KART_KAYIT_DURUMLARI, KART_TURLERI, KIMLIK_TURLERI, NEDENLER, ZIYARET_DURUMLARI } from './nizamiye-sabitleri.ts';

export * from './nizamiye-sabitleri.ts';

const bosIseNull = (d: unknown) => (typeof d === 'string' && d.trim() === '' ? null : d);
const metin = (en: number, ileti: string) => z.preprocess(bosIseNull, z.string().trim().max(en, ileti).nullable().default(null));
const ad = z.string().trim().min(1, 'Ad zorunlu.').max(120, 'Ad en çok 120 karakter olur.');
const telefon = z.preprocess(
  bosIseNull,
  z.string().trim().regex(/^[0-9 +()-]{4,20}$/, 'Telefon yalnız rakam, boşluk, + ( ) - içerir (4-20 karakter).').nullable().default(null),
);
const plaka = z.preprocess(
  (d) => (typeof d === 'string' ? (d.trim() === '' ? null : d.trim().toLocaleUpperCase('tr')) : d),
  z.string().regex(/^[0-9A-Z ]{2,12}$/, 'Plaka harf, rakam ve boşluktan oluşur.').nullable().default(null),
);
// Tam kimlik numarası hiç alınmaz (166 a): yalnız son dört hane.
const kimlikSon4 = z.preprocess(
  (d) => (typeof d === 'string' ? (d.trim() === '' ? null : d.trim().toUpperCase()) : d),
  z.string().regex(/^[0-9A-Z]{4}$/, 'Kimlikten yalnız son dört hane yazılır.').nullable().default(null),
);
const kimlik = z.number().int().positive().max(2147483647);

export const idParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const surumGovdesi = z.object({ ...beklenenSurum });

const kisiAlanlari = {
  ad,
  firmaAdi: metin(120, 'Firma en çok 120 karakter olur.'),
  telefon,
  neden: z.enum(NEDENLER),
  aciklama: metin(200, 'Açıklama en çok 200 karakter olur.'),
};

const girisAlanlari = {
  kartId: kimlik,
  kimlikGoruldu: z.boolean(),
  kimlikTuru: z.enum(KIMLIK_TURLERI).nullable().default(null),
  kimlikSon4,
  atolye: z.boolean().default(false),
  dizustu: z.boolean().default(false),
  kvkkOnayi: z.boolean().default(false),
  ogleYemegi: z.boolean().default(false),
};

// Ev sahibi kendi adına açar (217 a); ev sahibi gövdede yoktur, oturumdan alınır.
export const onKayitGovdesi = z.object({
  ...kisiAlanlari,
  beklenenZaman: zamanSemasi,
  ogleYemegi: z.boolean().default(false),
});

export const girisGovdesi = z.object({ ...beklenenSurum, ...girisAlanlari });

// Ön kaydı olmadan gelen: kayıt ve giriş tek komut.
export const habersizGovdesi = z.object({
  ...kisiAlanlari,
  plaka,
  evSahibiKisiId: kimlik,
  ...girisAlanlari,
});

export const cikisGovdesi = z.object({
  ...beklenenSurum,
  // Kart geri alınmadıysa kart kayıp sayılır.
  kartTeslim: z.boolean(),
  ekipmanKontrol: z.boolean().nullable().default(null),
});

export const kartEkleGovdesi = z.object({
  kartNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/, 'Kart no en çok 12 karakter; büyük harf, rakam ve tire.'),
  tur: z.enum(KART_TURLERI),
  izinliBolge: metin(120, 'Bölge en çok 120 karakter olur.'),
});

export const kartBildirGovdesi = z.object({
  ...beklenenSurum,
  durum: z.enum(['kayip', 'hasarli']),
  not: metin(300, 'Not en çok 300 karakter olur.'),
});

export const gecmisSorgusu = z.object({
  gun: tarihSemasi.optional(),
  ara: z.string().trim().max(60).optional(),
});

export const oneriSorgusu = z.object({ ara: z.string().trim().min(2, 'En az iki harf yazın.').max(60) });

export const ziyaretSemasi = z.object({
  id: z.number().int(),
  ziyaretNo: z.string(),
  // Saklama süresi dolup anonimleşen kayıtta null.
  ad: z.string().nullable(),
  firmaAdi: z.string().nullable(),
  telefon: z.string().nullable(),
  neden: z.enum(NEDENLER),
  aciklama: z.string().nullable(),
  plaka: z.string().nullable(),
  evSahibiKisiId: z.number().int(),
  evSahibiAd: z.string().nullable(),
  beklenenZaman: zamanSemasi.nullable(),
  ogleYemegi: z.boolean(),
  kimlikGoruldu: z.boolean(),
  kimlikTuru: z.enum(KIMLIK_TURLERI).nullable(),
  kimlikSon4: z.string().nullable(),
  atolye: z.boolean(),
  dizustu: z.boolean(),
  kvkkOnayi: z.boolean(),
  ekipmanKontrol: z.boolean().nullable(),
  kartId: z.number().int().nullable(),
  kartNo: z.string().nullable(),
  kartTeslim: z.boolean().nullable(),
  durum: z.enum(ZIYARET_DURUMLARI),
  giris: zamanSemasi.nullable(),
  girenAd: z.string().nullable(),
  cikis: zamanSemasi.nullable(),
  cikaranAd: z.string().nullable(),
  iptalZaman: zamanSemasi.nullable(),
  olusturma: zamanSemasi,
  surum: surumSemasi,
});

export const bosKartSemasi = z.object({ id: z.number().int(), kartNo: z.string(), tur: z.enum(KART_TURLERI), izinliBolge: z.string().nullable() });

// Kapı konsolu tek okumayla dolar: beklenenler (bugün ve geciken), içeridekiler ve verilebilecek kartlar.
export const kapiCevabi = z.object({
  simdi: zamanSemasi,
  beklenen: z.array(ziyaretSemasi),
  iceride: z.array(ziyaretSemasi),
  bosKartlar: z.array(bosKartSemasi),
});

export const kartSemasi = z.object({
  id: z.number().int(),
  kartNo: z.string(),
  tur: z.enum(KART_TURLERI),
  izinliBolge: z.string().nullable(),
  durum: z.enum(KART_DURUMLARI),
  durumNotu: z.string().nullable(),
  surum: surumSemasi,
  ziyaret: z.object({ id: z.number().int(), ziyaretNo: z.string(), ad: z.string().nullable(), giris: zamanSemasi }).nullable(),
});
export const kartlarCevabi = z.object({ kartlar: z.array(kartSemasi) });

export const gecmisCevabi = z.object({ gun: tarihSemasi, ziyaretler: z.array(ziyaretSemasi) });

// Personel PDKS dosyasından (243 a): son hareketi giriş olan kişi içeride. Hiç aktarım yoksa pdksSonAktarim null; liste boş ama "bilinmiyor".
export const pdksPersonelSemasi = z.object({ kisiId: z.number().int(), ad: z.string(), sicilNo: z.string().nullable(), giris: zamanSemasi });
export const acilDurumCevabi = z.object({
  zaman: zamanSemasi, yazdiran: z.string(), ziyaretler: z.array(ziyaretSemasi),
  personel: z.array(pdksPersonelSemasi), pdksSonAktarim: zamanSemasi.nullable(),
});

// Dosya tarayıcıda okunur, metin olarak gelir (ağ bağlantısı yok). Sunucunun gövde sınırının altında kalır.
export const pdksAktarGovdesi = z.object({
  dosyaAdi: z.string().trim().min(1, 'Dosya adı zorunlu.').max(200, 'Dosya adı en çok 200 karakter olur.'),
  metin: z.string().min(1, 'Dosya boş.').max(400_000, 'Dosya çok büyük; günlük dosyayı aktarın.'),
});
export const pdksAktarCevabi = z.object({
  satirSayisi: z.number().int(),
  yeniHareket: z.number().int(),
  zatenVardi: z.number().int(),
  eslesmeyenSicil: z.array(z.string()),
  hatalar: z.array(z.object({ satirNo: z.number().int(), neden: z.string() })),
});

// Kart okuyucu kaydı (289 b, ADR 0016): cihaz kayıtlı adresinden ve anahtarından tanınır. Anahtar yalnız açılışta ve yenilemede bir kez
// döner, saklanmaz. Kart okuyucunun gövdesi denetim kaydına girmez (gizli): sicil ve saat taşır.
export const pdksCihazSemasi = z.object({
  id: z.number().int(), ad: z.string(), ip: z.string(), aktif: z.boolean(), sonGonderim: zamanSemasi.nullable(), surum: surumSemasi,
});
export const pdksCihazlarCevabi = z.object({ cihazlar: z.array(pdksCihazSemasi) });
export const pdksCihazEkleGovdesi = z.object({
  ad: z.string().trim().min(1, 'Cihaz adı zorunlu.').max(100, 'Cihaz adı en çok 100 karakter olur.'),
  ip: z.string().trim().refine((d) => adresCoz(d) !== null, 'Tek bir IP adresi yazın (örnek 10.0.7.21).'),
});
export const pdksCihazDurumGovdesi = z.object({ ...beklenenSurum, aktif: z.boolean() });
export const pdksCihazAnahtarCevabi = z.object({ cihaz: pdksCihazSemasi, anahtar: z.string() });
export const pdksCihazHareketiGovdesi = z.object({
  anahtar: gizli(z.string().min(1).max(200)),
  ham: gizli(z.string().max(400_000)),
});
// Cihaza sicil ya da ad dönmez; yalnız sayılar.
export const pdksCihazHareketiCevabi = z.object({
  satirSayisi: z.number().int(), yeniHareket: z.number().int(), zatenVardi: z.number().int(), eslesmeyen: z.number().int(), hatali: z.number().int(),
});

// Habersiz ziyaretçide "kimi görecek": son 30 günde en çok ziyaretçi kabul eden önde.
export const evSahipleriCevabi = z.object({
  kisiler: z.array(z.object({ id: z.number().int(), ad: z.string(), ziyaretSayisi: z.number().int() })),
});

// Daha önce gelmiş kişinin bilgileri yazarken dolar; kimlik hanesi önerilmez.
export const onerilerCevabi = z.object({
  oneriler: z.array(z.object({
    ad: z.string(), firmaAdi: z.string().nullable(), telefon: z.string().nullable(), plaka: z.string().nullable(), sonGiris: zamanSemasi,
  })),
});

// Ev sahibinin gördüğü: kimlik ve telefon kapıda kalır.
export const benimZiyaretcimSemasi = z.object({
  id: z.number().int(),
  ziyaretNo: z.string(),
  ad: z.string().nullable(),
  firmaAdi: z.string().nullable(),
  neden: z.enum(NEDENLER),
  aciklama: z.string().nullable(),
  beklenenZaman: zamanSemasi.nullable(),
  ogleYemegi: z.boolean(),
  durum: z.enum(ZIYARET_DURUMLARI),
  giris: zamanSemasi.nullable(),
  cikis: zamanSemasi.nullable(),
  kartNo: z.string().nullable(),
  surum: surumSemasi,
});
export const ziyaretcilerimCevabi = z.object({ ziyaretler: z.array(benimZiyaretcimSemasi) });

export type Ziyaret = z.output<typeof ziyaretSemasi>;
export type BosKart = z.output<typeof bosKartSemasi>;
export type KapiCevabi = z.output<typeof kapiCevabi>;
export type Kart = z.output<typeof kartSemasi>;
export type KartlarCevabi = z.output<typeof kartlarCevabi>;
export type GecmisCevabi = z.output<typeof gecmisCevabi>;
export type AcilDurumCevabi = z.output<typeof acilDurumCevabi>;
export type PdksPersonel = z.output<typeof pdksPersonelSemasi>;
export type PdksAktarGovdesi = z.input<typeof pdksAktarGovdesi>;
export type PdksAktarCevabi = z.output<typeof pdksAktarCevabi>;
export type PdksCihaz = z.output<typeof pdksCihazSemasi>;
export type PdksCihazlarCevabi = z.output<typeof pdksCihazlarCevabi>;
export type PdksCihazAnahtarCevabi = z.output<typeof pdksCihazAnahtarCevabi>;
export type PdksCihazHareketiCevabi = z.output<typeof pdksCihazHareketiCevabi>;
export type EvSahipleriCevabi = z.output<typeof evSahipleriCevabi>;
export type OnerilerCevabi = z.output<typeof onerilerCevabi>;
export type BenimZiyaretcim = z.output<typeof benimZiyaretcimSemasi>;
export type ZiyaretcilerimCevabi = z.output<typeof ziyaretcilerimCevabi>;
export type OnKayitGovdesi = z.input<typeof onKayitGovdesi>;
export type GirisGovdesi = z.input<typeof girisGovdesi>;
export type HabersizGovdesi = z.input<typeof habersizGovdesi>;
export type CikisGovdesi = z.input<typeof cikisGovdesi>;
export type KartEkleGovdesi = z.input<typeof kartEkleGovdesi>;
export type KartBildirGovdesi = z.input<typeof kartBildirGovdesi>;
