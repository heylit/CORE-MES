import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { geceDefterKarsilastirmasi, rafKodGecisiIsi, suresiDolanTeslimleriIptal } from './servis.ts';

// Yolda süresi (Soru 133): süresi dolan teslim dakikada bir iptal olur; ayar boşsa iş bir şey yapmaz.
export const isler = [
  isTanimi({ ad: 'stok-yolda-suresi', aralikMs: 60_000, calis: async (db) => { await suresiDolanTeslimleriIptal(db); } }),
  // Gece defter karşılaştırması (1692 a): saatte bir bakılır, günde bir kez karşılaştırılır.
  // 3177 b: güncellemeden sonra raf gözü konumları bir kez sıra numaralı koda geçer; geçiş kaydı yazıldıktan sonra iş yalnız bakar.
  isTanimi({ ad: 'stok-raf-kod-gecisi', aralikMs: 60_000, calis: async (db) => { await rafKodGecisiIsi(db); } }),
  isTanimi({ ad: 'stok-defter-karsilastirma', aralikMs: 3_600_000, calis: async (db) => { await geceDefterKarsilastirmasi(db); } }),
];
