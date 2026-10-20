import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';

export type { Kullanici };

// Yetki yalnız listedir: rol, bayrak ya da kapsama ilişkisi burada bilinmez; kimlik yüklenirken çözülmüştür.
export function islemVarMi(kullanici: Kullanici, islem: Islem): boolean {
  return kullanici.islemler.includes(islem);
}
