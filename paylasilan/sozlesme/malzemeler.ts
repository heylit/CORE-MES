import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { zamanSemasi } from '../zaman.ts';
import { surumSemasi } from '../surum.ts';
import { durumSemasi as aletDurumu } from './kalibrasyon.ts';

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

export const katalogKartiKaydetGovdesi = z.object({
  kayit: katalogNesnesi,
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
const okunanSurum = z.number().int().positive().nullable().default(null);
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
  q: z.string().trim().max(80).default(''),
  tur: z.enum(KATALOG_TURLERI).optional(),
  pasifler: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
  sayfa: z.coerce.number().int().min(1).max(1000).default(1),
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
