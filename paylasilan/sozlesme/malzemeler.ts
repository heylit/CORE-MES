import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { surumSemasi } from '../surum.ts';
import { durumSemasi as aletDurumu } from './kalibrasyon.ts';
import { LOGO_GECIS_SAYFA_BOYU, LOGO_TOPLU_AZAMI } from './logo-gecisi-sabitleri.ts';

export { LOGO_GECIS_SAYFA_BOYU, LOGO_TOPLU_AZAMI };

/* ---------------- Malzeme Kataloğu (prototip) kartları ----------------
   KULLANICI KARARI: prototip ekranları birebir yerleşir; kart bütün olarak saklanır. Tür, onay durumu ve stok kodu karttan okunur (özet bunları taşırsa kartla aynı olmalı);
   benzersiz anahtar ve mükerrer gerekçesi özetten gelir, sunucu türetemez (türde çakışma alanı seçiliyse anahtarı sunucu kurar). */

// Ticari mal (kart #1218) alınır, stoklanır ve satılır; üretilmez, rotası yoktur, reçeteye girmez.
export const KATALOG_TURLERI = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet', 'ticari_mal'] as const;
// Hizmet kartının yönü (kart #163, MH5 a): alınan hizmeti satın alma, verilen hizmeti satış kullanır; aynı iş iki yönde iki karttır.
export const HIZMET_YONLERI = ['alinan', 'verilen'] as const;
// 1247 d: giriş kalite kontrolü kart başına ayardır; kartta yazılı değilse türün varsayılanı geçer. Demirbaş ve hizmet lot almaz, GKK'ya giremez.
export const GKK_VARSAYILAN_TURLER = ['hammadde', 'yarimamul', 'ticari_mal'] as const;
export const GKK_OLMAYAN_TURLER = ['demirbas', 'hizmet'] as const;
// Logo tür karşılığı yalnız bu altı türe yazılır; hizmet Logo'ya ayrı hizmet kartı olarak gider (kısıt `malzeme_logo_karsiligi_tur`).
export const LOGO_TUR_KARSILIGI_TURLERI = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'ticari_mal'] as const;
export const KATALOG_ONAY_DURUMLARI = ['taslak', 'onayda', 'aktif', 'pasif'] as const;
// Tablo kısıtıyla (`malzeme_katalog_karti_onay`) aynı beş değer.
export const KATALOG_KART_DURUMLARI = ['taslak', 'onayda', 'aktif', 'pasif', 'iptal'] as const;
export const KATALOG_AYAR_ANAHTARLARI = ['malzeme', 'operasyonlar', 'genel'] as const;
export const KATALOG_ROLLERI = ['talep', 'sorumlu', 'yonetici'] as const;

const katalogKimligi = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
// Prototipin kartı, şablonu ve ayarı: alanları prototip belirler; sunucu bütün olarak saklar.
const katalogNesnesi = z.record(z.string(), z.unknown());

export const katalogKimlikParametresi = z.object({ kimlik: katalogKimligi });
export const katalogAyarParametresi = z.object({ anahtar: z.enum(KATALOG_AYAR_ANAHTARLARI) });

// Özetin denetlenen alanları; prototipin gönderdiği öteki özet alanları atılır. Tür, onay durumu ve kod karttan okunur;
// özette gelirse kartla aynı olmalı (MKK-14).
export const katalogKartiOzeti = z.object({
  stok_kodu: z.string().trim().max(60).nullable().optional(),
  tur: z.enum(KATALOG_TURLERI).optional(),
  onay_durumu: z.enum(KATALOG_ONAY_DURUMLARI).optional(),
  benzersiz_anahtar: z.string().max(500).nullable(),
  mukerrer_gerekcesi: z.string().trim().max(500).nullable(),
  // Ayarda zorunlu işaretli olup bu kartın formunda görünmeyen alanlar (başka kategorinin ya da koşulu tutmayan alan);
  // sunucu onaya gönderme ve aktif yapma anında bunları zorunlu saymaz.
  uygulanmayan_zorunlu: z.array(z.string().regex(/^[A-Za-z0-9_]{1,40}$/)).max(200).optional(),
  // Hammaddede ekranın yoğunluktan hesapladığı birim ağırlık ve gösterdiği adlar (208 a); kg fiyatından birim fiyat bunlarla bulunur.
  // Gelmezse kayıtlı değer korunur, null gelirse silinir.
  birim_agirlik_kg: z.number().positive().max(1e9).nullable().optional(),
  kalite_adi: z.string().trim().max(200).nullable().optional(),
  form_adi: z.string().trim().max(200).nullable().optional(),
  // Ekranın kurduğu Açıklama 1, 2, 3 (334 a; elle ya da seçimlerden), Logo'ya gider. Üçü de gelmezse kayıtlı değerler korunur, null gelen silinir.
  aciklama_1: z.string().trim().max(200).nullable().optional(),
  aciklama_2: z.string().trim().max(200).nullable().optional(),
  aciklama_3: z.string().trim().max(200).nullable().optional(),
  // 1247 d: gelmezse kayıtlı değer korunur; null türün varsayılanına döner.
  gkk_gerekli: z.boolean().nullable().optional(),
});

