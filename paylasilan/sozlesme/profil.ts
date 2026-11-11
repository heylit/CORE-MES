import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { MENU_SIK_SINIRI } from '../rol-gorunumleri.ts';

// Profil: her çalışanın kendi sayfası (İK bilgileri, izin, fazla mesai, şikayet/istek/öneri geçmişi) ve üst çubuktaki
// şikayet/istek/öneri kutusu. Kişi her zaman oturumdan gelir: gövde ve adres başka kişiyi seçemez.

export const GERI_BILDIRIM_KONULARI = ['sirket', 'uygulama'] as const;
export const GERI_BILDIRIM_TURLERI = ['sikayet', 'istek', 'oneri'] as const;
export type GeriBildirimKonusu = (typeof GERI_BILDIRIM_KONULARI)[number];
export type GeriBildirimTuru = (typeof GERI_BILDIRIM_TURLERI)[number];
export const GERI_BILDIRIM_METIN_EN_AZ = 3;
export const GERI_BILDIRIM_METIN_EN_COK = 2000;

export const geriBildirimGonderGovdesi = z.object({
  konu: z.enum(GERI_BILDIRIM_KONULARI),
  tur: z.enum(GERI_BILDIRIM_TURLERI),
  metin: z.string().trim()
    .min(GERI_BILDIRIM_METIN_EN_AZ, `En az ${GERI_BILDIRIM_METIN_EN_AZ} karakter yazın.`)
    .max(GERI_BILDIRIM_METIN_EN_COK, `En çok ${GERI_BILDIRIM_METIN_EN_COK} karakter yazılabilir.`),
}).strict();

export const geriBildirimSemasi = z.object({
  id: z.number().int(),
  konu: z.enum(GERI_BILDIRIM_KONULARI),
  tur: z.enum(GERI_BILDIRIM_TURLERI),
  metin: z.string(),
  gonderildi: zamanSemasi,
});
export const geriBildirimGonderCevabi = geriBildirimSemasi;

// Geri Bildirim Merkezi (kart 2192). Takip satırı olmayan kayıt "yeni" sayılır. Yanıt yazana görünür ve rol adıyla imzalanır
// (2192-2 b); iç not, sorumlu ve durum hareketi yalnız merkezdedir.
export const GERI_BILDIRIM_DURUMLARI = ['yeni', 'inceleniyor', 'yanitlandi', 'cozuldu', 'kapandi'] as const;
export type GeriBildirimDurumu = (typeof GERI_BILDIRIM_DURUMLARI)[number];
export const GERI_BILDIRIM_HAREKET_TURLERI = ['yanit', 'not', 'durum'] as const;
export const GERI_BILDIRIM_YANIT_EN_AZ = 2;
export const GERI_BILDIRIM_YANIT_EN_COK = 2000;
export const GERI_BILDIRIM_KATEGORI_AD_EN_AZ = 2;
export const GERI_BILDIRIM_KATEGORI_AD_EN_COK = 60;
export const GERI_BILDIRIM_ARAMA_EN_COK = 100;

const kimlik = z.coerce.number<number>().int().positive().max(2147483647);
export const geriBildirimIdParametresi = z.object({ id: kimlik });
const surumSemasi = z.number().int().min(0);
const yanitMetni = z.string().trim()
  .min(GERI_BILDIRIM_YANIT_EN_AZ, `En az ${GERI_BILDIRIM_YANIT_EN_AZ} karakter yazın.`)
  .max(GERI_BILDIRIM_YANIT_EN_COK, `En çok ${GERI_BILDIRIM_YANIT_EN_COK} karakter yazılabilir.`);

