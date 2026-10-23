import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// Uygulamanın UI.f.arsiv'i: "Listelerde arşivlenmiş kayıtları göster" tek ve geneldir (Arşiv ekranında), ekran açık kaldıkça sürer.
interface ArsivGorunumu { goster: boolean; yaz: (goster: boolean) => void }
const Baglam = createContext<ArsivGorunumu>({ goster: false, yaz: () => undefined });

export function ArsivGorunumuSaglayici({ children }: { children: ReactNode }) {
  const [goster, yaz] = useState(false);
  const deger = useMemo(() => ({ goster, yaz }), [goster]);
  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export const useArsivGorunumu = (): ArsivGorunumu => useContext(Baglam);