// Başka modüllerin kartı gösterdiği özet (`disari.ts`); kimlik kartın sayı kimliğidir. Ad ve birim kartta yoksa null;
// birim kartın kendi alanıdır, ekranın varsayılan birimi sunucuda türetilmez.
export const katalogMalzemeOzeti = z.object({
  id: z.number().int(),
  kimlik: z.string(),
  kod: z.string(),
  tur: z.enum(KATALOG_TURLERI),
  ad: z.string().nullable(),
  birim: z.string().nullable(),
  onayDurumu: z.enum(KATALOG_KART_DURUMLARI),
  // Sarf ve demirbaşta kategori, hizmette hizmet grubu: kartın anahtarı ve listedeki adı (kart #163).
  kategori: z.string().nullable(),
  kategoriAdi: z.string().nullable(),
  // Yalnız hizmette dolu.
  hizmetYonu: z.enum(HIZMET_YONLERI).nullable(),
});

// Ölçü birimi listesi (kart #163, SH4 a): pasif birim eski kartlarda durur, yeni kayıtta seçilemez.
export const olcuBirimleriCevabi = z.object({ birimler: z.array(z.object({ kod: z.string(), aktif: z.boolean() })) });
export type OlcuBirimleriCevabi = z.output<typeof olcuBirimleriCevabi>;

// Kartın adı (`com.ad`) ve bekleyen değişiklik talebinin önerdiği ad: kart bütün olarak saklandığı için sınır burada; ekranın
// kurduğu ad bunun çok altındadır, sınır yalnız elle ya da uçtan gelen aşırı uzun adı keser.
export const KATALOG_KART_ADI_EN_COK = 200;
const nesneMi = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const kartAdi = (kayit: unknown): unknown => (nesneMi(kayit) && nesneMi(kayit['com']) ? kayit['com']['ad'] : undefined);
const kartKaydi = katalogNesnesi.superRefine((kayit, ctx) => {
  const talep = kayit['talep'];
  const adlar: [unknown, (string | number)[]][] = [[kartAdi(kayit), ['com', 'ad']]];
  if (nesneMi(talep)) adlar.push([kartAdi(talep['yeni']), ['talep', 'yeni', 'com', 'ad']]);
  for (const [ad, yol] of adlar) {
    if (typeof ad === 'string' && ad.trim().length > KATALOG_KART_ADI_EN_COK) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: yol, message: `Kart adı en çok ${KATALOG_KART_ADI_EN_COK} karakter olabilir.` });
    }
  }
});

export const katalogKartiKaydetGovdesi = z.object({
  kayit: kartKaydi,
  ozet: katalogKartiOzeti,
  // Yeni kartta null; kayıtlı kartta okunan sürüm (iki kişi aynı kartı yazarsa ikincisi 409 alır).
  surum: z.number().int().positive().nullable(),
});
export const katalogKartiKaydetCevabi = z.object({ id: z.string(), stok_kodu: z.string(), surum: z.number().int() });
// Kart listesi sayfalıdır (kart numarası sırasıyla). İptal kartın satırı gövdesiz gelir: sayfa sayfa okunurken araya düşen iptal
// sonraki sayfaları kaydırıp bir kartı atlatmasın; önbellekteki kart da böyle düşer. Ekran iptal kartları göstermez.
// `sonra` verilirse yalnız o andan sonra değişen kartlar gelir (istemcinin oturum önbelleği); `an` bir sonraki istekte
// `sonra` olarak geri gönderilecek okuma anıdır.
export const katalogKartlariSorgusu = z.object({ ...sayfaSorguAlanlari, sonra: zamanSemasi.optional() });
export const katalogKartlariCevabi = listeCevapSemasi(
  // `no`: kartın sayı kimliği; köprü öteki modüllerin uçlarına kartı bununla sorar (satın almanın kg fiyatı).
  z.object({ kimlik: z.string(), no: z.number().int(), kayit: katalogNesnesi.nullable(), surum: z.number().int() }),
).extend({ an: zamanSemasi });
export const katalogKimlikCevabi = z.object({ id: z.string() });
// 2114b: Logo'ya gönderilmiş kartın silinmesi Logo'da pasife alınmayı bekler (kart o sürede pasif; Logo'dan silinmez); öbür kart hemen silinir.
export const katalogKartiIptalCevabi = z.object({ id: z.string(), logodaPasifeAliniyor: z.boolean() });
export type KatalogKartiIptalCevabi = z.output<typeof katalogKartiIptalCevabi>;
// 233 a: rotası olan kartın operasyon ve reçetesi Reçete ve Rota'da düzenlenir; ekran kartta salt okunur gösterir.
export const katalogKartiRotasiCevabi = z.object({ rotali: z.boolean() });
export type KatalogKartiRotasiCevabi = z.infer<typeof katalogKartiRotasiCevabi>;

