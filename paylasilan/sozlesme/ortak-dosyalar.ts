import { z } from 'zod';
import { dosyaOzeti } from './dosya.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// Ortak Dosyalar (kart 2067, ADR 0030): klasör ağacı, klasör x rol düzeyi, sürümlü dosya, silme yerine arşiv.
// Düzeyler sıralıdır; üstteki alttakini içerir. `yok` satır olarak tutulmaz: satırı olmayan rol klasörü görmez.
export const KLASOR_DUZEYLERI = ['yok', 'gorur', 'ekler', 'yonetir'] as const;
export type KlasorDuzeyi = (typeof KLASOR_DUZEYLERI)[number];
export const VERILEN_DUZEYLER = ['gorur', 'ekler', 'yonetir'] as const;
export type VerilenDuzey = (typeof VERILEN_DUZEYLER)[number];

export const AZAMI_AD = 120;
export const SON_EKLENEN_SINIRI = 20;

const id = z.coerce.number<number>().int().positive().max(2147483647);
// Ad dosya ve klasör adıdır: yol ayırıcısı, denetim karakteri ve yalnız nokta taşımaz (indirmede dosya adı olur).
const ad = z.string().trim().min(1).max(AZAMI_AD)
  .refine((d) => !/[\\/\u0000-\u001f\u007f]/.test(d), 'Ad / ve \\ ile denetim karakteri taşıyamaz.')
  .refine((d) => !/^\.+$/.test(d), 'Ad yalnız noktadan oluşamaz.');

export const klasorParametresi = z.object({ klasorId: id });
export const dosyaParametresi = z.object({ klasorId: id, dosyaId: id });
export const surumParametresi = z.object({ klasorId: id, dosyaId: id, sira: id });
export const aramaSorgusu = z.object({ ara: z.string().trim().max(AZAMI_AD).optional() });

// Kayda bağlı (sistem) klasörün kaynağı (kart 3288, ADR 0030 eki): adı kayıttan gelir, kişi adını değiştiremez.
export const KAYNAK_TURLERI = ['kok', 'firmasiz-projeler', 'firma', 'siparissiz-projeler', 'siparis', 'proje'] as const;
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number];
// Klasörü açılan kayıt türleri; kayıt ekranındaki "Klasör" bağlantısı bunlarla sorulur.
export const KAYIT_TURLERI = ['firma', 'siparis', 'proje'] as const;
export type KayitTuru = (typeof KAYIT_TURLERI)[number];

export const klasorSemasi = z.object({
  id: z.number().int(),
  ustId: z.number().int().nullable(),
  ad: z.string(),
  ozelYetki: z.boolean(),
  // Oturumdaki kişinin bu klasördeki düzeyi; listede yalnız `gorur` ve üstü gelir.
  duzey: z.enum(KLASOR_DUZEYLERI),
  dosyaSayisi: z.number().int().nonnegative(),
  surum: surumSemasi,
  kaynak: z.object({ tur: z.enum(KAYNAK_TURLERI), id: z.number().int().nullable() }).nullable(),
});
export const klasorlerCevabi = z.object({
  klasorler: z.array(klasorSemasi),
  // Yönetici: kök klasör açar, yetki sekmesini görür. Ekranın sadeleşmesi içindir; sunucu her komutta yeniden denetler.
  yonetici: z.boolean(),
  arsivSayisi: z.number().int().nonnegative(),
});

export const dosyaSemasi = z.object({
  id: z.number().int(),
  klasorId: z.number().int(),
  // Kök klasörden bu klasöre adlar; Son eklenenler ve Arşiv listesinde klasör sütunudur.
  klasorYolu: z.array(z.string()),
  ad: z.string(),
  // Son sürümün sırası, boyutu, yükleyeni ve zamanı.
  surumSirasi: z.number().int().positive(),
  boyut: z.number().int().nonnegative(),
  yukleyenAd: z.string().nullable(),
  zaman: zamanSemasi,
  arsiv: z.boolean(),
  surum: surumSemasi,
});
export const dosyalarCevabi = z.object({
  klasor: klasorSemasi,
  altKlasorler: z.array(klasorSemasi),
  dosyalar: z.array(dosyaSemasi),
  // Yükleme adı önerisi (zorunlu değil): en yakın sipariş ya da proje klasörünün numarası ve bu klasörün adı.
  adOnerisi: z.object({ onek: z.string(), altKlasor: z.string().nullable() }).nullable(),
});
export const dosyaListesiCevabi = z.object({ dosyalar: z.array(dosyaSemasi) });

export const surumSatiri = z.object({
  sira: z.number().int().positive(),
  boyut: z.number().int().nonnegative(),
  yukleyenAd: z.string().nullable(),
  zaman: zamanSemasi,
});
export const surumlerCevabi = z.object({ dosya: dosyaSemasi, surumler: z.array(surumSatiri) });

