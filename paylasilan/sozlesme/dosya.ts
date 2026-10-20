import { z } from 'zod';

// Dosya saklama (kart #82, ADR 0009): içerik özetle tekil, PostgreSQL içinde parça parça. Yükleme JSON gövdesinde parça
// parça gelir (her parça gövde sınırının altında kalır); indirme dosyayı bağlayan modülün ucundan ikili cevapla döner.
export const DOSYA_PARCASI = 512 * 1024;
export const AZAMI_DOSYA = 200 * 1024 * 1024;
const AZAMI_PARCA_SAYISI = Math.ceil(AZAMI_DOSYA / DOSYA_PARCASI);

// Tür ilk baytlardan bulunur; yükleyenin bildirdiği MIME'a güvenilmez.
export const DOSYA_TURLERI = ['pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf', 'dxf'] as const;
export type DosyaTuru = (typeof DOSYA_TURLERI)[number];

export const dosyaOzeti = z.string().regex(/^[0-9a-f]{64}$/, 'Özet 64 haneli onaltılık olmalı.');
export const dosyaParametresi = z.object({ ozet: dosyaOzeti });

export const eksiklerGovdesi = z.object({ ozetler: z.array(dosyaOzeti).min(1).max(500) });
export const eksiklerCevabi = z.object({ eksikler: z.array(dosyaOzeti) });

export const dosyaParcasiGovdesi = z.object({
  sira: z.number().int().nonnegative().max(AZAMI_PARCA_SAYISI - 1),
  toplam: z.number().int().positive().max(AZAMI_PARCA_SAYISI),
  veri: z.string().min(1).max(Math.ceil(DOSYA_PARCASI / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Parça base64 olmalı.'),
}).refine((g) => g.sira < g.toplam, { message: 'Parça sırası toplamdan küçük olmalı.', path: ['sira'] });
// tamam: bütün parçalar geldi ve içerik özetle doğrulandı (ya da dosya zaten vardı).
export const dosyaParcasiCevabi = z.object({ tamam: z.boolean() });

// Bağlayan modülün listesinde dönen satır. Ad, kaydın ekranında görünen addır; dosyanın kendisi adsızdır.
export const bagliDosyaSemasi = z.object({
  ozet: dosyaOzeti,
  ad: z.string(),
  boyut: z.number().int().positive(),
  tur: z.enum(DOSYA_TURLERI),
  belgeTuru: z.string().nullable(),
  ekleyenId: z.number().int(),
  zaman: z.string(),
});

export type DosyaParcasiGovdesi = z.input<typeof dosyaParcasiGovdesi>;
export type EksiklerGovdesi = z.input<typeof eksiklerGovdesi>;
export type BagliDosya = z.output<typeof bagliDosyaSemasi>;