// Okuyanın listesi: yazanın adıyla. Süzgeç isteğe bağlı; kategoriId 0 kategorisiz kayıtları seçer.
export const geriBildirimListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  konu: z.enum(GERI_BILDIRIM_KONULARI).optional(),
  tur: z.enum(GERI_BILDIRIM_TURLERI).optional(),
  durum: z.enum(GERI_BILDIRIM_DURUMLARI).optional(),
  kategoriId: z.coerce.number<number>().int().min(0).max(2147483647).optional(),
  ara: z.string().trim().max(GERI_BILDIRIM_ARAMA_EN_COK).optional(),
});
export const geriBildirimListeSatiri = geriBildirimSemasi.extend({
  kisiAdi: z.string(),
  durum: z.enum(GERI_BILDIRIM_DURUMLARI),
  kategoriId: z.number().int().nullable(),
  kategoriAdi: z.string().nullable(),
  anaKayitId: z.number().int().nullable(),
  hareketSayisi: z.number().int().min(0),
});
export const geriBildirimListeCevabi = listeCevapSemasi(geriBildirimListeSatiri);

export const geriBildirimHareketiSemasi = z.object({
  id: z.number().int(),
  tur: z.enum(GERI_BILDIRIM_HAREKET_TURLERI),
  metin: z.string().nullable(),
  durum: z.enum(GERI_BILDIRIM_DURUMLARI).nullable(),
  // Yanıtın çalışana görünen imzası (rol adı); not ve durum satırında null.
  imza: z.string().nullable(),
  kisiAdi: z.string(),
  zaman: zamanSemasi,
});

export const geriBildirimAyrintiCevabi = z.object({
  kayit: geriBildirimListeSatiri,
  sorumluKisiId: z.number().int().nullable(),
  sorumluAdi: z.string().nullable(),
  // Takip satırının sürümü; satır yoksa 0 (ilk yazım bu sürümle).
  surum: z.number().int().min(0),
  hareketler: z.array(geriBildirimHareketiSemasi),
  // Bu kayda ana kayıt olarak bağlananlar.
  baglilar: z.array(z.object({ id: z.number().int(), tur: z.enum(GERI_BILDIRIM_TURLERI), metin: z.string(), durum: z.enum(GERI_BILDIRIM_DURUMLARI) })),
});

export const geriBildirimYanitlaGovdesi = z.object({ metin: yanitMetni, surum: surumSemasi }).strict();
export const geriBildirimNotGovdesi = z.object({ metin: yanitMetni }).strict();
export const geriBildirimTakipGovdesi = z.object({
  durum: z.enum(GERI_BILDIRIM_DURUMLARI),
  kategoriId: kimlik.nullable(),
  sorumluKisiId: kimlik.nullable(),
  anaKayitId: kimlik.nullable(),
  surum: surumSemasi,
}).strict();

export const geriBildirimKategorisiSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  konu: z.enum(GERI_BILDIRIM_KONULARI).nullable(),
  etkin: z.boolean(),
  surum: z.number().int().positive(),
  kayitSayisi: z.number().int().min(0),
});
const kategoriAdi = z.string().trim()
  .min(GERI_BILDIRIM_KATEGORI_AD_EN_AZ, `En az ${GERI_BILDIRIM_KATEGORI_AD_EN_AZ} karakter yazın.`)
  .max(GERI_BILDIRIM_KATEGORI_AD_EN_COK, `En çok ${GERI_BILDIRIM_KATEGORI_AD_EN_COK} karakter yazılabilir.`);
export const geriBildirimKategoriEkleGovdesi = z.object({ ad: kategoriAdi, konu: z.enum(GERI_BILDIRIM_KONULARI).nullable() }).strict();
export const geriBildirimKategoriGuncelleGovdesi = z.object({
  ad: kategoriAdi, konu: z.enum(GERI_BILDIRIM_KONULARI).nullable(), etkin: z.boolean(), surum: z.number().int().positive(),
}).strict();

// Merkezin seçim listeleri: bütün kategoriler (pasifler dahil, ekran süzer) ve yanıtlama işlemi olan etkin kişiler.
export const geriBildirimSecenekleriCevabi = z.object({
  kategoriler: z.array(geriBildirimKategorisiSemasi),
  sorumlular: z.array(z.object({ id: z.number().int(), ad: z.string() })),
});

