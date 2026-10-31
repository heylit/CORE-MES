import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

export const DENETIM_YONTEMLERI = ['POST', 'PUT', 'DELETE', 'GET'] as const;

// Tarih aralığı iki ucu dahil gündür. Komut yöntem ve yol kalıbıyla birlikte seçilir (ör. POST /kisiler/:id/duzenle).
export const kayitListesiSorgusu = z.object({
  ...sayfaSorguAlanlari,
  kisi: z.coerce.number().int().positive().max(2147483647).optional(),
  baslangic: tarihSemasi.optional(),
  bitis: tarihSemasi.optional(),
  yontem: z.enum(DENETIM_YONTEMLERI).optional(),
  yol: z.string().trim().min(1).max(300).optional(),
  modul: z.string().trim().regex(/^[a-z][a-z0-9-]{0,62}$/).optional(),
}).superRefine((s, ctx) => {
  if (s.baslangic !== undefined && s.bitis !== undefined && s.baslangic > s.bitis) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bitis'], message: 'Bitiş tarihi başlangıçtan önce olamaz.' });
  }
});

// Liste satırı gövdeyi ve parametreleri TAŞIMAZ (kart #48): yalnız hangi kaydın etkilendiğini söyleyen tam sayı
// kimlikler döner. Gövde `denetim.govde-oku` ile ayrı uçtan okunur.
export const kayitSatiri = z.object({
  id: z.number().int(),
  zaman: zamanSemasi,
  // Oturumsuz komutta (giriş) kişi yoktur.
  kisiId: z.number().int().nullable(),
  kisiAd: z.string().nullable(),
  yontem: z.string(),
  yol: z.string(),
  // Ucun modülü ve yetki işlemi (göç 20261008082740); daha eski satırlarda boştur, ekran o zaman komutu gösterir.
  modul: z.string().nullable(),
  yetki: z.string().nullable(),
  kimlikler: z.record(z.string(), z.number().int()),
});

export const kayitListesiCevabi = listeCevapSemasi(kayitSatiri);

export const suzgecSecenekleriCevabi = z.object({
  kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })),
  moduller: z.array(z.string()),
  komutlar: z.array(z.object({ yontem: z.string(), yol: z.string() })),
});

export const kayitIdParametresi = z.object({ id: z.coerce.number().int().positive() });

// Maskelenmiş içerik; kayıtta yoksa null.
export const kayitIcerigiCevabi = z.object({
  id: z.number().int(),
  parametre: z.unknown().transform((d) => d ?? null),
  govde: z.unknown().transform((d) => d ?? null),
});

// Eski/yeni değer defteri (392 a). Liste değerleri TAŞIMAZ: yalnız hangi tablonun hangi satırında hangi alanların değiştiği.
// Eski ve yeni değer içeriktir; kayıt gövdesiyle aynı yetkiyle (`denetim.govde-oku`) ayrı uçtan okunur.
export const DEGISIKLIK_ISLEMLERI = ['ekle', 'guncelle', 'sil'] as const;

const TABLO_ADI = /^[a-z_][a-z0-9_]{0,62}$/;

export const kayitSecimi = z.object({
  tablo: z.string().regex(TABLO_ADI),
  anahtar: z.record(z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/), z.union([z.number(), z.string().max(200), z.boolean()]))
    .refine((a) => Object.keys(a).length > 0 && Object.keys(a).length <= 4, 'Anahtar 1-4 alan taşır.'),
}).strict();

export const degisiklikListesiSorgusu = z.object({
  ...sayfaSorguAlanlari,
  kisi: z.coerce.number().int().positive().max(2147483647).optional(),
  baslangic: tarihSemasi.optional(),
  bitis: tarihSemasi.optional(),
  tablo: z.string().trim().regex(TABLO_ADI).optional(),
  // 1384 b: kayıt ekranındaki "Geçmiş" düğmesi; JSON dizisi. Satır, çiftlerden birinin tablosunda ve anahtarı o anahtarı
  // kapsıyorsa döner ({ kisi_id: 3 } kişinin bütün rol satırlarını da getirir).
  kayitlar: z.string().max(4000).transform((metin, ctx) => {
    try { return JSON.parse(metin) as unknown; } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Kayıt listesi okunamadı.' });
      return z.NEVER;
    }
  }).pipe(z.array(kayitSecimi).min(1).max(50)).optional(),
}).superRefine((s, ctx) => {
  if (s.baslangic !== undefined && s.bitis !== undefined && s.baslangic > s.bitis) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bitis'], message: 'Bitiş tarihi başlangıçtan önce olamaz.' });
  }
});

export const degisiklikSatiri = z.object({
  id: z.number().int(),
  zaman: zamanSemasi,
  // Göçle ya da arka işle yapılan değişimde kişi yoktur.
  kisiId: z.number().int().nullable(),
  kisiAd: z.string().nullable(),
  tablo: z.string(),
  anahtar: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  islem: z.enum(DEGISIKLIK_ISLEMLERI),
  alanAdlari: z.array(z.string()),
});

export const degisiklikListesiCevabi = listeCevapSemasi(degisiklikSatiri);

export const degisiklikSecenekleriCevabi = z.object({
  kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })),
  tablolar: z.array(z.string()),
});

// Maskelenmiş eski ve yeni değer; eklemede eski, silmede yeni null'dır.
export const degisiklikIcerigiCevabi = z.object({
  id: z.number().int(),
  alanlar: z.array(z.object({
    alan: z.string(),
    eski: z.unknown().transform((d) => d ?? null),
    yeni: z.unknown().transform((d) => d ?? null),
  })),
});

export type KayitListesiSorgusu = z.input<typeof kayitListesiSorgusu>;
export type KayitSatiri = z.output<typeof kayitSatiri>;
export type KayitListesiCevabi = z.output<typeof kayitListesiCevabi>;
export type SuzgecSecenekleriCevabi = z.output<typeof suzgecSecenekleriCevabi>;
export type KayitIcerigiCevabi = z.output<typeof kayitIcerigiCevabi>;
export type DegisiklikListesiSorgusu = z.input<typeof degisiklikListesiSorgusu>;
export type KayitSecimi = z.output<typeof kayitSecimi>;
export type DegisiklikSatiri = z.output<typeof degisiklikSatiri>;
export type DegisiklikListesiCevabi = z.output<typeof degisiklikListesiCevabi>;
export type DegisiklikSecenekleriCevabi = z.output<typeof degisiklikSecenekleriCevabi>;
export type DegisiklikIcerigiCevabi = z.output<typeof degisiklikIcerigiCevabi>;

// Ekranın tipli çağrısı (istemci/src/ortak/veri/uc-cagrisi.ts).
export interface DenetimUclari {
  'GET /denetim-kayitlari': { sorgu: KayitListesiSorgusu; cevap: KayitListesiCevabi };
  'GET /denetim-kayitlari/suzgecler': { cevap: SuzgecSecenekleriCevabi };
  'GET /denetim-kayitlari/:id/govde': { cevap: KayitIcerigiCevabi };
  'GET /denetim-degisiklikleri': { sorgu: DegisiklikListesiSorgusu; cevap: DegisiklikListesiCevabi };
  'GET /denetim-degisiklikleri/suzgecler': { cevap: DegisiklikSecenekleriCevabi };
  'GET /denetim-degisiklikleri/:id/icerik': { cevap: DegisiklikIcerigiCevabi };
}
