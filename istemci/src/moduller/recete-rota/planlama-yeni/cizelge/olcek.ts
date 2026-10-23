// Plan çizelgesinin ölçeği (saf). Plan saat eksenlidir: 0, planın başlangıç günü 00:00'dır (girdi.betik parseT). Tahta, pano ve
// atölye aynı ölçeği kullanır; yakınlık bugünkü sayfadaki gibi saat başına ekran birimidir (a-durum.betik U.zoom, varsayılan 10).
export const VARSAYILAN_YAKINLIK = 10;
export const EN_AZ_YAKINLIK = 2;
export const EN_COK_YAKINLIK = 80;

export interface Olcek { bas: number; bit: number; yakinlik: number }

export function olcekKur(bas: number, bit: number, yakinlik = VARSAYILAN_YAKINLIK): Olcek {
  const y = Math.min(EN_COK_YAKINLIK, Math.max(EN_AZ_YAKINLIK, yakinlik));
  return bit > bas ? { bas, bit, yakinlik: y } : { bas, bit: bas + 24, yakinlik: y };
}

export const genislik = (o: Olcek): number => (o.bit - o.bas) * o.yakinlik;

// Saat -> yatay konum; pencere dışındaki saat kenara kırpılır.
export function konum(o: Olcek, saat: number): number {
  return (Math.min(o.bit, Math.max(o.bas, saat)) - o.bas) * o.yakinlik;
}

// Pencereyle kesişmeyen çubuk çizilmez (null).
export function cubukAraligi(o: Olcek, bas: number, bit: number): { x: number; en: number } | null {
  if (bit <= o.bas || bas >= o.bit || bit < bas) return null;
  const x = konum(o, bas);
  return { x, en: Math.max(1, konum(o, bit) - x) };
}

// Gün çizgileri: pencerenin içindeki her gün başı (saat 24'ün katları).
export function gunCizgileri(o: Olcek): number[] {
  const ilk = Math.ceil(o.bas / 24) * 24;
  const y: number[] = [];
  for (let s = ilk; s <= o.bit; s += 24) y.push(s);
  return y;
}
