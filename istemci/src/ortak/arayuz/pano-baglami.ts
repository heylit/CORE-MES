import { createContext, useContext, useEffect } from 'react';

// Panodaki kart sayısının sıfır olduğunu kabuğa bildirir: "Bana düşen işler" ve "Uyarılar" yalnız yapılacak olanı gösterir.
// Kart sayısını yalnız modül bilir; kabuk yalnız bu bildirimi okur. Pano dışında (sayfa içinde) bağlam yoktur, bildirim düşer.
export const PanoKartiBaglami = createContext<((sifir: boolean) => void) | null>(null);

export function useSifirBildir(sifir: boolean): void {
  const bildir = useContext(PanoKartiBaglami);
  useEffect(() => { bildir?.(sifir); }, [bildir, sifir]);
}
