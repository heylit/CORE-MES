import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';
import { BILDIRIM_ONEMLERI, BILDIRIM_SINIFLARI, BILDIRIM_TUR_ANAHTARLARI } from './bildirim.ts';
import {
  EPOSTA_GOVDE_EN_UZUN, EPOSTA_GUN_EN_COK, EPOSTA_KIPLERI, EPOSTA_KONULARI, EPOSTA_KONU_EN_UZUN, EPOSTA_SIMGELERI, EPOSTA_SONUCLARI, EPOSTA_TABLO_ALANLARI,
  EPOSTA_TEKRAR_EN_COK, EPOSTA_YUKSELT_KISI_EN_COK, EPOSTA_YUKSELT_ROL_EN_COK, EPOSTA_ZAMANLARI,
} from './eposta-sabitleri.ts';

export * from './eposta-sabitleri.ts';

// E-posta kanalı (ADR 0015, 3397): bildirim kurum içi posta sunucusundan e-postayla da gider. Sunucu adresi, alan adları, gönderen adres
// ve parola yalnız ortam değişkenindedir; bu sözleşme onları yazan alan taşımaz. Okuma ve yazma `bildirim.eposta-yonet` ister.

const KIMLIK = z.number().int().positive().max(2147483647);
const tekilMi = (l: readonly number[]): boolean => new Set(l).size === l.length;
const gun = z.number().int().min(1).max(EPOSTA_GUN_EN_COK);

// Sunucu durumu: ortam değişkeni yoksa 'tanimsiz' (gönderim beklemede kalır). Geçersiz değer sunucuyu açılışta durdurur (ADR 0015 md 3).
export const EPOSTA_ORTAM_DURUMLARI = ['tanimsiz', 'hazir'] as const;
export const EPOSTA_GUVENLIKLERI = ['starttls', 'tls', 'yok'] as const;
export const epostaDurumuCevabi = z.object({
  ortam: z.enum(EPOSTA_ORTAM_DURUMLARI),
  ayarAcik: z.boolean(),
  kip: z.enum(EPOSTA_KIPLERI),
  adres: z.string().nullable(),
  guvenlik: z.enum(EPOSTA_GUVENLIKLERI).nullable(),
  alanAdlari: z.array(z.string()),
  gonderen: z.string().nullable(),
  kuyrukta: z.number().int().nonnegative(),
  son24Gonderilen: z.number().int().nonnegative(),
  son24Hata: z.number().int().nonnegative(),
  // İK'da iş e-postası olmayan etkin girişli kişi sayısı; adres çözücü bağlı değilse null.
  epostasizKisi: z.number().int().nonnegative().nullable(),
  sonGonderim: zamanSemasi.nullable(),
});

export const epostaSablonSemasi = z.object({
  konu: z.enum(EPOSTA_KONULARI),
  simge: z.enum(EPOSTA_SIMGELERI),
  konuKalibi: z.string(),
  govde: z.string(),
  tabloAlanlari: z.array(z.enum(EPOSTA_TABLO_ALANLARI)),
  // Hiç değiştirilmediyse null; varsayılan geçer.
  surum: z.number().int().nullable(),
  degistirildi: zamanSemasi.nullable(),
});
export const epostaSablonlariCevabi = z.object({ satirlar: z.array(epostaSablonSemasi) });
export const epostaSablonParametresi = z.object({ konu: z.enum(EPOSTA_KONULARI) });
export const epostaSablonDegistirGovdesi = z.object({
  simge: z.enum(EPOSTA_SIMGELERI),
  konuKalibi: z.string().trim().min(1, 'Konu boş olamaz.').max(EPOSTA_KONU_EN_UZUN),
  govde: z.string().trim().min(1, 'Gövde boş olamaz.').max(EPOSTA_GOVDE_EN_UZUN),
  tabloAlanlari: z.array(z.enum(EPOSTA_TABLO_ALANLARI)).max(EPOSTA_TABLO_ALANLARI.length)
    .refine((l) => new Set(l).size === l.length, 'Aynı alan iki kez seçilemez.'),
  // Varsayılana dönmek: değişiklik silinir, diğer alanlar yok sayılır.
  varsayilan: z.boolean().optional(),
  surum: surumSemasi.nullable(),
}).strict();

