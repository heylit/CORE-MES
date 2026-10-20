import { createContext, useContext } from 'react';
import type { GozKalemi, GozKalemiGovdesi, KayitCevabi, YerlesimGovdesi } from '#paylasilan/sozlesme/atolye.ts';

// Depo paneli başka sayfaya gömüldüğünde (Stok Merkezi > Depo, kart #1304) harita düzenleme yetkisi olmayan kişi raf ve
// göz kalemini o sayfanın uçlarıyla yazar. Verilmezse (null) haritanın kendi uçları kullanılır.
export interface DepoYazimi {
  rafKaydet: (salonId: number, govde: { surum: number; raflar: YerlesimGovdesi['raflar'] }) => Promise<KayitCevabi>;
  kalemYaz: (govde: GozKalemiGovdesi) => Promise<GozKalemi>;
  kalemSil: (id: number) => Promise<void>;
}

export const DepoYazimiBaglami = createContext<DepoYazimi | null>(null);
export const useDepoYazimi = (): DepoYazimi | null => useContext(DepoYazimiBaglami);