export const GECMIS_OLAYLARI = ['klasor-acildi', 'yuklendi', 'yeni-surum', 'arsivlendi', 'geri-alindi', 'yetki-degisti'] as const;
export type GecmisOlayi = (typeof GECMIS_OLAYLARI)[number];
export const gecmisSatiri = z.object({
  olay: z.enum(GECMIS_OLAYLARI),
  kisiAd: z.string().nullable(),
  zaman: zamanSemasi,
  dosyaAdi: z.string().nullable(),
  surumSirasi: z.number().int().positive().nullable(),
});
export const gecmisCevabi = z.object({ olaylar: z.array(gecmisSatiri) });

export const klasorAcGovdesi = z.object({ ustId: id.nullable(), ad });
// Aynı klasörde aynı adla (tr-TR, büyük-küçük harf duyarsız) yükleme yeni sürüm ekler.
export const yukleGovdesi = z.object({ ad, ozet: dosyaOzeti });
export const surumluGovde = z.object({ ...beklenenSurum });

export const yetkiSatiri = z.object({ rolId: id, duzey: z.enum(VERILEN_DUZEYLER) });
export const yetkiCevabi = z.object({
  klasorId: z.number().int(),
  ozelYetki: z.boolean(),
  // Miras alan klasörde yetkinin geldiği klasör; özel yetkili klasörde kendisi.
  kaynakId: z.number().int(),
  kaynakAd: z.string(),
  roller: z.array(z.object({ id: z.number().int(), ad: z.string(), yonetici: z.boolean() })),
  // Kaynağın satırları; satırı olmayan rol `yok`.
  satirlar: z.array(z.object({ rolId: z.number().int(), duzey: z.enum(VERILEN_DUZEYLER) })),
  surum: surumSemasi,
});
export const yetkiGovdesi = z.object({
  ...beklenenSurum,
  ozelYetki: z.boolean(),
  // Yalnız özel yetkide okunur; miras alan klasörün satırı tutulmaz.
  satirlar: z.array(yetkiSatiri).max(200),
}).refine((g) => new Set(g.satirlar.map((s) => s.rolId)).size === g.satirlar.length, { message: 'Bir rol iki kez yazılamaz.', path: ['satirlar'] });

// Ayarlar (yalnız `ortak-dosyalar.yetki-ver`): kök, alt klasör şablonu, açılamayan klasörler, toplu işler.
const sablonAdi = ad;
export const sablonGovdesi = z.object({ siparis: z.array(sablonAdi).max(20), proje: z.array(sablonAdi).max(20) });
export const ayarlarCevabi = z.object({
  kok: z.object({ id: z.number().int(), ad: z.string() }).nullable(),
  sablon: z.object({ siparis: z.array(z.string()), proje: z.array(z.string()) }),
  acilamayan: z.array(z.object({
    tur: z.enum(KAYIT_TURLERI), id: z.number().int(), etiket: z.string(), neden: z.string(), zaman: zamanSemasi,
  })),
  topluIsler: z.array(z.object({ id: z.uuid(), klasorSayisi: z.number().int().nonnegative(), arsivde: z.number().int().nonnegative(), zaman: zamanSemasi })),
});
export const kayitParametresi = z.object({ tur: z.enum(KAYIT_TURLERI), id });
export const topluIsParametresi = z.object({ topluIs: z.uuid() });
export const kayitSayilari = z.object({ firma: z.number().int().nonnegative(), siparis: z.number().int().nonnegative(), proje: z.number().int().nonnegative() });
export const mevcutCevabi = z.object({ bagli: z.boolean(), kokVar: z.boolean(), klasorsuz: kayitSayilari });
// Toplu komut gruplar halinde ilerler (Risk K4 c): her çağrı bir grup açar, kendi transaction'ındadır; istemci kalan bitene dek çağırır.
// İlk çağrıda gösterilen sayı gönderilir; değişmişse komut durur (K4 e).
export const mevcutAcGovdesi = z.object({ topluIs: z.uuid(), beklenen: kayitSayilari.nullable() });
export const mevcutAcCevabi = z.object({ acilan: z.number().int().nonnegative(), acilamayan: z.number().int().nonnegative(), kalan: z.number().int().nonnegative() });
export const topluGeriAlCevabi = z.object({ arsivlenen: z.number().int().nonnegative(), atlanan: z.number().int().nonnegative() });
// Klasör yoksa ya da kişiye görünmüyorsa `null` (kural 5); iki durum aynı cevaptır, görünmeyen klasörün varlığı sızmaz.
export const kaynakKlasoruCevabi = z.object({ klasorId: z.number().int().nullable() });