export const epostaTetikleyiciSatiri = z.object({
  tur: z.enum(BILDIRIM_TUR_ANAHTARLARI),
  baslik: z.string(),
  onem: z.enum(BILDIRIM_ONEMLERI),
  sinif: z.enum(BILDIRIM_SINIFLARI),
  konu: z.enum(EPOSTA_KONULARI),
  eposta: z.boolean(),
  zaman: z.enum(EPOSTA_ZAMANLARI),
  // İş açık kaldıkça her `tekrarGun` günde yeniden, en çok `tekrarEnCok` kez; ikisi birlikte boş ya da dolu.
  tekrarGun: z.number().int().nullable(),
  tekrarEnCok: z.number().int().nullable(),
  // İş `yukseltGun` gün sonra hâlâ açıksa seçilen rollere ve kişilere de gider (kademe).
  yukseltGun: z.number().int().nullable(),
  yukseltRolIdleri: z.array(z.number().int()),
  yukseltKisiIdleri: z.array(z.number().int()),
  surum: z.number().int().nullable(),
});
export const epostaTetikleyicileriCevabi = z.object({
  satirlar: z.array(epostaTetikleyiciSatiri),
  roller: z.array(z.object({ id: z.number().int(), ad: z.string() })),
  kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })),
});
export const epostaTetikleyiciParametresi = z.object({ tur: z.enum(BILDIRIM_TUR_ANAHTARLARI) });
export const epostaTetikleyiciDegistirGovdesi = z.object({
  eposta: z.boolean(),
  zaman: z.enum(EPOSTA_ZAMANLARI),
  tekrarGun: gun.nullable(),
  tekrarEnCok: z.number().int().min(1).max(EPOSTA_TEKRAR_EN_COK).nullable(),
  yukseltGun: gun.nullable(),
  yukseltRolIdleri: z.array(KIMLIK).max(EPOSTA_YUKSELT_ROL_EN_COK).refine(tekilMi, 'Aynı rol iki kez seçilemez.'),
  yukseltKisiIdleri: z.array(KIMLIK).max(EPOSTA_YUKSELT_KISI_EN_COK).refine(tekilMi, 'Aynı kişi iki kez seçilemez.'),
  surum: surumSemasi.nullable(),
}).strict()
  .refine((g) => (g.tekrarGun === null) === (g.tekrarEnCok === null), { message: 'Tekrar için gün ve en çok sayı birlikte girilir.', path: ['tekrarEnCok'] })
  .refine((g) => g.yukseltGun !== null || (g.yukseltRolIdleri.length === 0 && g.yukseltKisiIdleri.length === 0), {
    message: 'Kademe alıcısı için gün girin.', path: ['yukseltGun'],
  })
  .refine((g) => g.yukseltGun === null || g.yukseltRolIdleri.length + g.yukseltKisiIdleri.length > 0, {
    message: 'Kademe için en az bir rol ya da kişi seçin.', path: ['yukseltRolIdleri'],
  });

export const epostaDefterSatiri = z.object({
  id: z.number().int(),
  zaman: zamanSemasi,
  kisiId: z.number().int().nullable(),
  kisiAdi: z.string().nullable(),
  tur: z.string(),
  baslik: z.string(),
  kayitNo: z.string().nullable(),
  sonuc: z.enum(EPOSTA_SONUCLARI),
  neden: z.string().nullable(),
});
export const epostaDefterSorgusu = z.object({ ...sayfaSorguAlanlari, sonuc: z.enum(EPOSTA_SONUCLARI).optional() });
export const epostaDefterCevabi = listeCevapSemasi(epostaDefterSatiri);

// Deneme e-postası yalnız isteyenin kendisine gider; sonuç defterde de görünür.
export const epostaDenemeGovdesi = z.object({ konu: z.enum(EPOSTA_KONULARI).optional() }).strict();
export const epostaDenemeCevabi = z.object({ sonuc: z.enum(EPOSTA_SONUCLARI), neden: z.string().nullable() });
export const epostaSinamaCevabi = z.object({ tamam: z.boolean(), neden: z.string().nullable() });

export type EpostaDurumuCevabi = z.output<typeof epostaDurumuCevabi>;
export type EpostaSablonu = z.output<typeof epostaSablonSemasi>;
export type EpostaSablonlariCevabi = z.output<typeof epostaSablonlariCevabi>;
export type EpostaSablonDegistirGovdesi = z.input<typeof epostaSablonDegistirGovdesi>;
export type EpostaTetikleyiciSatiri = z.output<typeof epostaTetikleyiciSatiri>;
export type EpostaTetikleyicileriCevabi = z.output<typeof epostaTetikleyicileriCevabi>;
export type EpostaTetikleyiciDegistirGovdesi = z.input<typeof epostaTetikleyiciDegistirGovdesi>;
export type EpostaDefterSatiri = z.output<typeof epostaDefterSatiri>;
export type EpostaDefterCevabi = z.output<typeof epostaDefterCevabi>;
export type EpostaDenemeCevabi = z.output<typeof epostaDenemeCevabi>;
export type EpostaSinamaCevabi = z.output<typeof epostaSinamaCevabi>;