// Kartın tedarikçisi finanstaki firmadan seçilir (kart #466): aktif tedarikçi firmalar adla aranır.
export const firmaSecenekleriSorgusu = z.object({ ara: z.string().trim().min(2).max(80) });
export const firmaSecenekleriCevabi = z.object({ firmalar: z.array(z.object({ id: z.number().int(), ad: z.string(), kod: z.string().nullable() })) });
export type FirmaSecenekleriCevabi = z.output<typeof firmaSecenekleriCevabi>;
// 885 a: demirbaş kartının ölçü aleti Kalibrasyon'dan seçilir; vade ve durum oradan okunur (kart yalnız numarayı tutar).
export const olcuAletiSecenekleriCevabi = z.object({
  aletler: z.array(z.object({
    no: z.string(), tur: z.string(), vade: z.string().nullable(), durum: aletDurumu,
  })),
});
export type OlcuAletiSecenekleriCevabi = z.output<typeof olcuAletiSecenekleriCevabi>;

// Şablon ve ayar son okunan sürümle yazılır; arada başkası yazmışsa 409 döner (kullanıcı onayı 16.10.2026). Yeni kayıt sürümsüz gelir;
// sürümsüz istek kayıtlı satırın üstüne yazamaz, böylece eski istemci de sessizce ezemez.
const okunanSurum = z.number().int().positive().nullable().prefault(null);
export const katalogSurumluKayitCevabi = z.object({ id: z.string(), surum: z.number().int() });

export const katalogSablonlariCevabi = z.object({
  sablonlar: z.array(katalogNesnesi), surumler: z.record(z.string(), z.number().int()), kaldirabilir: z.array(z.string()),
});
export const katalogSablonuKaydetGovdesi = z.object({ sablon: katalogNesnesi, surum: okunanSurum });

export const katalogAyarKaydetGovdesi = z.object({ deger: katalogNesnesi, surum: okunanSurum });
export const katalogAyarlariCevabi = z.object({
  surumler: z.object({ malzeme: z.number().int().nullable(), operasyonlar: z.number().int().nullable(), genel: z.number().int().nullable() }),
  malzeme: katalogNesnesi.nullable(),
  operasyonlar: katalogNesnesi.nullable(),
  // MKK-18 (A7, #515): operasyon kataloğunun esası istasyonların operasyon tipleridir; katalog ekranı bunu salt okunur gösterir.
  // Pasifler de gelir: eski kartın operasyonu adıyla görünsün.
  operasyonTipleri: z.array(z.object({ kod: z.string(), ad: z.string(), grup: z.string(), grupAdi: z.string(), aktif: z.boolean() })),
  genel: katalogNesnesi.nullable(),
  // Sistem Ayarları'ndaki malzemeler.dort-goz; prototipin kendi dört göz ayarının yerine geçer.
  dortGoz: z.boolean(),
  // Prototipin rolü, kullanıcının TMI işlemlerinden; işlemi olmayan salt okur.
  rol: z.enum(KATALOG_ROLLERI).nullable(),
  ayarYazabilir: z.boolean(),
});

/* ---------------- Logo'ya gönderime hazırlık (kart #232) ----------------
   Gönderimi bağlantı işi yapar; burada yalnız durum ve TMI türü/birimi karşılığında Logo kart türü ve birim seti. */

// Tablo kısıtıyla (`malzeme_katalog_karti_logo_durumu`) aynı üç değer.
export const LOGO_GONDERIM_DURUMLARI = ['bekliyor', 'gonderildi', 'hata'] as const;
export const LOGO_PASIF_DURUMLARI = ['bekliyor', 'hata', 'reddedildi', 'tamam'] as const;
// Kartın Logo'ya gidebilmesi için gerekenler (MKL-4); eksik kart aktif olur, gönderilmez.
export const LOGO_EKSIKLERI = ['stok_kodu', 'ad', 'birim', 'tur_karsiligi', 'birim_karsiligi'] as const;
export const LOGO_KARSILIK_CESITLERI = ['tur', 'birim'] as const;

