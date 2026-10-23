// Prototipin gösterim yardımcıları; adlar ve çıktı prototipinkidir (değer yoksa tire).

export const YOK = '—';

export function fmt(x: number | null | undefined, d?: number): string {
  if (x == null || Number.isNaN(x)) return YOK;
  const v = d == null ? x : Number(Number(x).toFixed(d));
  return String(v).replace('.', ',');
}
export function fint(x: number): string { return Math.round(x).toLocaleString('tr-TR'); }
export function pad2(n: number): string { return (n < 10 ? '0' : '') + String(n); }
export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
export function sstep(a: number, b: number, x: number): number { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function upTR(s: string): string { try { return s.toLocaleUpperCase('tr-TR'); } catch { return s.toUpperCase(); } }
export function lc(s: unknown): string {
  const m = String(s ?? '');
  try { return m.toLocaleLowerCase('tr-TR'); } catch { return m.toLowerCase(); }
}
export function fmtN(x: number | null | undefined, d?: number): string {
  if (x == null || !Number.isFinite(x)) return YOK;
  return Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 0 });
}
// Virgüllü ondalık da okunur; sayı değilse varsayılan döner.
export function num(v: unknown, d: number): number;
export function num(v: unknown, d?: number): number | undefined;
export function num(v: unknown, d?: number): number | undefined {
  const x = Number.parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isNaN(x) ? d : x;
}
