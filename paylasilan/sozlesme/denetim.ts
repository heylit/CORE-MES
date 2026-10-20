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
  kimlikler: z.record(z.string(), z.number().int()),
});

export const kayitListesiCevabi = listeCevapSemasi(kayitSatiri);

export const suzgecSecenekleriCevabi = z.object({
  kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })),
  komutlar: z.array(z.object({ yontem: z.string(), yol: z.string() })),
});

export const kayitIdParametresi = z.object({ id: z.coerce.number().int().positive() });

// Maskelenmiş içerik; kayıtta yoksa null.
export const kayitIcerigiCevabi = z.object({
  id: z.number().int(),
  parametre: z.unknown().transform((d) => d ?? null),
  govde: z.unknown().transform((d) => d ?? null),
});

export type KayitListesiSorgusu = z.input<typeof kayitListesiSorgusu>;
export type KayitSatiri = z.output<typeof kayitSatiri>;
export type KayitListesiCevabi = z.output<typeof kayitListesiCevabi>;
export type SuzgecSecenekleriCevabi = z.output<typeof suzgecSecenekleriCevabi>;
export type KayitIcerigiCevabi = z.output<typeof kayitIcerigiCevabi>;

// Ekranın tipli çağrısı (istemci/src/ortak/veri/uc-cagrisi.ts).
export interface DenetimUclari {
  'GET /denetim-kayitlari': { sorgu: KayitListesiSorgusu; cevap: KayitListesiCevabi };
  'GET /denetim-kayitlari/suzgecler': { cevap: SuzgecSecenekleriCevabi };
  'GET /denetim-kayitlari/:id/govde': { cevap: KayitIcerigiCevabi };
}
