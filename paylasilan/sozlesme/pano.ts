import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';

// Rol panosunun ortak dili (kart 1585; 1591 c, 1592 a). Kalemi ve ölçüyü modül üretir; kabuk yalnız birleştirir ve dizer.
// Okuma ucu bu şemalarla cevap verirse aynı kalem sunucudan da gelebilir.

// Sıra önemlidir: önce gelen daha acildir. "bekliyor" başkasının işini durduran iştir (ilk parça, hazırlık onayı).
export const ACILIYETLER = ['gecikmis', 'bekliyor', 'bugun', 'hafta'] as const;
export type Aciliyet = (typeof ACILIYETLER)[number];

export const isKalemiSemasi = z.object({
  // Kaynak içinde tekil (kayıt kimliği ya da kayıt + adım).
  anahtar: z.string().min(1),
  baslik: z.string().min(1),
  ayrinti: z.string().nullable(),
  aciliyet: z.enum(ACILIYETLER),
  // Eşit aciliyette erken olan önce; yoksa null.
  sonTarih: zamanSemasi.nullable(),
  // Kaydı ya da süzülmüş listeyi açan uygulama içi yol; modül kökü değil.
  yol: z.string().startsWith('/'),
  // Satırdaki tek düğmenin adı (Onayla, Planla, Aç).
  eylem: z.string().min(1),
  // Kalem yönlendirme şeridine çıkarsa "neden şimdi" cümlesi; yoksa ayrıntı yazılır.
  neden: z.string().nullable(),
});
export type IsKalemi = z.infer<typeof isKalemiSemasi>;

// Kıyasın hangi yönü iyidir; null: yön yok (yalnız bilgi).
export const IYI_YONLER = ['artis', 'azalis'] as const;

// Hedef değeri yoktur (1592 a): ölçü yalnız gerçek bir kıyasla (dün, geçen hafta, plan) okunur.
export const gidisatOlcusuSemasi = z.object({
  anahtar: z.string().min(1),
  ad: z.string().min(1),
  // Veri yoksa null; sıfır uydurulmaz.
  deger: z.number().nullable(),
  birim: z.string(),
  kiyas: z.object({ etiket: z.string().min(1), deger: z.number().nullable(), iyiYon: z.enum(IYI_YONLER).nullable() }).nullable(),
  // Plana karşı ölçüde planın bu ana düşen değeri; doluluk çubuğu çizilir.
  plan: z.number().nonnegative().nullable(),
  // Eski değerden yeniye; ikiden azsa eğilim çizilmez.
  seri: z.array(z.number()),
  // Dağılım ölçüsü (duruş nedeni, istasyon doluluğu); boşsa çizilmez.
  dagilim: z.array(z.object({ etiket: z.string().min(1), deger: z.number() })),
});
export type GidisatOlcusu = z.infer<typeof gidisatOlcusuSemasi>;