// Logo kart türü kodları (kart #207 kılavuzu; kullanıcı kararı LB2 a): demirbaş (Logo 4) şimdilik gönderilmez, karşılığı boş kalır.
// Ticari mal (Logo 1, kart #1218) yalnız ticari mal türünün karşılığıdır. Kısıt `malzeme_logo_karsiligi_izinli` aynı değerleri tutar.
export const LOGO_KART_TURLERI = [
  { kod: '10', ad: 'Hammadde' },
  { kod: '11', ad: 'Yarı mamul' },
  { kod: '12', ad: 'Mamul' },
  { kod: '13', ad: 'Tüketim malı' },
  { kod: '1', ad: 'Ticari mal' },
] as const;

const logoDegeri = z.string().trim().min(1).max(40);
export const logoKarsiligi = z.object({
  cesit: z.enum(LOGO_KARSILIK_CESITLERI),
  tmiDegeri: logoDegeri,
  // Boş: karşılık yok (kart "eksik" sayılır). Logo kodu boşluk taşımaz.
  logoDegeri: logoDegeri.regex(/^\S+$/, 'Logo kodu boşluk taşımaz.').nullable(),
});
export const logoKarsiligiKaydetGovdesi = logoKarsiligi;

export const logoDurumuCevabi = z.object({
  // Durumu olan kartlar: eksikli olanlar üstte, sonra hatalı, bekleyen ve gönderilmiş.
  kartlar: z.array(z.object({
    id: z.number().int(),
    kod: z.string(),
    ad: z.string().nullable(),
    tur: z.enum(KATALOG_TURLERI),
    birim: z.string().nullable(),
    durum: z.enum(LOGO_GONDERIM_DURUMLARI),
    eksikler: z.array(z.enum(LOGO_EKSIKLERI)),
    hata: z.string().nullable(),
    zaman: zamanSemasi.nullable(),
    kayitNo: z.string().nullable(),
    // Logo'ya gitmiş kartın ad güncellemesi (kart #783); hiç istenmemişse null.
    guncelleme: z.object({ durum: z.enum(LOGO_GONDERIM_DURUMLARI), hata: z.string().nullable(), zaman: zamanSemasi }).nullable(),
    // Logo'da pasife alma (2114b); istenmemişse null. Ret kalıcıdır: kart pasif kalır, neden burada görünür. tamam: Logo'da kullanım dışı.
    pasif: z.object({ durum: z.enum(LOGO_PASIF_DURUMLARI), hata: z.string().nullable(), zaman: zamanSemasi }).nullable(),
  })),
  // Türün beş satırı her zaman; birim satırları kartlarda geçen ve karşılığı yazılmış birimlerdir.
  karsiliklar: z.array(logoKarsiligi),
  // Tür karşılığında seçilebilen Logo kart türleri (istemci sözleşme değerini ithal etmez, listeyi cevaptan alır).
  kartTuruSecenekleri: z.array(z.object({ kod: z.string(), ad: z.string() })),
  karsilikYazabilir: z.boolean(),
});

export type KatalogTuru = (typeof KATALOG_TURLERI)[number];
export type HizmetYonu = (typeof HIZMET_YONLERI)[number];
export type KatalogOnayDurumu = (typeof KATALOG_ONAY_DURUMLARI)[number];
export type KatalogKartDurumu = (typeof KATALOG_KART_DURUMLARI)[number];
export type KatalogRolu = (typeof KATALOG_ROLLERI)[number];
export type KatalogMalzemeOzeti = z.output<typeof katalogMalzemeOzeti>;
export type KatalogKartiKaydetGovdesi = z.input<typeof katalogKartiKaydetGovdesi>;
export type KatalogKartiKaydetCevabi = z.output<typeof katalogKartiKaydetCevabi>;
export type KatalogKartlariCevabi = z.output<typeof katalogKartlariCevabi>;
export type KatalogSablonlariCevabi = z.output<typeof katalogSablonlariCevabi>;
export type KatalogSurumluKayitCevabi = z.output<typeof katalogSurumluKayitCevabi>;
export type KatalogAyarlariCevabi = z.output<typeof katalogAyarlariCevabi>;
export type LogoGonderimDurumu = (typeof LOGO_GONDERIM_DURUMLARI)[number];
export type LogoEksik = (typeof LOGO_EKSIKLERI)[number];
export type LogoKarsilikCesidi = (typeof LOGO_KARSILIK_CESITLERI)[number];
export type LogoKarsiligi = z.output<typeof logoKarsiligi>;
export type LogoDurumuCevabi = z.output<typeof logoDurumuCevabi>;

// Ana sayfa panosu: her sayı kendi işlemiyle dolar; işlemi olmayana null (sıfır uydurulmaz).
export const malzemelerOzetiCevabi = z.object({
  // Onaydaki yeni kartlar ile bekleyen değişiklik talepleri; onaylayan ikisini de katalogda karara bağlar.
  onayBekleyen: z.number().int().nullable(),
});
export type MalzemelerOzetiCevabi = z.output<typeof malzemelerOzetiCevabi>;

