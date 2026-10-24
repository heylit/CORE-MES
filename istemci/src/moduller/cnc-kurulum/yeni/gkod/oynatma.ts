// Oynatma: zaman -> hareket, hareket ici konum, hiz, zaman cizelgesi ve takim degisimi listesi.
import type { Program, TakimNo } from './tipler.ts';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function gLocate(p: Program, t: number): { i: number; f: number } {
  const c = p.cum;
  let lo = 0, hi = p.moves.length - 1;
  if (!p.moves.length) return { i: 0, f: 0 };
  if (t >= p.total) return { i: p.moves.length - 1, f: 1 };
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid]! <= t) lo = mid; else hi = mid - 1; }
  const mv = p.moves[lo]!;
  return { i: lo, f: mv.dur > 0 ? clamp((t - c[lo]!) / mv.dur, 0, 1) : 1 };
}

export function gPosAt(p: Program, i: number, f: number): [number, number, number] {
  const mv = p.moves[i]!;
  if (!mv.pts) return [mv.a[0]! + (mv.b[0]! - mv.a[0]!) * f, mv.a[1]! + (mv.b[1]! - mv.a[1]!) * f, mv.a[2]! + (mv.b[2]! - mv.a[2]!) * f];
  const P = mv.pts, n = P.length / 3, x = f * n, k = Math.min(n - 1, Math.floor(x)), u = x - k;
  const p0 = k ? [P[(k - 1) * 3]!, P[(k - 1) * 3 + 1]!, P[(k - 1) * 3 + 2]!] : mv.a, p1 = [P[k * 3]!, P[k * 3 + 1]!, P[k * 3 + 2]!];
  return [p0[0]! + (p1[0]! - p0[0]!) * u, p0[1]! + (p1[1]! - p0[1]!) * u, p0[2]! + (p1[2]! - p0[2]!) * u];
}

// Dakika / saniye cinsinden program suresi ilerlemesi; 'auto' butun programi yaklasik 45 saniyede oynatir.
export function gSpeed(p: Program | null, hiz: string): number {
  if (!p) return 1;
  if (hiz === 'auto') return Math.max(p.total / 45, 1 / 60);
  const v = parseFloat(hiz);
  return (isNaN(v) ? 1 : v) / 60;
}

export function hareketBaslangici(p: Program, i: number): number {
  const k = clamp(i, 0, p.moves.length - 1);
  return p.cum[k]! + 1e-9;
}

export function satirHareketi(p: Program, ln: number): number {
  for (let k = 0; k < p.moves.length; k++) if (p.moves[k]!.ln >= ln) return k;
  return -1;
}

export interface CizelgeParcasi { T: TakimNo; s: number; e: number }

// Ardisik ayni takim hareketleri tek parca olur.
export function zamanCizelgesi(p: Program): CizelgeParcasi[] {
  const segs: CizelgeParcasi[] = [];
  let cur: CizelgeParcasi | null = null;
  p.moves.forEach((mv, k) => {
    if (!cur || cur.T !== mv.T) { cur = { T: mv.T, s: p.cum[k]!, e: p.cum[k + 1]! }; segs.push(cur); }
    else cur.e = p.cum[k + 1]!;
  });
  return segs;
}


// Takim degisimi satirinin programdaki zamani (o satirdan sonraki ilk hareketin baslangici).
export function degisimZamani(p: Program, ln: number): number | null {
  const k = satirHareketi(p, ln);
  return k >= 0 ? p.cum[k]! : null;
}

// "Takim degisimleri" kipinde satir listesi; konum, listedeki son gecilen degisim.
export function izlenenSatirSirasi(satirlar: number[] | null, ln: number): number {
  if (!satirlar) return ln;
  let idx = satirlar.indexOf(ln);
  if (idx < 0) { for (let k = satirlar.length - 1; k >= 0; k--) if (satirlar[k]! <= ln) { idx = k; break; } }
  return idx;
}
