import { z } from 'zod';
import { agAraligiHatasi } from '../ag-araligi.ts';
import { METIN_BICIMLERI } from '../ayar-tanimi.ts';
import type { AyarTanimi } from '../ayar-tanimi.ts';
import { istekKimligiMi } from '../istek-kimligi.ts';
import { kalipHatasi } from '../numara.ts';
import { zamanSemasi } from '../zaman.ts';

export const SAYI_ONDALIK_EN_COK = 6;

// Kesir basamağı sayısı ondalık sınırını aşmıyorsa değer o basamağa yuvarlanınca değişmez.
const basamakUyar = (deger: number, ondalik: number): boolean => Number(deger.toFixed(ondalik)) === deger;

const sayiBicimi = (deger: number, ondalik: number): string =>
  deger.toLocaleString('tr-TR', { maximumFractionDigits: ondalik });

// Yazılan ve saklanan değer tanımın türü ve sınırlarıyla doğrulanır; yeni tür buraya şemasıyla girer.
export function ayarDegerSemasi(tanim: AyarTanimi): z.ZodType<boolean | number | string | null> {
  if (tanim.tur === 'numara') {
    const { alanlar } = tanim;
    return z
      .string({ required_error: 'Değer zorunlu.', invalid_type_error: 'Bu ayar numara kalıbıdır.' })
      .superRefine((kalip, ctx) => {
        const hata = kalipHatasi(kalip, alanlar);
        if (hata !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: hata });
      });
  }
  if (tanim.tur === 'secim') {
    const degerler = tanim.secenekler.map((s) => s.deger);
    return z
      .string({ required_error: 'Değer zorunlu.', invalid_type_error: 'Bu ayar listedeki seçeneklerden biri olabilir.' })
      .refine((d) => degerler.includes(d), 'Bu değer listede yok.');
  }
  if (tanim.tur === 'boolean') {
    return z.boolean({ required_error: 'Değer zorunlu.', invalid_type_error: 'Bu ayar yalnız açık ya da kapalı olabilir.' });
  }
  if (tanim.tur === 'metin') {
    // Baştaki ve sondaki boşluk saklanmaz: aynı görünen iki metin ayrı değer sayılmasın.
    const { bicim, bosOlabilir } = tanim;
    return z
      .string({ required_error: 'Değer zorunlu.', invalid_type_error: 'Bu ayar yalnız metin olabilir.' })
      .trim()
      .min(bosOlabilir === true ? 0 : 1, 'Metin boş olamaz.')
      .max(tanim.enUzun, `En çok ${String(tanim.enUzun)} karakter olabilir.`)
      .superRefine((metin, ctx) => {
        const hata = bicim === 'ag-araligi' ? agAraligiHatasi(metin) : null;
        if (hata !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: hata });
      });
  }
  const { enAz, enCok, ondalik } = tanim;
  return z
    .number({ required_error: 'Değer zorunlu; boş bırakmak için null gönderin.', invalid_type_error: 'Bu ayar sayı ya da boş olabilir.' })
    .finite('Bu ayar sayı ya da boş olabilir.')
    .min(enAz, `En az ${sayiBicimi(enAz, ondalik)} olabilir.`)
    .max(enCok, `En çok ${sayiBicimi(enCok, ondalik)} olabilir.`)
    .refine((d) => basamakUyar(d, ondalik), ondalik === 0 ? 'Tam sayı olmalı.' : `En çok ${ondalik} ondalık basamak olabilir.`)
    .nullable();
}

export const ayarParametresi = z.object({ anahtar: z.string().max(80) });

// Değerin türü anahtara bağlıdır; gövde şeması onu bilemez, tanıma göre serviste doğrulanır.
export const ayarDegistirGovdesi = z.object({ deger: z.unknown() });

// Saklanan değer tanımın türüne uymuyorsa `gecersiz` gelir ve değer null'dur; üstüne yazmak onarır.
const ayarOrtak = { anahtar: z.string(), baslik: z.string(), aciklama: z.string(), gecersiz: z.literal(true).optional() };