// Ortak seçicinin (MalzemeSecici) arama ucu (kart #1319): stok kodunda ya da adda arar; sayfa başına MALZEME_SECIM_SAYFA_BOYU kart.
// Cevap ortak seçici biçimindedir (`ust` malzemede yok). Varsayılan yalnız aktif kartlar.
export const MALZEME_SECIM_SAYFA_BOYU = 30;
export const malzemeSecimSorgusu = z.object({
  q: z.string().trim().max(80).prefault(''),
  tur: z.enum(KATALOG_TURLERI).optional(),
  pasifler: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
  sayfa: z.coerce.number<number>().int().min(1).max(1000).prefault(1),
});
export const malzemeSecimCevabi = z.object({
  sonuclar: z.array(z.object({
    id: z.number().int(),
    kod: z.string(),
    ad: z.string(),
    aktif: z.boolean(),
    ust: z.null(),
  })),
  dahaVar: z.boolean(),
});
export type MalzemeSecimSorgusu = z.input<typeof malzemeSecimSorgusu>;
export type MalzemeSecimCevabi = z.output<typeof malzemeSecimCevabi>;

/* ---------------- Demirbaş teknik bilgisi (1595; 1596 teyit a, 1597 a) ----------------
   Sınırlar tipli alandır (ölçü mm, yük kg, devir dev/dk, güç kW, tüketim kWh/saat); bilinmeyen alan null'dır. Nadir alanlar serbest listededir.
   Fiyat ve amortisman burada değil, finansın sabit kıymet kaydındadır; kart ona bağlı makine üzerinden ulaşır. */
export const DEMIRBAS_TEZGAH_TURLERI = ['dik_isleme', 'yatay_isleme', 'bes_eksen', 'torna', 'torna_freze', 'taslama', 'erozyon', 'diger'] as const;
export type DemirbasTezgahTuru = (typeof DEMIRBAS_TEZGAH_TURLERI)[number];
const olcu = (ust: number) => z.number().positive('Değer sıfırdan büyük olmalı.').max(ust, `En çok ${ust}.`).nullable();
const tamSayi = (alt: number, ust: number) => z.number().int('Tam sayı girin.').min(alt, `En az ${alt}.`).max(ust, `En çok ${ust}.`).nullable();
const tuketim = z.number().min(0, 'Tüketim eksi olamaz.').max(999999.99, 'En çok 999999,99.').nullable();
export const demirbasTeknikAlanlari = z.object({
  tezgahTuru: z.enum(DEMIRBAS_TEZGAH_TURLERI).nullable(),
  eksenSayisi: tamSayi(1, 12),
  xKursuMm: olcu(9999999), yKursuMm: olcu(9999999), zKursuMm: olcu(9999999),
  tablaEnMm: olcu(9999999), tablaBoyMm: olcu(9999999), tablaYukuKg: olcu(99999999),
  azamiDevir: tamSayi(1, 100000),
  isMiliGucuKw: olcu(99999),
  isMiliKonigi: z.string().trim().min(1).max(40, 'En çok 40 karakter.').nullable(),
  takimCebi: tamSayi(1, 999),
  tornalamaCapiMm: olcu(9999999), tornalamaBoyuMm: olcu(9999999), cubukGecisCapiMm: olcu(9999999),
  konumlamaHassasiyetiMm: olcu(999),
  calismaTuketimiKwh: tuketim, beklemeTuketimiKwh: tuketim,
});
export type DemirbasTeknikAlanlari = z.output<typeof demirbasTeknikAlanlari>;
export const DEMIRBAS_OZELLIK_SINIRI = 50;
export const demirbasOzelligi = z.object({
  ad: z.string().trim().min(1, 'Özellik adı boş olamaz.').max(80, 'En çok 80 karakter.'),
  deger: z.string().trim().min(1, 'Değer boş olamaz.').max(200, 'En çok 200 karakter.'),
  birim: z.string().trim().max(20, 'En çok 20 karakter.').nullable().transform((v) => (v === null || v === '' ? null : v)),
});
export type DemirbasOzelligi = z.output<typeof demirbasOzelligi>;
// İlk kayıtta sürüm null'dır; sonraki her kayıt okunan sürümü taşır.
export const demirbasTeknikKaydetGovdesi = z.object({
  surum: surumSemasi.nullable(),
  makineId: z.number().int().positive().nullable(),
  alanlar: demirbasTeknikAlanlari,
  ozellikler: z.array(demirbasOzelligi).max(DEMIRBAS_OZELLIK_SINIRI, `En çok ${DEMIRBAS_OZELLIK_SINIRI} özellik.`),
}).strict();
export type DemirbasTeknikKaydetGovdesi = z.input<typeof demirbasTeknikKaydetGovdesi>;
export const demirbasMakinesi = z.object({ id: z.number().int(), kod: z.string(), ad: z.string(), aktif: z.boolean() });
export const demirbasTeknikCevabi = z.object({
  // Kayıt yoksa null: kartın teknik bilgisi girilmemiş.
  teknik: z.object({
    surum: surumSemasi, alanlar: demirbasTeknikAlanlari, ozellikler: z.array(demirbasOzelligi),
    makine: demirbasMakinesi.nullable(), guncelleme: zamanSemasi,
  }).nullable(),
});
export type DemirbasTeknikCevabi = z.output<typeof demirbasTeknikCevabi>;
// Bağlanabilecek makineler: başka karta bağlı olan, o kartın kimliğiyle döner.
export const demirbasMakineSecenekleriCevabi = z.object({
  makineler: z.array(demirbasMakinesi.extend({ bagliKart: z.string().nullable() })),
});
export type DemirbasMakineSecenekleriCevabi = z.output<typeof demirbasMakineSecenekleriCevabi>;

