// Eski Arkon'un ekran ölçeği (baslat.ts useFit): sayfa 1600x900'lük yoğun pano düzeniyle çizilir ve alana sığacak kadar
// küçültülür ya da büyütülür. Dar ya da dik ekranda (telefon, dik tablet) ölçek 1'dir, düzen kendi kırılımlarına bırakılır.
// TMI içinde Arkon'un kendi sol menüsü olmadığından menü payı yoktur (eskide gömülü açılışta da yoktu).
export const TASARIM_GENISLIGI = 1600;
export const TASARIM_YUKSEKLIGI = 900;

export interface Olcek { mobil: boolean; z: number }

// `carpan` cihazda saklanan elle ölçek çarpanıdır ('arkon:scale'); geçersizse yok sayılır.
export function olcekHesapla(genislik: number, yukseklik: number, carpan: number | null = null): Olcek {
  const mobil = genislik < 900 || (genislik < 1200 && yukseklik > genislik * 1.05);
  if (mobil) return { mobil, z: 1 };
  let z = Math.min(genislik / TASARIM_GENISLIGI, yukseklik / TASARIM_YUKSEKLIGI);
  if (carpan !== null && Number.isFinite(carpan) && carpan > 0) z *= carpan;
  return { mobil, z: Math.max(0.5, Math.min(2, z)) };
}
