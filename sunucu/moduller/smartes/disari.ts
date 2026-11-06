import { smartesAyariOku } from './ayar.ts';

// Güvenlik Merkezi ayar denetimi (2164) yalnız bağlantının açık olup olmadığını okur; adres modülden çıkmaz.
export function smartesBaglantisiAcikMi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return smartesAyariOku(env) !== null;
}