/* ---------------- Logo'dan gelen kartlar (2116; kararlar 2116-2 a, 2116-3 c, 2116-4 a) ---------------- */
// Logo'daki kart TMI'de: yok (alınabilir), bağsız aynı kodlu kart var (bağlanır, yeniden gönderilmez) ya da bağlı (fark listelenir).
export const LOGO_GELEN_DURUMLARI = ['yeni', 'bagsiz', 'bagli'] as const;
export const LOGO_FARK_ALANLARI = ['aciklama_1', 'aciklama_2', 'aciklama_3'] as const;
export const LOGO_GELEN_SAYFA_BOYU = 100;
export const logoGelenSorgusu = z.object({
  // Logo kayıt numarası imleci: bu numaradan sonrakiler.
  sonra: z.coerce.number<number>().int().min(0).prefault(0),
  // Kod, ad ya da açıklamanın bir parçası (2116g); büyük/küçük harf ve Türkçe harf farkı gözetilmez.
  ara: z.string().trim().min(2, 'En az 2 karakter yazın.').max(100).optional(),
});
export const logoGelenParametresi = z.object({ ref: z.coerce.number<number>().int().positive() });
export const logoGelenCevabi = z.object({
  // Logo malzeme okuması bağlı değilse ya da hiç okumadıysa false: liste boş, neden ekranda.
  baglanti: z.boolean(),
  kartlar: z.array(z.object({
    logoKayitNo: z.number().int(),
    kod: z.string(),
    ad: z.string().nullable(),
    aciklama2: z.string().nullable(),
    aciklama3: z.string().nullable(),
    // Logo kart türü kodu (ITEMS.CARDTYPE) ve birim seti kodu; TMI karşılığını istemci karşılık listesinden önerir.
    kartTuru: z.string().nullable(),
    birimSeti: z.string().nullable(),
    aktif: z.boolean(),
    sonOkuma: zamanSemasi,
    durum: z.enum(LOGO_GELEN_DURUMLARI),
    // Logo kodu TMI kod biçimine uyuyor mu; uymuyorsa alırken önek seçilir, eşleme tutulur (2116-3 c).
    koduUyar: z.boolean(),
    tmi: z.object({
      kimlik: z.string(), stokKodu: z.string(), ad: z.string().nullable(), onayDurumu: z.enum(KATALOG_KART_DURUMLARI), surum: surumSemasi,
      // Logo'ya gönderilmiş (Logo kaydı olan) kartın kodu değişmez; yeni koda geçiş sunulmaz (2116h).
      logoKayitli: z.boolean(),
    }).nullable(),
    farklar: z.array(z.object({ alan: z.enum(LOGO_FARK_ALANLARI), logo: z.string().nullable(), tmi: z.string().nullable() })),
  })),
  sonraki: z.number().int().nullable(),
});
export type LogoGelenCevabi = z.output<typeof logoGelenCevabi>;
export type LogoGelenDurumu = (typeof LOGO_GELEN_DURUMLARI)[number];
export const logodanAlGovdesi = z.object({
  tur: z.enum(LOGO_TUR_KARSILIGI_TURLERI),
  birim: z.string().trim().min(1).max(40),
  // Logo kodu TMI biçimine uymuyorsa yeni kodun öneki (ör. HM-GEN-); uyuyorsa yok sayılır.
  onek: z.string().trim().max(20).nullable(),
}).strict();
export type LogodanAlGovdesi = z.input<typeof logodanAlGovdesi>;
export const logodanAlCevabi = z.object({ id: z.string(), stok_kodu: z.string(), eslendi: z.boolean() });
export type LogodanAlCevabi = z.output<typeof logodanAlCevabi>;
// Bağlama ve farkı alma kartın sürümüyle: arada kartı değiştiren varsa reddedilir.
export const logoKartSurumGovdesi = z.object({ surum: surumSemasi }).strict();
export const logoKartSurumCevabi = z.object({ id: z.string(), surum: surumSemasi });
// 2116h: aynı kodlu TMI kartı Logo'dakinden farklı malzemeyse yeni koda geçer; eski kod kartta "önceki kod" olarak kalır.
export const logoYeniKodCevabi = z.object({ id: z.string(), stok_kodu: z.string(), eski_kod: z.string(), surum: surumSemasi });
export type LogoYeniKodCevabi = z.output<typeof logoYeniKodCevabi>;

