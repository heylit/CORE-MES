// Okuma uçları stok sayfası ya da bu işlemlerden biriyle açılır (ST5 a). Yazma işlemleri rollere çekirdek göçüyle verilir.
export const STOK_ISLEMLERI = ['stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir'] as const;
// Malzeme · Teslim (kart #1208): bütün rollerde; malzeme istemek, teslim göndermek ve kendine geleni almak. Stok okuma açmaz.
export const STOK_ISTEK_ISLEMLERI = ['stok.istek'] as const;