export const ayarSemasi = z
  .discriminatedUnion('tur', [
    z.object({ ...ayarOrtak, tur: z.literal('boolean'), deger: z.boolean().nullable() }),
    z.object({
      ...ayarOrtak,
      tur: z.literal('sayi'),
      deger: z.number().finite().nullable(),
      enAz: z.number().finite(),
      enCok: z.number().finite(),
      ondalik: z.number().int().min(0).max(SAYI_ONDALIK_EN_COK),
    }),
    z.object({
      ...ayarOrtak, tur: z.literal('metin'), deger: z.string().nullable(), enUzun: z.number().int().positive(),
      bosOlabilir: z.literal(true).optional(), bicim: z.enum(METIN_BICIMLERI).optional(),
    }),
    // Değer kalıptır; alanlar kalıpta kullanılabilen belge alanlarıdır (zaman alanları ve sayaç her belgede vardır).
    z.object({ ...ayarOrtak, tur: z.literal('numara'), deger: z.string().nullable(), alanlar: z.array(z.string()) }),
    z.object({
      ...ayarOrtak, tur: z.literal('secim'), deger: z.string().nullable(), secenekler: z.array(z.object({ deger: z.string(), etiket: z.string() })),
    }),
  ])
  // Açık-kapalı, metin, numara ve seçim ayarının boş değeri yoktur; null yalnız okunamayan saklanan değerdir.
  .refine((ayar) => ayar.tur === 'sayi' || ayar.deger !== null || ayar.gecersiz === true, { path: ['deger'], message: 'Değer zorunlu.' });

export const ayarlarCevabi = z.object({ ayarlar: z.array(ayarSemasi) });

// Kapalı sayfa yolları (KAPATILABILIR_YOLLAR'dan); boş liste her sayfanın açık olduğudur.
export const kapaliSayfalarCevabi = z.object({ kapali: z.array(z.string()) });
// Yazma tek sayfadır: eski ya da yarım yüklenmiş liste gönderen ekran öteki sayfaları açıp kapatamaz.
export const kapaliSayfalarGovdesi = z.object({ yol: z.string().max(200), kapali: z.boolean() });
export type KapaliSayfalarCevabi = z.output<typeof kapaliSayfalarCevabi>;
export type KapaliSayfalarGovdesi = z.input<typeof kapaliSayfalarGovdesi>;

export type Ayar = z.output<typeof ayarSemasi>;

// Girişten sonraki karşılama: her oturum okur, kabuk çizer. Kapalıyken metin yine gelir; çizilmez.
const saat = z.number().int().min(0).max(23);
export const karsilamaCevabi = z.object({
  acik: z.boolean(),
  metin: z.string(),
  geceMetni: z.string(),
  gunduzBaslangic: saat,
  geceBaslangic: saat,
});
export type KarsilamaCevabi = z.output<typeof karsilamaCevabi>;

// Hareket dili ve açılış (kullanıcı isteği 2026-10-14): her oturum okur, kabuk uygular. Cihazın performans modu ikisini de
// geçersiz kılar (istemcide); ayar kurumun seçimidir.
// kapali: geçiş, animasyon, cam bulanıklığı ve açılış gösterisi hiç yok (kullanıcı isteği 2026-10-15, takılmayı ayırmak için).
export const HAREKET_SEVIYELERI = ['kapali', 'sade', 'orta', 'cesur', 'ultra'] as const;
export const ACILIS_TURLERI = ['yok', 'tezgah', 'talas', 'lazer', 'cmm', 'dokum', '3b', 'rastgele'] as const;
export const GECIS_HIZLARI = ['hizli', 'normal', 'yavas'] as const;
export const gorunumCevabi = z.object({
  hareket: z.enum(HAREKET_SEVIYELERI),
  acilis: z.enum(ACILIS_TURLERI),
  // Saniye; ayar boşsa gösteri kendi süresiyle oynar.
  acilisSuresi: z.number().min(0.5).max(5).nullable(),
  gecisHizi: z.enum(GECIS_HIZLARI),
});
export type GorunumCevabi = z.output<typeof gorunumCevabi>;
export type HareketSeviyesi = (typeof HAREKET_SEVIYELERI)[number];
export type AcilisTuru = (typeof ACILIS_TURLERI)[number];
export type GecisHizi = (typeof GECIS_HIZLARI)[number];

// Kurumun adı: her oturum okur; modül başlıkları ve belgeler bununla yazılır.
export const kurumCevabi = z.object({ ad: z.string() });
export type KurumCevabi = z.output<typeof kurumCevabi>;
export type AyarlarCevabi = z.output<typeof ayarlarCevabi>;
export type AyarDegistirGovdesi = z.input<typeof ayarDegistirGovdesi>;

