import { z } from 'zod';
import { islemMi } from './islemler.ts';
import type { Islem } from './islemler.ts';

// Cihaz profili (kart #1358, 1347 a): kişinin yetkisi rolüyle bulunduğu cihazın profilinin kesişimidir. Cihazı sunucu ortak cihaz
// çerezinden bulur; istemcinin beyanı değildir.
export const CIHAZ_PROFILLERI = ['tam', 'istasyon', 'telefon'] as const;
export type CihazProfili = (typeof CIHAZ_PROFILLERI)[number];

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
  // Oturumun açık olduğu cihazın profili; yoksa sınır yoktur (akıllı saat belirteci gibi). İşlem listesi buna göre süzülmüş gelir.
  cihazProfili: z.enum(CIHAZ_PROFILLERI).optional(),
});

export type Kullanici = z.output<typeof kullaniciSemasi>;
