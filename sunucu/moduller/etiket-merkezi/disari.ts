import { yaziciAgiOku } from './ag.ts';

// Güvenlik Merkezi ayar denetimi (2164) yalnız doğrudan baskının açık olup olmadığını okur; adres aralığı modülden çıkmaz.
export function yaziciBaglantisiAcikMi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return yaziciAgiOku(env) !== null;
}