// Kurum logosu kabuğun sol üstünde durur. Resim veri adresi olarak ayar deposunda saklanır (dosya dizini, göç yok);
// sınır, denetim kaydına tam giren gövdeyi küçük tutar. SVG alınmaz: betik taşıyabilen biçim kabuğa girmez.
export const KURUM_LOGOSU_EN_COK = 200_000;
const LOGO_BICIMI = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const kurumLogosuSemasi = z
  .string()
  .max(KURUM_LOGOSU_EN_COK, 'Logo en çok 140 KB olabilir.')
  .regex(LOGO_BICIMI, 'Logo PNG, JPEG ya da WebP olmalı.');
// null: logo yok (kaldırıldı ya da hiç yüklenmedi).
export const kurumLogosuCevabi = z.object({ logo: kurumLogosuSemasi.nullable() });
export const kurumLogosuGovdesi = z.object({ logo: kurumLogosuSemasi.nullable() });

export type KurumLogosuCevabi = z.output<typeof kurumLogosuCevabi>;
export type KurumLogosuGovdesi = z.input<typeof kurumLogosuGovdesi>;

// Güncelleme paketi (kart #870): internete kapalı sunucuya ayarlardan yüklenir, imzası doğrulanır.
// Kanal paketi alır ve saklar; uygulamayı güncelleyici yapar (kart #1210). Sınırlar sabittir; değiştirmek kod ve karar ister.
export const GUNCELLEME_PARCASI = 512 * 1024;
export const AZAMI_GUNCELLEME = 200 * 1024 * 1024;
export const AZAMI_GUNCELLEME_PARCA_SAYISI = AZAMI_GUNCELLEME / GUNCELLEME_PARCASI;

