import { yaziciAgiOku } from './ag.ts';

// Güvenlik Merkezi ayar denetimi (2164) yalnız doğrudan baskının açık olup olmadığını okur; adres aralığı modülden çıkmaz.
export function yaziciBaglantisiAcikMi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return yaziciAgiOku(env) !== null;
}

// 3124 a: malzeme etiketinin GKK satırı Kalite Merkezi'nden kablolamayla bağlanır (mal kabul satırı kimliğiyle toplu; yetki denetlemez).
export { gkkOzetiCozucusuKaydet } from './servis.ts';
export type { GkkOzetiCozucusu } from './servis.ts';
