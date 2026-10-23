import * as clipperModulu from './clipper.js';
import type { ClipperKutuphanesi, IntPoint, Path, Paths } from './clipper.d.ts';

// Prototipin clipper yardımcıları ve ağ dilimleme (camSlice). Ham hesabı (dönme ekseni) ve Oto-CAM aynı dilimlemeyi kullanır.
// Clipper tam sayıyla çalışır: mm × CK.
// Kütüphane CommonJS ortamında (test, paketleyici dönüştürünce) dışa verir, tarayıcıda genel nesneye koyar; ikisi de okunur.
function kutuphane(): ClipperKutuphanesi {
  const modul = clipperModulu as unknown as Partial<ClipperKutuphanesi> & { default?: Partial<ClipperKutuphanesi> };
  if (modul.Clipper) return modul as ClipperKutuphanesi;
  if (modul.default?.Clipper) return modul.default as ClipperKutuphanesi;
  return (globalThis as unknown as { ClipperLib: ClipperKutuphanesi }).ClipperLib;
}
export const CLP = kutuphane();
export const CK = 1000;
export type { IntPoint, Path, Paths };
export type Nokta2 = [number, number];

export function cpt(x: number, y: number): IntPoint { return { X: Math.round(x * CK), Y: Math.round(y * CK) }; }
export function cpPaths(arr: readonly (readonly Nokta2[])[]): Paths { return arr.map((p) => p.map((q) => cpt(q[0], q[1]))); }
export function unpPaths(ps: Paths): Nokta2[][] { return ps.map((p) => p.map((q): Nokta2 => [q.X / CK, q.Y / CK])); }
export function cBool(type: number, a: Paths, b: Paths | null | undefined, fill?: number | null): Paths {
  const c = new CLP.Clipper();
  const out = new CLP.Paths();
  c.AddPaths(a, CLP.PolyType.ptSubject, true);
  if (b && b.length) c.AddPaths(b, CLP.PolyType.ptClip, true);
  const fl = fill == null ? CLP.PolyFillType.pftNonZero : fill;
  c.Execute(type, out, fl, fl);
  return out;
}
export function cUnion(a: Paths, b?: Paths | null, fill?: number | null): Paths { return cBool(CLP.ClipType.ctUnion, a, b || [], fill); }
export function cDiff(a: Paths, b?: Paths | null): Paths { if (!a.length) return []; if (!b || !b.length) return a; return cBool(CLP.ClipType.ctDifference, a, b); }
export function cInter(a: Paths, b?: Paths | null): Paths { if (!a.length || !b || !b.length) return []; return cBool(CLP.ClipType.ctIntersection, a, b); }
export function cOff(a: Paths, d: number): Paths {
  if (!a.length) return [];
  const co = new CLP.ClipperOffset(2, 0.015 * CK);
  const out = new CLP.Paths();
  co.AddPaths(a, CLP.JoinType.jtRound, CLP.EndType.etClosedPolygon);
  co.Execute(out, d * CK);
  return out;
}
export function cArea(a: Paths): number { let s = 0; a.forEach((p) => { s += CLP.Clipper.Area(p); }); return s / (CK * CK); }
export function cClipOpen(lines: Paths, polys: Paths): Paths {
  if (!lines.length || !polys.length) return [];
  const c = new CLP.Clipper();
  const pt = new CLP.PolyTree();
  c.AddPaths(lines, CLP.PolyType.ptSubject, false);
  c.AddPaths(polys, CLP.PolyType.ptClip, true);
  c.Execute(CLP.ClipType.ctIntersection, pt, CLP.PolyFillType.pftNonZero, CLP.PolyFillType.pftNonZero);
  return CLP.Clipper.OpenPathsFromPolyTree(pt);
}
export function cClean(a: Paths, d?: number): Paths { return CLP.Clipper.CleanPolygons(a, (d || 0.004) * CK); }
export function cInside(pt: IntPoint, polys: Paths): boolean {
  let c = 0;
  polys.forEach((p) => { const r = CLP.Clipper.PointInPolygon(pt, p); if (r !== 0) c += CLP.Clipper.Orientation(p) ? 1 : -1; });
  return c > 0;
}
export function camRect(x0: number, y0: number, x1: number, y1: number): Paths { return [[cpt(x0, y0), cpt(x1, y0), cpt(x1, y1), cpt(x0, y1)]]; }

// Dilimlenecek ağ: köşeler (x, y, z üçlüleri), üçgen dizinleri ve her üçgenin z aralığı.
export interface DilimAgi { V: ArrayLike<number>; T: ArrayLike<number>; tz0: ArrayLike<number>; tz1: ArrayLike<number> }

const k = (a: ArrayLike<number>, i: number): number => a[i] ?? Number.NaN;

export function camSlice(M: DilimAgi, z: number): Paths {
  const V = M.V, T = M.T, nt = T.length / 3, segs: [Nokta2, Nokta2][] = [], map: Record<string, [number, number][]> = {}, E = 1e-6;
  for (let t = 0; t < nt; t++) {
    if (k(M.tz0, t) > z || k(M.tz1, t) < z) continue;
    const p: Nokta2[] = [];
    const ids = [k(T, t * 3), k(T, t * 3 + 1), k(T, t * 3 + 2)];
    for (let e = 0; e < 3; e++) {
      const i = (ids[e] ?? Number.NaN) * 3, j = (ids[(e + 1) % 3] ?? Number.NaN) * 3;
      let za = k(V, i + 2) - z, zb = k(V, j + 2) - z;
      if (Math.abs(za) < E) za = E;
      if (Math.abs(zb) < E) zb = E;
      if ((za > 0) !== (zb > 0)) {
        const u = za / (za - zb);
        p.push([k(V, i) + (k(V, j) - k(V, i)) * u, k(V, i + 1) + (k(V, j + 1) - k(V, i + 1)) * u]);
      }
    }
    if (p.length === 2) segs.push([p[0] as Nokta2, p[1] as Nokta2]);
  }
  const key = (q: Nokta2): string => `${String(Math.round(q[0] * 2000))}:${String(Math.round(q[1] * 2000))}`;
  segs.forEach((s, i) => { (map[key(s[0])] ??= []).push([i, 0]); (map[key(s[1])] ??= []).push([i, 1]); });
  const used = new Uint8Array(segs.length), loops: Nokta2[][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const ilk = segs[s0] as [Nokta2, Nokta2];
    const loop: Nokta2[] = [ilk[0], ilk[1]];
    let end = ilk[1], guard = 0;
    while (guard++ < 200000) {
      const cand = map[key(end)];
      let nx: [number, number] | null = null;
      if (!cand) break;
      for (const c of cand) { if (!used[c[0]]) { nx = c; break; } }
      if (!nx) break;
      used[nx[0]] = 1;
      end = (segs[nx[0]] as [Nokta2, Nokta2])[1 - nx[1]] as Nokta2;
      loop.push(end);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  const cp = cpPaths(loops);
  return cp.length ? cClean(cUnion(cp, [], CLP.PolyFillType.pftEvenOdd), 0.002) : [];
}
