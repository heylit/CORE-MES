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

export const klasorSemasi = z.object({
  id: z.number().int(),
  ustId: z.number().int().nullable(),
  ad: z.string(),
  ozelYetki: z.boolean(),
  // Oturumdaki kişinin bu klasördeki düzeyi; listede yalnız `gorur` ve üstü gelir.
  duzey: z.enum(KLASOR_DUZEYLERI),
  dosyaSayisi: z.number().int().nonnegative(),
  surum: surumSemasi,
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

export type Klasor = z.output<typeof klasorSemasi>;
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
