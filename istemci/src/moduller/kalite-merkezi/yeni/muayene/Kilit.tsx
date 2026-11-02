import { kilitliMi } from '../kurallar.ts';
import type { KmKayit, KmKoleksiyonu } from '../tipler.ts';

export type KilitKarari = 'ac' | 'yasak';

// Tamamlanmış kayıt (sonuçlu muayene, kararlı lot) kilitlidir; sunucu kimse için değiştirmez (KM-K89). Düzeltme yeni kayıtla yapılır.
export function kilitKarari(kol: KmKoleksiyonu, kayit: KmKayit | null | undefined): KilitKarari {
  return kayit && kilitliMi(kol, kayit) ? 'yasak' : 'ac';
}

export const KILIT_YASAK = 'Bu kayıt tamamlanmış ve kilitli; değiştirilemez. Düzeltme için yeni kayıt açın.';