// Kimliği istemci üretir (UUID); yükleme onu açan kişiye aittir.
export const guncellemeYuklemeParametresi = z.object({
  kimlik: z.string().refine(istekKimligiMi, 'Yükleme kimliği UUID olmalı.').transform((k) => k.toLowerCase()),
});
export const guncellemeParcasiGovdesi = z.object({
  boyut: z.number().int().positive().max(AZAMI_GUNCELLEME, 'Paket en çok 200 MB olabilir.'),
  sira: z.number().int().nonnegative().max(AZAMI_GUNCELLEME_PARCA_SAYISI - 1),
  veri: z.string().min(1).max(Math.ceil(GUNCELLEME_PARCASI / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Parça base64 olmalı.'),
});
export const guncellemeParcasiCevabi = z.object({ alinan: z.number().int().nonnegative(), toplam: z.number().int().positive() });

// Paketin imzalı bildirimi: sürüm, commit, derleme zamanı, içindeki göçler. Doğrulanmamış paket listeye girmez.
export const guncellemePaketiSemasi = z.object({
  surum: z.string(),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  tarih: zamanSemasi,
  gocler: z.array(z.string()),
  not: z.string().nullable(),
  // Kart #886'dan önceki paketlerin bildiriminde yoktur.
  degisiklikler: z.array(z.string()).default([]),
  // degisiklikler'in başladığı yayın; ilk yayında ve 1065'ten önceki paketlerde null.
  oncekiYayin: z.string().nullable().default(null),
  boyut: z.number().int().positive(),
  yukleyenId: z.number().int(),
  yuklenme: zamanSemasi,
});
// kanal: acik ya da neden kapalı olduğu. Kapalı kanalda liste boştur; yükleme reddedilir.
export const GUNCELLEME_KANAL_DURUMLARI = ['acik', 'dizin-yok', 'anahtar-yok', 'anahtar-gecersiz'] as const;
// Paketi uygulama (kart #1210): uygulamayı sunucunun dışındaki güncelleyici yapar. guncelleyici false ise sunucu onunla
// açılmamıştır, Uygula reddedilir. uygulanamaz: paketin neden uygulanamadığı (çalışan sürüm, geri gitme); null ise uygulanabilir.
// atlama: değişiklik listesi çalışan sürümden başlamıyorsa aradaki yayınların listede olmadığını söyler; null ise liste tamdır.
export const guncellemeListePaketi = guncellemePaketiSemasi.extend({
  uygulanamaz: z.string().nullable(), silinemez: z.string().nullable(), atlama: z.string().nullable(),
});
// Güncelleyicinin kurduğu sürüm klasörü. surum ve tarih, paketi hâlâ duruyorsa onun bildiriminden gelir; yoksa null.
// silinemez: neden silinemediği (çalışan ya da kuruluyor); null ise silinebilir.
export const guncellemeKuruluSurum = z.object({
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  surum: z.string().nullable(),
  tarih: zamanSemasi.nullable(),
  calisan: z.boolean(),
  silinemez: z.string().nullable(),
});
export const GUNCELLEME_UYGULAMA_SONUCLARI = ['kuruldu', 'geri-alindi', 'basarisiz'] as const;
export const guncellemeUygulamaSonucu = z.object({
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  surum: z.string(),
  sonuc: z.enum(GUNCELLEME_UYGULAMA_SONUCLARI),
  adim: z.string().nullable(),
  hata: z.string().nullable(),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
});
// Uygulama geçmişinin bir satırı: sonuç ve uygulamadan önce çalışan sürüm (yayın adı, yoksa commit; ilk kurulumda bilinmeyebilir).
export const guncellemeGecmisKaydi = guncellemeUygulamaSonucu.extend({ onceki: z.string().nullable() });
export const guncellemeUygulamaIstegi = z.object({ commit: z.string().regex(/^[0-9a-f]{40}$/), isteyenId: z.number().int(), istenme: zamanSemasi });
export const guncellemePaketleriCevabi = z.object({
  kanal: z.enum(GUNCELLEME_KANAL_DURUMLARI),
  paketler: z.array(guncellemeListePaketi),
  guncelleyici: z.boolean(),
  calisan: z.object({ commit: z.string().nullable(), surum: z.string().nullable(), tarih: zamanSemasi.nullable() }),
  // Güncelleyicinin henüz almadığı istek; varken yeni istek reddedilir.
  bekleyen: guncellemeUygulamaIstegi.nullable(),
  // Güncelleyicinin aldığı ve şu an uyguladığı istek.
  uygulaniyor: guncellemeUygulamaIstegi.nullable(),
  surumler: z.array(guncellemeKuruluSurum),
  sonUygulama: guncellemeUygulamaSonucu.nullable(),
  // Yeniden eskiye; sunucudaki dosyadaki son GUNCELLEME_GECMISI_EN_COK kayıt.
  gecmis: z.array(guncellemeGecmisKaydi),
  // Güncelleyicinin kurmadan önce yedek alacağı klasör (seçilen, yoksa TMIV2_YEDEK_DIZINI); klasör sunucuda yoksa Uygula reddedilir.
  yedek: z.object({ dizin: z.string().nullable(), hazir: z.boolean() }),
});
export const guncellemeUygulaParametresi = z.object({ commit: z.string().regex(/^[0-9a-f]{40}$/, 'Commit 40 haneli olmalı.') });
export const guncellemeSilCevabi = z.object({ commit: z.string().regex(/^[0-9a-f]{40}$/) });

export type GuncellemeParcasiGovdesi = z.input<typeof guncellemeParcasiGovdesi>;
export type GuncellemeParcasiCevabi = z.output<typeof guncellemeParcasiCevabi>;
export type GuncellemePaketi = z.output<typeof guncellemePaketiSemasi>;
export type GuncellemePaketleriCevabi = z.output<typeof guncellemePaketleriCevabi>;
export type GuncellemeKanali = (typeof GUNCELLEME_KANAL_DURUMLARI)[number];
export type GuncellemeListePaketi = z.output<typeof guncellemeListePaketi>;
export type GuncellemeKuruluSurum = z.output<typeof guncellemeKuruluSurum>;
export type GuncellemeUygulamaIstegi = z.output<typeof guncellemeUygulamaIstegi>;
export type GuncellemeUygulamaSonucu = z.output<typeof guncellemeUygulamaSonucu>;
export type GuncellemeGecmisKaydi = z.output<typeof guncellemeGecmisKaydi>;
export const GUNCELLEME_GECMISI_EN_COK = 50;

// Veritabanı yedeği (kart #1205): sunucu her gece pg_dump ile dosyaya alır, ayarlardan elle de alınır ve indirilir.
// Dosya adı veritabanı, UTC zamanı ve türü taşır; zaman adla okunur, dosya tarihine güvenilmez (kopyalanınca değişir).
export const YEDEK_TURLERI = ['gece', 'elle'] as const;
export const YEDEK_ADI = /^(tmiv2(?:_[a-z0-9_]+)?)-(\d{8}T\d{6}Z)-(gece|elle)\.dump$/;
export const yedekParametresi = z.object({ ad: z.string().max(120).regex(YEDEK_ADI, 'Yedek adı geçersiz.') });
// İndirme iki adımdır (kullanıcı kararı 145 a): izin komutu denetim kaydına düşer, indirme o izinle bir kez yapılır.
export const yedekIndirmeIzniCevabi = z.object({ izin: z.string() });
export const yedekIndirSorgusu = z.object({ izin: z.string().min(1).max(100) });
export const yedekSemasi = z.object({
  ad: z.string(),
  tur: z.enum(YEDEK_TURLERI),
  zaman: zamanSemasi,
  boyut: z.number().int().nonnegative(),
});
// Yedek klasörü ekrandan seçilir (kart #1205 eki); boş bırakılırsa sunucunun TMIV2_YEDEK_DIZINI değeri geçerlidir.
export const YEDEK_DIZINI_KAYNAKLARI = ['ayar', 'ortam'] as const;
export const YEDEK_DIZINI_EN_UZUN = 500;
export const yedekDiziniGovdesi = z.object({
  dizin: z.string().trim().min(1, 'Klasör yolu boş olamaz.').max(YEDEK_DIZINI_EN_UZUN, 'Klasör yolu en çok 500 karakter olabilir.').nullable(),
});
export const yedekDiziniCevabi = z.object({ dizin: z.string().nullable(), kaynak: z.enum(YEDEK_DIZINI_KAYNAKLARI).nullable() });
// durum: acik ya da neden kapalı olduğu. Kapalı durumda liste boştur; yedek alınmaz.
export const YEDEK_DURUMLARI = ['acik', 'dizin-yok', 'anahtar-yok'] as const;
export const yedekListesi = z.object({
  durum: z.enum(YEDEK_DURUMLARI),
  // Gece yedeğinin tesis saati ve saklama kuralı; ekran bunları açıklamada yazar.
  saat: z.number().int(),
  saklamaGun: z.number().int(),
  enAzKalan: z.number().int(),
  // Bu süreçte süren yedek; yoksa null.
  suruyor: z.object({ tur: z.enum(YEDEK_TURLERI), baslangic: zamanSemasi }).nullable(),
  // Bu süreçteki son başarısız yedek; sonra başarılı yedek alındıysa null.
  sonHata: z.object({ zaman: zamanSemasi, ileti: z.string() }).nullable(),
  yedekler: z.array(yedekSemasi),
  // Geçerli klasör ve nereden geldiği: ekranda seçilen (ayar) ya da sunucu ortamı (TMIV2_YEDEK_DIZINI); ikisi de yoksa null.
  dizin: z.string().nullable(),
  kaynak: z.enum(YEDEK_DIZINI_KAYNAKLARI).nullable(),
});
// Yedeğin büyüyen veritabanıyla isteyeceği yer (kart 1763). Gereken: son yedeğin boyu çarpı saklamada aynı anda duran yedek sayısı;
// mevcut yedekler döndükçe yerini bıraktığı için karşılaştırma boş yer artı mevcut toplamla yapılır. Bilinmeyen değer null'dır.
export const yedekAlani = z.object({
  sonBoyut: z.number().int().nonnegative().nullable(),
  adet: z.number().int().positive(),
  gereken: z.number().int().nonnegative().nullable(),
  mevcut: z.number().int().nonnegative(),
  bosYer: z.number().int().nonnegative().nullable(),
  yetmiyor: z.boolean(),
});
// Ortak dosya deposu veritabanında durur ve her gece yedeğine girer: dolduğunda yedek de o kadar büyür.
export const dosyaDeposuDurumu = z.object({
  bayt: z.number().int().nonnegative(),
  sinir: z.number().int().positive(),
  uyari: z.boolean(),
});
export const yedeklerCevabi = yedekListesi.extend({ alan: yedekAlani.nullable(), dosyaDeposu: dosyaDeposuDurumu });
export const yedekAlCevabi = z.object({ baslangic: zamanSemasi });

export type YedekTuru = (typeof YEDEK_TURLERI)[number];
export type YedekDurumu = (typeof YEDEK_DURUMLARI)[number];
export type Yedek = z.output<typeof yedekSemasi>;
export type YedekListesi = z.output<typeof yedekListesi>;
export type YedekAlani = z.output<typeof yedekAlani>;
export type DosyaDeposuDurumu = z.output<typeof dosyaDeposuDurumu>;
export type YedeklerCevabi = z.output<typeof yedeklerCevabi>;
export type YedekAlCevabi = z.output<typeof yedekAlCevabi>;
export type YedekIndirmeIzniCevabi = z.output<typeof yedekIndirmeIzniCevabi>;
export type YedekDiziniGovdesi = z.input<typeof yedekDiziniGovdesi>;
export type YedekDiziniCevabi = z.output<typeof yedekDiziniCevabi>;
export type YedekDiziniKaynagi = (typeof YEDEK_DIZINI_KAYNAKLARI)[number];
