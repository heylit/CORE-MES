// Fabrika Haritası eşlemesi (kart #686, #1304; 2884): haritadaki bu türlerdeki alan stok konumu olur; fabrika geneli türler bölüm
// deposu yoksa ANA depoya bağlanır. Sunucudaki eşleme kuralı ve Stok Ayarlar notu aynı listeyi kullanır. Zod taşımaz (istemci değer
// olarak ithal eder; eslint.config.js ZODSUZ listesinde).
export const HARITA_ALAN_TURLERI = ['kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'ara_alan', 'hurda', 'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet'] as const;
export type HaritaAlanTuru = (typeof HARITA_ALAN_TURLERI)[number];
export const FABRIKA_GENELI_ALAN_TURLERI = ['fason', 'ara_alan', 'hurda', 'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet'] as const satisfies readonly HaritaAlanTuru[];