/* ---------------- Logo geçişi (3068): Logo kartları CORE karşılığıyla yan yana, süzgeç ve toplu işlem adaylığı ---------------- */
// Süzgeçler sunucuda uygulanır: istemciye bütün ayna inmez. "stoklu" Logo stok toplamı sıfırdan büyük karttır (aynadaki stok okuması).
// "kullanilan" (3079 a): stoklu, son 12 ayda hareketi olan ya da açık siparişte geçen; yalnız kullanım izi okunduysa anlamlıdır.
export const LOGO_GECIS_SUZGECLERI = ['kullanilan', 'stoklu', 'tumu', 'yeni', 'bagsiz', 'bagli', 'kullanim-disi'] as const;
export const LOGO_KULLANIM_NEDENLERI = ['stok', 'hareket', 'siparis'] as const;
export type LogoGecisSuzgeci = (typeof LOGO_GECIS_SUZGECLERI)[number];
// Toplu işleme girmeyen satırın nedeni: kullanıcı satırda tek tek karar verir.
export const LOGO_GECIS_KARAR_NEDENLERI = ['birim-farki', 'kod-eslenecek', 'kullanim-disi', 'iptal-kart'] as const;
export const logoGecisSorgusu = z.object({
  // Boşsa sunucu seçer: kullanım izi okunduysa "kullanilan", okunmadıysa "stoklu" (cevaptaki suzgec).
  suzgec: z.enum(LOGO_GECIS_SUZGECLERI).optional(),
  ara: z.string().trim().min(2, 'En az 2 karakter yazın.').max(100).optional(),
  sayfa: z.coerce.number<number>().int().min(0).max(100_000).prefault(0),
});
const logoGecisSayilari = z.object({
  toplam: z.number().int(), stoklu: z.number().int(), yeni: z.number().int(), bagsiz: z.number().int(), bagli: z.number().int(),
  kullanimDisi: z.number().int(),
  // Kullanım izi okunmadıysa null.
  kullanilan: z.number().int().nullable(),
  // Toplu işleme girmeyen, tek tek karar isteyen satırlar.
  kararBekleyen: z.number().int(),
});
export const logoGecisCevabi = z.object({
  // Logo malzeme okuması bağlı değilse false: liste boş, neden ekranda.
  baglanti: z.boolean(),
  // Ayna okuması: açık mı, tur sürüyor mu (sayılar artabilir), okunan kart ve son tam tur.
  okuma: z.object({ acik: z.boolean(), suruyor: z.boolean(), okunan: z.number().int().nullable(), sonTamam: zamanSemasi.nullable() }),
  sayilar: logoGecisSayilari,
  // Uygulanan süzgeç ve kullanım izinin (3079 a) en az bir tam turda okunup okunmadığı.
  suzgec: z.enum(LOGO_GECIS_SUZGECLERI),
  kullanim: z.boolean(),
  // 3080 a: listede olmayan kart Logo'da aranabilir mi ("Logo: malzeme araması" ve bağlantı açık).
  canliArama: z.boolean(),
  // Süzgece ve aramaya uyan satır sayısı ("süzgece uyan hepsini seç").
  uyan: z.number().int(),
  kartlar: z.array(z.object({
    logoKayitNo: z.number().int(),
    kod: z.string(),
    ad: z.string().nullable(),
    birimSeti: z.string().nullable(),
    kartTuru: z.string().nullable(),
    aktif: z.boolean(),
    // Logo stok toplamı (bütün ambarlar), ondalık metin; stok okuması yoksa null.
    stok: z.string().nullable(),
    // 3079 a: son malzeme hareketi (gün) ve "Kullanılanlar" nedeni; kullanım izi okunmadıysa nedenler null.
    sonHareket: tarihSemasi.nullable(),
    kullanimNedenleri: z.array(z.enum(LOGO_KULLANIM_NEDENLERI)).nullable(),
    durum: z.enum(LOGO_GELEN_DURUMLARI),
    koduUyar: z.boolean(),
    topluBaglanir: z.boolean(),
    topluAlinir: z.boolean(),
    kararNedeni: z.enum(LOGO_GECIS_KARAR_NEDENLERI).nullable(),
    tmi: z.object({
      kimlik: z.string(), stokKodu: z.string(), ad: z.string().nullable(), birim: z.string().nullable(),
      onayDurumu: z.enum(KATALOG_KART_DURUMLARI), surum: surumSemasi, logoKayitli: z.boolean(),
    }).nullable(),
    // Bağlı kartta Logo'daki açıklama farkı (2116-2 a); tek tek "Logo'dakini al" ile alınır.
    farklar: z.array(z.object({ alan: z.enum(LOGO_FARK_ALANLARI), logo: z.string().nullable(), tmi: z.string().nullable() })),
  })),
  sayfa: z.number().int(),
  sonrakiSayfa: z.number().int().nullable(),
});
export type LogoGecisCevabi = z.output<typeof logoGecisCevabi>;
// Toplu işlem (3068 a): tek işlemde en çok 200 kart; her kart kendi kayıt noktasında işlenir, olmayan atlanır ve nedeni döner.
// Bağlamada CORE kartının sürümü gelir (arada değişen kart atlanır); almada tür ve birim bir kez seçilir, boşsa satırın Logo karşılığından.
const logoTopluKartlari = z.array(z.object({ logoKayitNo: z.number().int().positive(), surum: surumSemasi.nullable() }).strict())
  .min(1).max(LOGO_TOPLU_AZAMI)
  .refine((l) => new Set(l.map((k) => k.logoKayitNo)).size === l.length, 'Aynı Logo kartı iki kez seçilmiş.');
