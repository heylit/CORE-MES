import { smartesAyariOku } from './ayar.ts';

// SmartES hesapları (kart 3174): CORE'un makine OEE'sini kablolama bağlar (OEE modülü aynı kattadır).
export { coreOeeCozucusuKaydet } from './servis.ts';
export type { CoreOeeCozucusu } from './servis.ts';

// Güvenlik Merkezi ayar denetimi (2164) yalnız bağlantının açık olup olmadığını okur; adres modülden çıkmaz.
export function smartesBaglantisiAcikMi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return smartesAyariOku(env) !== null;
}

// Tezgah bağlantısı denemesi (3373) aynı kodlu makinenin son SmartES değerini yan yana gösterir; yalnız okur.
export { smartesMakineDegerleri } from './servis.ts';
