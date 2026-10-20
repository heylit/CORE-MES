import { z } from 'zod';
import { KAYIT_ARAMA_EN_COK_SONUC, KAYIT_ARAMA_EN_KISA, KAYIT_ARAMA_EN_UZUN, kayitYoluMu, type IkinciMenuSayaclari, type KayitAramaCevabi } from './sayfa-tanimi.ts';

// İkinci menünün sayaç ucunun cevap şeması (`uc({ cevap: ikinciMenuSayacSemasi })`): madde anahtarı -> sayı.
// Sayılamayan madde null döner ya da hiç yazılmaz; kabuk o maddede sayı göstermez. Yalın tip `sayfa-tanimi.ts`
// içindedir (istemci zod taşımaz); şema ondan ayrışırsa burada derlenmez.
export const ikinciMenuSayacSemasi: z.ZodType<IkinciMenuSayaclari> = z.record(z.string(), z.number().int().nonnegative().nullable());

// Arama ucunun sorgu ve cevap şemaları (`uc({ sorgu: kayitAramaSorguSemasi, cevap: kayitAramaCevapSemasi })`). Yol
// uygulama içi adrestir (`kayitYoluMu`).
export const kayitAramaSorguSemasi = z.object({
  q: z.string().trim().min(KAYIT_ARAMA_EN_KISA).max(KAYIT_ARAMA_EN_UZUN),
});
export const kayitAramaCevapSemasi: z.ZodType<KayitAramaCevabi> = z.object({
  sonuclar: z.array(z.object({
    anahtar: z.string().min(1),
    baslik: z.string().min(1),
    aciklama: z.string().nullable(),
    yol: z.custom<`/${string}`>(kayitYoluMu, 'uygulama içi adres değil'),
  })).max(KAYIT_ARAMA_EN_COK_SONUC),
});
