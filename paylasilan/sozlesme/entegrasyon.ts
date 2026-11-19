import { z } from 'zod';
import { OKUMA_SIKLIKLARI } from '../okuma-sikligi.ts';
import { zamanSemasi } from '../zaman.ts';

// 3445 a: dış sistem (Logo, SmartES) yönetim sayfası. Aynı biçim iki modülde; her modül kendi akışlarını ve günlüğünü verir.
// Adres ve anahtar ekrana gelmez: yalnız tanımlı olup olmadığı (kural gereği yalnız sunucunun TMIV2_* değişkenindedir).

export const ENTEGRASYON_YONLERI = ['okuma', 'yazma', 'istek'] as const;
export const ENTEGRASYON_SONUCLARI = ['tamam', 'hata'] as const;

const sonSonuc = z.object({ zaman: zamanSemasi, sonuc: z.enum(ENTEGRASYON_SONUCLARI), ileti: z.string().nullable() }).strict();

export const entegrasyonAkisi = z.object({
  anahtar: z.string(),
  ad: z.string(),
  // Karşı sistemde ne okunur ya da ne yazılır (kullanıcının tanıdığı adla).
  ne: z.string(),
  yon: z.enum(ENTEGRASYON_YONLERI),
  // Aç/kapat ayar anahtarı; null: akış yalnız ana bağlantı anahtarıyla açılır.
  acikAyari: z.string().nullable(),
  acik: z.boolean(),
  siklikAyari: z.string().nullable(),
  siklik: z.enum(OKUMA_SIKLIKLARI).nullable(),
  siklikSecenekleri: z.array(z.enum(OKUMA_SIKLIKLARI)),
  simdiOkunabilir: z.boolean(),
  okunuyor: z.boolean(),
  sonrakiTur: zamanSemasi.nullable(),
  son: sonSonuc.nullable(),
  // Yazmada yeniden denenmeyi bekleyen belge sayısı; bilinmiyorsa null.
  bekleyen: z.number().int().nullable(),
}).strict();

export const entegrasyonBaglantisi = z.object({
  anaAyar: z.string(),
  acik: z.boolean(),
  // Sunucunun ortam değişkenlerinde adres (ve gerekiyorsa anahtar) var mı.
  tanimli: z.boolean(),
  karsiUc: z.string(),
  sonTest: sonSonuc.nullable(),
}).strict();

export const entegrasyonGunlukSatiri = z.object({
  id: z.number().int(),
  zaman: zamanSemasi,
  akis: z.string(),
  akisAdi: z.string(),
  yon: z.enum([...ENTEGRASYON_YONLERI, 'baglanti']),
  sonuc: z.enum(ENTEGRASYON_SONUCLARI),
  sayi: z.number().int().nullable(),
  ileti: z.string().nullable(),
}).strict();

export const entegrasyonYonetimiCevabi = z.object({
  baglanti: entegrasyonBaglantisi,
  akislar: z.array(entegrasyonAkisi),
  gunluk: z.array(entegrasyonGunlukSatiri),
  bugunHata: z.number().int(),
}).strict();

export const entegrasyonGunlukSorgusu = z.object({
  akis: z.string().max(64).optional(),
  yalnizHata: z.enum(['evet', 'hayir']).optional(),
  // Bu kimlikten eskiler ("Daha eski").
  once: z.coerce.number().int().positive().optional(),
}).strict();
export const entegrasyonGunlukCevabi = z.object({ satirlar: z.array(entegrasyonGunlukSatiri), dahaVar: z.boolean() }).strict();

export const entegrasyonAkisParametresi = z.object({ anahtar: z.string().min(1).max(64) }).strict();
export const entegrasyonKomutCevabi = z.object({ sonuc: z.enum(ENTEGRASYON_SONUCLARI), ileti: z.string() }).strict();

export type EntegrasyonYonetimiCevabi = z.output<typeof entegrasyonYonetimiCevabi>;
export type EntegrasyonAkisi = z.output<typeof entegrasyonAkisi>;
export type EntegrasyonGunlukSatiri = z.output<typeof entegrasyonGunlukSatiri>;
export type EntegrasyonGunlukCevabi = z.output<typeof entegrasyonGunlukCevabi>;
export type EntegrasyonKomutCevabi = z.output<typeof entegrasyonKomutCevabi>;
export type EntegrasyonYonu = (typeof ENTEGRASYON_YONLERI)[number];

export const GUNLUK_SAYFA_BOYU = 50;
// Günlük satırı ileti üst sınırı: dış sistemin hata metni kırpılır (Risk K5); gövde, adres ve anahtar hiç yazılmaz.
export const GUNLUK_ILETI_EN_COK = 300;
export const GUNLUK_SAKLAMA_GUN = 30;

// Günlüğe giden metin: dış sistemin iletisi tek satıra indirilir ve kırpılır (Risk K5). Boşsa null.
export function gunlukIletisi(metin: string | null | undefined, enCok = GUNLUK_ILETI_EN_COK): string | null {
  if (metin === null || metin === undefined) return null;
  const tek = metin.replace(/\s+/g, ' ').trim();
  if (tek === '') return null;
  return tek.length <= enCok ? tek : `${tek.slice(0, enCok - 1)}…`;
}
