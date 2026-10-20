// Renk tek başına anlam taşımaz: durum her yerde metniyle birlikte gösterilir; bu ad yalnız rengi seçer.
export type MakineDurumu = 'sirada' | 'ayar' | 'calisiyor' | 'durakli' | 'durdu' | 'bitti';

const SAYI = new Intl.NumberFormat('tr-TR');
export const sayiYaz = (n: number): string => SAYI.format(n);