export const logoTopluBaglaGovdesi = z.object({ kartlar: logoTopluKartlari }).strict();
export const logoTopluAlGovdesi = z.object({
  kartlar: logoTopluKartlari,
  tur: z.enum(LOGO_TUR_KARSILIGI_TURLERI).nullable(),
  birim: z.string().trim().min(1).max(40).nullable(),
}).strict();
export const logoTopluCevabi = z.object({
  // Geri alma bu kimlikle yapılır; yalnız işlemi yapan kişi geri alır.
  islem: z.uuid(),
  tur: z.enum(['bagla', 'al']),
  basarili: z.array(z.object({ logoKayitNo: z.number().int(), kod: z.string(), stokKodu: z.string() })),
  atlanan: z.array(z.object({ logoKayitNo: z.number().int(), kod: z.string(), neden: z.string() })),
});
export type LogoTopluCevabi = z.output<typeof logoTopluCevabi>;
export const logoGeriAlGovdesi = z.object({ islem: z.uuid() }).strict();
export const logoGeriAlCevabi = z.object({
  geriAlinan: z.number().int().nonnegative(),
  atlanan: z.array(z.object({ stokKodu: z.string(), neden: z.string() })),
});
export type LogoGeriAlCevabi = z.output<typeof logoGeriAlCevabi>;

// Arşiv (2114c, 2114-3 a, 2114-4 a): katalogdan silinen (iptal) kartlar ve başka modüllerdeki izleri. Kesin bağ sütun eşleşmesidir,
// olası iz kayıt içinde kartın kodu ya da numarasıdır; ikisi de kalıcı silmeyi engeller. Bağ sayımı bağlı değilse adetler null.
export const ARSIV_IZ_TURLERI = ['kesin', 'olasi'] as const;
const arsivKarti = z.object({
  kimlik: z.string(),
  no: z.number().int(),
  stokKodu: z.string(),
  ad: z.string().nullable(),
  tur: z.enum(KATALOG_TURLERI),
  silen: z.object({ id: z.number().int(), ad: z.string() }).nullable(),
  silinme: zamanSemasi,
  logoyaGitti: z.boolean(),
  kesinAdet: z.number().int().nullable(),
  olasiAdet: z.number().int().nullable(),
});
export type ArsivKarti = z.output<typeof arsivKarti>;
export const arsivKartlariCevabi = z.object({ kartlar: z.array(arsivKarti) });
export type ArsivKartlariCevabi = z.output<typeof arsivKartlariCevabi>;
export const arsivKartiCevabi = z.object({
  kart: arsivKarti,
  izler: z.array(z.object({ modul: z.string(), kayit: z.string(), tur: z.enum(ARSIV_IZ_TURLERI), adet: z.number().int(), ornek: z.string().nullable() })).nullable(),
});
export type ArsivKartiCevabi = z.output<typeof arsivKartiCevabi>;
// Kalıcı silme stok kodunu yeniden yazarak onaylanır; yanlış karta basılan düğme kartı silmesin.
export const arsivKaliciSilGovdesi = z.object({ stokKodu: z.string().trim().min(1).max(64) }).strict();
