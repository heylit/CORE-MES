// Zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
// 1350 a: faizin tek kaynağı finans_faiz'in aylık yüzdesidir. Günlük oran yıl 365 gün, ay yılın 12'de biri sayılarak ondan türer
// (proje maliyetindeki çevirmeyle aynı); günlük girilen oran aylığa çevrilip dört ondalığa yuvarlanarak yazılır.
// 1383 a: finansman maliyetinin tek tanımı budur: yıllık tek oran (aylık x 12), basit faiz, 365 gün. Plan, proje maliyeti, satın alma ve
// kur/faiz şeridi oranı ve tutarı yalnız bu işlevlerle hesaplar; bileşik faiz ve 30 günlük ay kullanılmaz.
export const aylikFaizdenGunluk = (aylikYuzde: number): number => (aylikYuzde * 12) / 365;
export const aylikFaizdenYillik = (aylikYuzde: number): number => aylikYuzde * 12;
// Tutarın gün boyunca bağlı kalmasının basit faizi; oran günlük yüzdedir.
export const finansmanTutari = (tutar: number, gunlukYuzde: number, gun: number): number => (tutar * gunlukYuzde * gun) / 100;
// Gün sonra ödenecek tutarın bugünkü değer çarpanı, basit faizle: 1 / (1 + günlük oran x gün).
export const vadeIndirimCarpani = (aylikYuzde: number, gun: number): number => 1 / (1 + (aylikFaizdenGunluk(aylikYuzde) / 100) * Math.max(0, gun));
export const gunlukFaizdenAylik = (gunlukYuzde: number): number => Math.round(((gunlukYuzde * 365) / 12) * 1e4) / 1e4;
