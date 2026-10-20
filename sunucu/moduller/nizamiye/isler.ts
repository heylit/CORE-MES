import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { pdksHamTemizle } from './servis.ts';

// Kart okuyucunun ham gövdesi saklama süresi (TMIV2_PDKS_HAM_SAKLAMA_GUN, varsayılan 365 gün) dolunca silinir; süre gün ölçeğinde.
export const isler = [
  isTanimi({ ad: 'nizamiye-pdks-ham-temizlik', aralikMs: 6 * 3_600_000, calis: (db) => pdksHamTemizle(db) }),
];
