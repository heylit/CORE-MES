import { createContext, useContext, useEffect } from 'react';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';

// Panodaki kart sayısının sıfır olduğunu kabuğa bildirir: "Bana düşen işler" ve "Uyarılar" yalnız yapılacak olanı gösterir.
// Kart sayısını yalnız modül bilir; kabuk yalnız bu bildirimi okur. Pano dışında (sayfa içinde) bağlam yoktur, bildirim düşer.
export const PanoKartiBaglami = createContext<((sifir: boolean) => void) | null>(null);

export function useSifirBildir(sifir: boolean): void {
  const bildir = useContext(PanoKartiBaglami);
  useEffect(() => { bildir?.(sifir); }, [bildir, sifir]);
}

// Rol panosunun kaynağı (kart 1585) verisini kabuğa bu bağlamla bildirir. undefined: yükleniyor; null: alınamadı.
// Kaynak her çizimde yeni dizi verebilir; kabuk içerik aynıysa durumu değiştirmez, döngü kurulmaz.
export type KaynakVerisi = readonly IsKalemi[] | readonly GidisatOlcusu[] | null | undefined;
export const PanoKaynakBaglami = createContext<((veri: KaynakVerisi) => void) | null>(null);

export function useKaynakBildir(veri: KaynakVerisi): void {
  const bildir = useContext(PanoKaynakBaglami);
  useEffect(() => { bildir?.(veri); }, [bildir, veri]);
}
