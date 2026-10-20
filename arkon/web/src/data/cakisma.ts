// Eşzamanlı yazmada üç yollu birleştirme (taban = tabletin son bildiği sürüm, yerel = tabletin değişikliği, uzak = sunucudaki).
// Yalnız bir tarafın değiştirdiği alan korunur; iki tarafın da değiştirdiği alanda sunucudaki geçerlidir ve alan çakışan
// olarak bildirilir, tablet uyarır (karar 53). Dizi ve düz değer bütün olarak alınır.
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x) && !ArrayBuffer.isView(x);
const same = (a: unknown, b: unknown): boolean => { if (a === b) return true; try { return JSON.stringify(a) === JSON.stringify(b); } catch (e: any) { return false; } };

export const CAKISMA_OLAYI = 'arkon-cakisma';
export const CAKISMA_ILETISI = 'Kayıt başka cihazda da değişmişti; sunucudaki hali geçerli oldu';

export function merge3(base: any, loc: any, rem: any): { doc: any; cakisan: string[] } {
  const cakisan: string[] = [];
  const birlestir = (b: any, l: any, r: any, yol: string): any => {
    if (same(l, r)) return l;
    if (b !== undefined && same(l, b)) return r;
    if (b !== undefined && same(r, b)) return l;
    if (isObj(l) && isObj(r)) { const o: Record<string, any> = {}, B = isObj(b) ? b : {}; for (const k of new Set(Object.keys(l).concat(Object.keys(r)))) { if (!(k in l) && k in B && same(B[k], r[k])) continue; if (!(k in r) && k in B && same(B[k], l[k])) continue; o[k] = k in l ? (k in r ? birlestir(B[k], l[k], r[k], yol ? yol + '.' + k : k) : l[k]) : r[k]; } return o; }
    cakisan.push(yol);
    return r;
  };
  return { doc: birlestir(base, loc, rem, ''), cakisan };
}
