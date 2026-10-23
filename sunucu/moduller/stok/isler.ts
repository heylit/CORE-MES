import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { suresiDolanTeslimleriIptal } from './servis.ts';

// Yolda süresi (Soru 133): süresi dolan teslim dakikada bir iptal olur; ayar boşsa iş bir şey yapmaz.
export const isler = [
  isTanimi({ ad: 'stok-yolda-suresi', aralikMs: 60_000, calis: async (db) => { await suresiDolanTeslimleriIptal(db); } }),
];
