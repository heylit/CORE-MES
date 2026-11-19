import { z } from 'zod';

// 3438 a: revizyon ve alternatif, ana kartın altında kendi kodu, stoğu ve rotası olan alt karttır (tek seviye). Ana kart stoklu kalır ve ilk revizyondur.
export const ALT_KART_TURLERI = ['revizyon', 'alternatif'] as const;
export const REVIZYON_DURUMLARI = ['taslak', 'yururlukte', 'eski'] as const;
export type AltKartTuru = (typeof ALT_KART_TURLERI)[number];
export type RevizyonDurumu = (typeof REVIZYON_DURUMLARI)[number];

export const altKartEtiketi = z.string().trim().min(1).max(20);

const aileKarti = z.object({
  kimlik: z.string(),
  no: z.number().int(),
  stokKodu: z.string(),
  ad: z.string().nullable(),
  onayDurumu: z.string(),
  altTur: z.enum(ALT_KART_TURLERI).nullable(),
  // Revizyonda kartın etiketi; ana kartta alt etiket yoktur, çizim revizyonu (kartın Revizyon alanı) gösterilir.
  etiket: z.string().nullable(),
  revDurumu: z.enum(REVIZYON_DURUMLARI).nullable(),
});
export type AileKarti = z.output<typeof aileKarti>;

// Kartın ailesi: ana kart, revizyonlar (ana kart dahil değil) ve alternatifler. Bağı olmayan kart kendi başına ana karttır.
export const altKartAilesiCevabi = z.object({
  ana: aileKarti,
  revizyonlar: z.array(aileKarti),
  alternatifler: z.array(aileKarti),
});
export type AltKartAilesiCevabi = z.output<typeof altKartAilesiCevabi>;

// Var olan kart revizyon olarak bağlanır (yeni revizyon kartı kopyayla açılıp kaydedildikten sonra da bu uçla bağlanır).
// `eskiRevizyon`: geçmişte kullanılmış eski revizyon kartı; yürürlüğe alınmadan eski olarak bağlanır.
export const altKartaBaglaGovdesi = z.object({ anaKimlik: z.string().min(1).max(64), etiket: altKartEtiketi, eskiRevizyon: z.boolean().default(false) });
export type AltKartaBaglaGovdesi = z.input<typeof altKartaBaglaGovdesi>;
export const altKartIslemCevabi = z.object({ id: z.string() });
