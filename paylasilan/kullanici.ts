import { z } from 'zod';
import { islemMi } from './islemler.ts';
import type { Islem } from './islemler.ts';

// Oturumdaki kullanıcı: sunucudaki yetki denetimi ve istemcideki menü aynı biçimi kullanır.
// Yetki yalnız işlem listesidir; "bütün işlemler" de burada açık liste olarak gelir.
export const kullaniciSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  islemler: z.array(z.string().refine((deger): deger is Islem => islemMi(deger))),
  // Girişte açılacak sayfa (rolden); null ya da yoksa ana sayfa. Yetki değildir: sayfayı görmeyen kullanıcı ana sayfada kalır.
  acilisSayfasi: z.string().nullable().optional(),
  // Firma kişisi (1224 a): işlemlerinden bağımsız olarak yalnız portal ve oturum uçlarına girer. Yoksa iç kişidir.
  disIzleyici: z.boolean().optional(),
});

export type Kullanici = z.output<typeof kullaniciSemasi>;