// Hazır listeler (kart 3390, 3390 a): kaydın dosyaları, hangi modülde durursa dursun, kaynağına göre gruplu tek ekranda. Dosya kopyalanmaz;
// satır yalnız kaydı ve dosyanın kaynağını okuyabilene gelir (Risk K1), indirme kaynağın kendi ucundandır (ADR 0009, 3).
export const HAZIR_LISTELER = ['uretim-emri', 'satin-alma-siparisi'] as const;
export type HazirListe = (typeof HAZIR_LISTELER)[number];
// Grubun kaynağı; ekran başlığı ve ikonu bundan seçer.
export const HAZIR_KAYNAKLARI = ['cizim', 'satin-alma', 'irsaliye', 'parti', 'klasor'] as const;
export type HazirKaynak = (typeof HAZIR_KAYNAKLARI)[number];
export const HAZIR_KAYIT_SINIRI = 50;
export const HAZIR_DOSYA_SINIRI = 200;
// Kayıt anahtarı listenin kendi kimliğidir (emir kimliği, satın alma sipariş no); metin olarak taşınır.
const hazirAnahtar = z.string().trim().min(1).max(80);
export const hazirListeParametresi = z.object({ liste: z.enum(HAZIR_LISTELER) });
export const hazirKayitParametresi = z.object({ liste: z.enum(HAZIR_LISTELER), anahtar: hazirAnahtar });
export const hazirKayitSemasi = z.object({ anahtar: z.string(), no: z.string(), baslik: z.string(), alt: z.string().nullable() });
export const hazirKayitlarCevabi = z.object({ kayitlar: z.array(hazirKayitSemasi), daha: z.boolean() });
// `indir` aynı sunucudaki göreli yoldur; istemci başka adrese gitmez.
const goreliYol = z.string().regex(/^\/[a-z0-9\-/]+$/, 'Göreli yol olmalı.');
export const hazirDosyaSemasi = z.object({
  ad: z.string(), dosyaTuru: z.string().nullable(), bilgi: z.string().nullable(), zaman: zamanSemasi.nullable(), indir: goreliYol,
  // Dosyanın kaynak ekranı (Çizim Merkezi belgesi); yoksa null.
  ac: goreliYol.nullable(),
});
export const hazirGrupSemasi = z.object({ kaynak: z.enum(HAZIR_KAYNAKLARI), dosyalar: z.array(hazirDosyaSemasi) });
export const hazirDosyalarCevabi = z.object({
  kayit: hazirKayitSemasi, kayitYolu: goreliYol.nullable(), gruplar: z.array(hazirGrupSemasi), kesildi: z.boolean(),
  // Kaydın kişiye görünen ilk klasörü (sipariş, yoksa proje); görünmüyorsa null.
  klasor: z.object({ tur: z.enum(KAYIT_TURLERI), id }).nullable(),
});
export type HazirKayit = z.output<typeof hazirKayitSemasi>;
export type HazirKayitlarCevabi = z.output<typeof hazirKayitlarCevabi>;
export type HazirDosya = z.output<typeof hazirDosyaSemasi>;
export type HazirGrup = z.output<typeof hazirGrupSemasi>;
export type HazirDosyalarCevabi = z.output<typeof hazirDosyalarCevabi>;

export type Klasor = z.output<typeof klasorSemasi>;
export type AyarlarCevabi = z.output<typeof ayarlarCevabi>;
export type SablonGovdesi = z.input<typeof sablonGovdesi>;
export type MevcutCevabi = z.output<typeof mevcutCevabi>;
export type MevcutAcGovdesi = z.input<typeof mevcutAcGovdesi>;
export type MevcutAcCevabi = z.output<typeof mevcutAcCevabi>;
export type TopluGeriAlCevabi = z.output<typeof topluGeriAlCevabi>;
export type KaynakKlasoruCevabi = z.output<typeof kaynakKlasoruCevabi>;
export type KlasorlerCevabi = z.output<typeof klasorlerCevabi>;
export type OrtakDosya = z.output<typeof dosyaSemasi>;
export type DosyalarCevabi = z.output<typeof dosyalarCevabi>;
export type DosyaListesiCevabi = z.output<typeof dosyaListesiCevabi>;
export type SurumlerCevabi = z.output<typeof surumlerCevabi>;
export type GecmisSatiri = z.output<typeof gecmisSatiri>;
export type GecmisCevabi = z.output<typeof gecmisCevabi>;
export type KlasorAcGovdesi = z.input<typeof klasorAcGovdesi>;
export type YukleGovdesi = z.input<typeof yukleGovdesi>;
export type SurumluGovde = z.input<typeof surumluGovde>;
export type YetkiCevabi = z.output<typeof yetkiCevabi>;
export type YetkiGovdesi = z.input<typeof yetkiGovdesi>;
