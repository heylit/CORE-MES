import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { temizle } from './servis.ts';

// Bayat şerit ve süresi dolmuş bağsız dosya saatte bir silinir: süreler gün ölçeğinde; temizlik kullanıcının yüklemesini uzatmaz.
export const isler = [
  isTanimi({ ad: 'dosya-temizlik', aralikMs: 3_600_000, calis: async (db) => { await temizle(db); } }),
];