// Toplam ve eğilim: duruma ve kategoriye göre sayılar; son altı ayın gelen, çözülen ve ilk yanıta kadar geçen süresi.
// İlk yanıt süresi yalnız yanıtlanmış kayıtlardan; yanıtlanan yoksa null.
export const geriBildirimOzetiCevabi = z.object({
  durumlar: z.record(z.enum(GERI_BILDIRIM_DURUMLARI), z.number().int().min(0)),
  kategoriler: z.array(z.object({
    kategoriId: z.number().int().nullable(),
    ad: z.string().nullable(),
    sikayet: z.number().int().min(0), istek: z.number().int().min(0), oneri: z.number().int().min(0), acik: z.number().int().min(0),
  })),
  aylar: z.array(z.object({
    ay: z.string().regex(/^\d{4}-\d{2}$/),
    gelen: z.number().int().min(0),
    cozulen: z.number().int().min(0),
    ilkYanitOrtancaSaat: z.number().nullable(),
  })),
});

// Çalışanın kendi geçmişi: durum ve yanıtlar (imzasıyla). İç not ve sorumlu yoktur.
export const kendiGeriBildirimSemasi = geriBildirimSemasi.extend({
  durum: z.enum(GERI_BILDIRIM_DURUMLARI),
  yanitlar: z.array(z.object({ metin: z.string(), imza: z.string(), zaman: zamanSemasi })),
});

const metinVeyaYok = z.string().nullable();
export const profilCevabi = z.object({
  kisi: z.object({ id: z.number().int(), ad: z.string(), gorev: metinVeyaYok }),
  // İK'nın girdiği kart; kişi bir personel kaydına bağlı değilse null.
  personel: z.object({
    ad: z.string(), sicilNo: metinVeyaYok, pozisyon: metinVeyaYok, departman: metinVeyaYok, yonetici: metinVeyaYok,
    iseGiris: tarihSemasi.nullable(), calismaSekli: metinVeyaYok, telefon: metinVeyaYok, eposta: metinVeyaYok, adres: metinVeyaYok,
    acilKisi: metinVeyaYok, acilYakinlik: metinVeyaYok, acilTelefon: metinVeyaYok,
  }).nullable(),
  izin: z.object({
    hakGun: z.number().nullable(), kalanGun: z.number().nullable(), kullanilanGun: z.number(), bekleyenGun: z.number(),
    sonrakiHakTarihi: tarihSemasi.nullable(), sonrakiHakGun: z.number().nullable(),
  }).nullable(),
  // Son bir yıl ve önümüzdeki izinler, yeniden eskiye.
  izinler: z.array(z.object({
    tur: z.string(), baslangic: tarihSemasi, bitis: tarihSemasi, gun: z.number().nullable(),
    durum: z.enum(['Beklemede', 'Onaylandı', 'Reddedildi', 'İptal']),
  })).nullable(),
  // Bu yılın fazla mesaisi (fazla mesai, hafta tatili ve resmi tatil çalışması), yeniden eskiye.
  fazlaMesai: z.object({
    satirlar: z.array(z.object({ tarih: tarihSemasi, tur: z.string(), saat: z.number().nullable(), onay: z.enum(['Onaylandı', 'Beklemede']).nullable() })),
    toplamSaat: z.number().nullable(),
    yillikSinirSaat: z.number().nullable(),
  }).nullable(),
  geriBildirimler: z.array(kendiGeriBildirimSemasi),
  // Okuyan kutusunu açabilir mi (profil.geri-bildirim-oku); yalnız bağlantıyı göstermek içindir, yetki uçtadır.
  geriBildirimOkur: z.boolean(),
});

// Görünüm teması (karar 2072 a): kişi kendi profilinde seçer. kontrast yüksek kontrastlı koyu, gun gün ışığı (yüksek
// kontrastlı açık) temadır. Kaydı olmayan kişide tema null ve sürüm 0: istemci cihazdaki son temayı kullanır.
export const TEMALAR = ['light', 'dark', 'kontrast', 'gun'] as const;
export type TemaTercihi = (typeof TEMALAR)[number];
export const temaCevabi = z.object({ tema: z.enum(TEMALAR).nullable(), surum: z.number().int().min(0) });
// surum okunan sürümdür; ilk seçimde 0.
export const temaSecGovdesi = z.object({ tema: z.enum(TEMALAR), surum: z.number().int().min(0) }).strict();

