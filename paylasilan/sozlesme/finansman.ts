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

// 2238-2 a: faiz yıllık yüzde girilir; günlük ve aylık karşılığı basit faizle, 365 günlük yılla türer (1383 a ile aynı tanım).
export const yillikFaizdenGunluk = (yillikYuzde: number): number => yillikYuzde / 365;
export const yillikFaizdenAylik = (yillikYuzde: number): number => yillikYuzde / 12;
// Yıllık oranla gün sonra ödenecek tutarın bugünkü değer çarpanı (vadeIndirimCarpani'nın yıllık oranlı karşılığı).
export const yillikVadeIndirimCarpani = (yillikYuzde: number, gun: number): number => 1 / (1 + (yillikFaizdenGunluk(yillikYuzde) / 100) * Math.max(0, gun));

// Kur ve faiz matrisi (kart 2238): hangi oran nerede kullanılır. Sunucu hesapları bu tabloya göre oran seçer, ekran salt okunur
// gösterir; satır kullanımdır, değer o kullanımda okunacak oranlardır. Mevduat satış vadesinde, politika vadelerde taban olmaz.
export const KUR_TURLERI = ['alis', 'satis'] as const;
export type KurTuru = (typeof KUR_TURLERI)[number];
export const FAIZ_TURLERI = ['kredi', 'mevduat', 'politika'] as const;
export type FaizTuru = (typeof FAIZ_TURLERI)[number];
export const ORAN_KULLANIMLARI = {
  // 2238-1 c: muhasebe kaydı ve değerleme alış kuruyla.
  muhasebe: { kur: 'alis' },
  // Satın alma maliyeti satış kuruyla (döviz alınarak ödenir).
  satinAlmaMaliyeti: { kur: 'satis' },
  // 2238-3 c: satın alma vadesi iki sonuçla yan yana; borçluyken kredi, nakit fazlasıyken mevduat (stopaj sonrası).
  satinAlmaVadesi: { faizler: ['kredi', 'mevduat'] },
  // 2238-4 a: plan ve proje maliyetinde bekleme finansmanı TRY kredi faizi.
  beklemeFinansmani: { faiz: 'kredi', paraBirimi: 'TRY' },
} as const satisfies Record<string, { kur?: KurTuru; faiz?: FaizTuru; faizler?: readonly FaizTuru[]; paraBirimi?: string }>;
// Bu günden eski geçerlilikteki oran ekranda eski işaretlenir; hesap eski oranla sürer.
export const ORAN_ESKIME_GUNU = 30;
