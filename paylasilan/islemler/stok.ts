// Okuma uçları stok sayfası ya da bu işlemlerden biriyle açılır (ST5 a). Yazma işlemleri rollere çekirdek göçüyle verilir.
// stok.eksi-onayla (1387 a): elle eksiye düşüm onayı; yalnız müdür. Hareket geri alma (stok.geri-al) da yalnız müdürdedir.
export const STOK_ISLEMLERI = ['stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir', 'stok.eksi-onayla'] as const;
// Malzeme · Teslim (kart #1208): bütün rollerde; malzeme istemek, teslim göndermek ve kendine geleni almak. Stok okuma açmaz.
export const STOK_ISTEK_ISLEMLERI = ['stok.istek'] as const;
// Malzeme fişini Logo'ya elle gönderme ve hatalı fişi yeniden gönderme (295 a, 299 a): yönetici ve depo. Stok okuma açmaz.
export const STOK_FIS_ISLEMLERI = ['stok.malzeme-fisi-gonder'] as const;
// Sayım farkı onayı (1279 a, 1691 teyit): eşiği aşan sayım farkını sayandan başka kişi onaylar; yalnız müdür. Stok okuma açmaz.
export const STOK_SAYIM_ONAY_ISLEMLERI = ['stok.sayim-onayla'] as const;