// Mini pano seçimi (2425-3 a): kişi kendi profilinde hangi mini panoyu görmek istemediğini seçer. Kapatılanlar tutulur:
// sonradan gelen yeni pano kendiliğinden açık olur; kaydı olmayan kişide hepsi açık, sürüm 0. Pano anahtarlarını
// istemcideki modüller bildirir; sunucu yalnız biçimi denetler, yetki her panonun kendi veri ucundadır.
export const MINI_PANO_SINIRI = 50;
const miniPanoAnahtari = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
export const miniPanoCevabi = z.object({
  kapali: z.array(z.string()),
  acilistaOner: z.boolean(),
  surum: z.number().int().min(0),
});
// surum okunan sürümdür; ilk seçimde 0.
export const miniPanoSecGovdesi = z.object({
  kapali: z.array(miniPanoAnahtari).max(MINI_PANO_SINIRI).refine((l) => new Set(l).size === l.length, 'Aynı pano iki kez yazılamaz'),
  acilistaOner: z.boolean(),
  surum: z.number().int().min(0),
}).strict();

// Menü sık kullanılanları (2951): kişi ana menünün üstünde duracak sayfaları kendi seçer ve sıralar; kaydı olmayan kişide
// liste boş, sürüm 0. Yalnız görünürlüktür: sunucu bilinmeyen yolu reddeder, listeyi kişinin açabildiği sayfalara süzer;
// yetki her sayfanın kendi işlemindedir.
const menuSayfaYolu = z.string().regex(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/).max(80);
export const menuTercihiCevabi = z.object({
  sayfalar: z.array(z.string()),
  surum: z.number().int().min(0),
});
// surum okunan sürümdür; ilk seçimde 0.
export const menuSecGovdesi = z.object({
  sayfalar: z.array(menuSayfaYolu).max(MENU_SIK_SINIRI).refine((l) => new Set(l).size === l.length, 'Aynı sayfa iki kez seçilemez'),
  surum: z.number().int().min(0),
}).strict();

export type GeriBildirimGonderGovdesi = z.input<typeof geriBildirimGonderGovdesi>;
export type GeriBildirim = z.output<typeof geriBildirimSemasi>;
export type GeriBildirimListeSorgusu = z.input<typeof geriBildirimListeSorgusu>;
export type GeriBildirimListeCevabi = z.output<typeof geriBildirimListeCevabi>;
export type GeriBildirimListeSatiri = z.output<typeof geriBildirimListeSatiri>;
export type GeriBildirimHareketi = z.output<typeof geriBildirimHareketiSemasi>;
export type GeriBildirimAyrintiCevabi = z.output<typeof geriBildirimAyrintiCevabi>;
export type GeriBildirimYanitlaGovdesi = z.input<typeof geriBildirimYanitlaGovdesi>;
export type GeriBildirimNotGovdesi = z.input<typeof geriBildirimNotGovdesi>;
export type GeriBildirimTakipGovdesi = z.input<typeof geriBildirimTakipGovdesi>;
export type GeriBildirimKategorisi = z.output<typeof geriBildirimKategorisiSemasi>;
export type GeriBildirimKategoriEkleGovdesi = z.input<typeof geriBildirimKategoriEkleGovdesi>;
export type GeriBildirimKategoriGuncelleGovdesi = z.input<typeof geriBildirimKategoriGuncelleGovdesi>;
export type GeriBildirimSecenekleriCevabi = z.output<typeof geriBildirimSecenekleriCevabi>;
export type GeriBildirimOzetiCevabi = z.output<typeof geriBildirimOzetiCevabi>;
export type KendiGeriBildirimi = z.output<typeof kendiGeriBildirimSemasi>;
export type ProfilCevabi = z.output<typeof profilCevabi>;
export type TemaCevabi = z.output<typeof temaCevabi>;
export type MiniPanoCevabi = z.output<typeof miniPanoCevabi>;
export type MiniPanoSecGovdesi = z.output<typeof miniPanoSecGovdesi>;
export type MenuTercihiCevabi = z.output<typeof menuTercihiCevabi>;
export type MenuSecGovdesi = z.output<typeof menuSecGovdesi>;
export type TemaSecGovdesi = z.input<typeof temaSecGovdesi>;
