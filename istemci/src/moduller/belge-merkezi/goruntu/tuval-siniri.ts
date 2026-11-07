// Tuval sınırı: alan 2^25 piksel, kenar 16384. Chrome ve Edge daha büyüğünü kabul eder, ancak her kat bellekte dört bayttır;
// A1 paftayı %800'de iki kat yoğunlukla çizmek yüzlerce MB ister. Sınırı aşan büyütmede tuval CSS ile büyütülür.
export const EN_COK_ALAN = 2 ** 25;
export const EN_COK_KENAR = 16384;

export function tuvalYogunlugu(en: number, boy: number, istenen: number): number {
  const sinir = Math.min(Math.sqrt(EN_COK_ALAN / Math.max(1, en * boy)), EN_COK_KENAR / Math.max(1, en, boy));
  return Math.min(istenen, sinir);
}
