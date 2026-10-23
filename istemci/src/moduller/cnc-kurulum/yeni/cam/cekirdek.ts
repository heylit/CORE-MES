// Oto-CAM cekirdegi: parca -> baglamalar -> takim yollari -> NC programi. Birim mm.
// Global CAM koordinati: ham blogun sol-on-ust kosesi (X0 Y0 Z0), Z asagi negatif.
import {
  CLP, CK, cArea, cClipOpen, cDiff, cInside, cInter, cOff, cpt, cUnion, camRect, camSlice,
} from '../hesap/kesit.ts';
import { cutData } from '../hesap/kesme.ts';
import { gParse } from '../hesap/gkod.ts';
import { mbSo } from '../hesap/malzeme-davranisi.ts';
import { fmtN, upTR } from '../bicim.ts';
import type {
  Atama, Baglama, BaglamaSonucu, CamGeometri, CamIs, CamIslem, CamMalzeme, CamParametre, CamSure, CamTakim, CamTezgah,
  Delik, DonguYollari, GkodSonucu, Hareket, IsaretliYol, KesmeVerisi, Nokta, Taban, TakimSecimi, V3, Voksel, Yol,
  Yollar, Yon, YerelAg,
} from './tipler.ts';

export const CAM_DIRS: Yon[] = [
  { k: '+Z', name: 'Üst', ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1], plane: '' },
  { k: '-Z', name: 'Alt', ax: [1, 0, 0], ay: [0, -1, 0], az: [0, 0, -1], plane: '', flip: true },
  { k: '+X', name: 'Sağ yan', ax: [0, 0, -1], ay: [0, 1, 0], az: [1, 0, 0], plane: 'SPA+0 SPB+90 SPC+0', iso: 'B90' },
  { k: '-X', name: 'Sol yan', ax: [0, 0, 1], ay: [0, 1, 0], az: [-1, 0, 0], plane: 'SPA+0 SPB-90 SPC+0', iso: 'B-90' },
  { k: '+Y', name: 'Arka yan', ax: [1, 0, 0], ay: [0, 0, -1], az: [0, 1, 0], plane: 'SPA-90 SPB+0 SPC+0', iso: 'A-90' },
  { k: '-Y', name: 'Ön yan', ax: [1, 0, 0], ay: [0, 0, 1], az: [0, -1, 0], plane: 'SPA+90 SPB+0 SPC+0', iso: 'A90' }];
export const TAP_DRILL: V3[] = [[3.3, 4, 0.7], [4.2, 5, 0.8], [5, 6, 1], [6.8, 8, 1.25], [8.5, 10, 1.5], [10.2, 12, 1.75], [14, 16, 2], [17.5, 20, 2.5]];
export const CAM_DEF: CamParametre = { ap: 0.5, so: 0.45, allow: 0.4, allowF: 0.2, scallop: 0.01, clamp: 8, maxSetups: 6, tap: {}, use32: true, tc: 8, acc: 1500, safe: 5, res: 110, cal: {} };

const KOMSU: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Cekirdegin cutData'si genis tip doner; Oto-CAM yalniz bu alanlari okur.
export function kesme(t: CamTakim, mat: CamMalzeme, mach: CamTezgah): KesmeVerisi {
  return (cutData(t, mat, mach) as KesmeVerisi | null) || {};
}
const yonu = (d: number): Yon => CAM_DIRS[d]!;

/* ---------- ag donusumu / dilimleme ---------- */
export function camLocalMesh(G: CamGeometri, dir: Yon): YerelAg {
  const V = G.V, n = V.length / 3, L = new Float64Array(V.length), ax = dir.ax, ay = dir.ay, az = dir.az;
  const cs: V3[] = [], st = G.stock; [0, st.Lx].forEach((x) => { [0, st.Ly].forEach((y) => { [0, -st.Lz].forEach((z) => { cs.push([x, y, z]); }); }); });
  const mn: V3 = [1e9, 1e9, 1e9], mx: V3 = [-1e9, -1e9, -1e9];
  cs.forEach((c) => { const l = [ax[0] * c[0] + ax[1] * c[1] + ax[2] * c[2], ay[0] * c[0] + ay[1] * c[1] + ay[2] * c[2], az[0] * c[0] + az[1] * c[1] + az[2] * c[2]]; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k]!, l[k]!); mx[k] = Math.max(mx[k]!, l[k]!); } });
  const o: V3 = [mn[0], mn[1], mx[2]];
  for (let i = 0; i < n; i++) { const x = V[i * 3]!, y = V[i * 3 + 1]!, z = V[i * 3 + 2]!; L[i * 3] = ax[0] * x + ax[1] * y + ax[2] * z - o[0]; L[i * 3 + 1] = ay[0] * x + ay[1] * y + ay[2] * z - o[1]; L[i * 3 + 2] = az[0] * x + az[1] * y + az[2] * z - o[2]; }
  const g0: V3 = [ax[0] * o[0] + ay[0] * o[1] + az[0] * o[2], ax[1] * o[0] + ay[1] * o[1] + az[1] * o[2], ax[2] * o[0] + ay[2] * o[1] + az[2] * o[2]];
  const T = G.T, nt = T.length / 3, tz0 = new Float64Array(nt), tz1 = new Float64Array(nt); let zmin = 1e9, zmax = -1e9;
  for (let t = 0; t < nt; t++) { const a = L[T[t * 3]! * 3 + 2]!, b = L[T[t * 3 + 1]! * 3 + 2]!, c = L[T[t * 3 + 2]! * 3 + 2]!; tz0[t] = Math.min(a, b, c); tz1[t] = Math.max(a, b, c); zmin = Math.min(zmin, tz0[t]!); zmax = Math.max(zmax, tz1[t]!); }
  return { V: L, T, tz0, tz1, Lx: mx[0] - mn[0], Ly: mx[1] - mn[1], Lz: mx[2] - mn[2], o, g0, zmin, zmax };
}
export function camToGlobal(M: { o: number[] }, dir: Yon, x: number, y: number, z: number): V3 {
  const ax = dir.ax, ay = dir.ay, az = dir.az, lx = x + M.o[0]!, ly = y + M.o[1]!, lz = z + M.o[2]!;
  return [ax[0] * lx + ay[0] * ly + az[0] * lz, ax[1] * lx + ay[1] * ly + az[1] * lz, ax[2] * lx + ay[2] * ly + az[2] * lz];
}
export function camFloors(M: YerelAg): Taban[] {
  const V = M.V, T = M.T, nt = T.length / 3, by: Record<string, Yollar> = {};
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, b = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3, ux = V[b]! - V[a]!, uy = V[b + 1]! - V[a + 1]!, uz = V[b + 2]! - V[a + 2]!, vx = V[c]! - V[a]!, vy = V[c + 1]! - V[a + 1]!, vz = V[c + 2]! - V[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx; const ln = Math.sqrt(nx * nx + ny * ny + nz * nz); if (ln < 1e-12) continue; nz /= ln;
    if (nz > 0.9995 && M.tz1[t]! - M.tz0[t]! < 0.002) { const zk = (Math.round(M.tz1[t]! * 100) / 100).toFixed(2); (by[zk] = by[zk] || []).push([cpt(V[a]!, V[a + 1]!), cpt(V[b]!, V[b + 1]!), cpt(V[c]!, V[c + 1]!)]); }
  }
  return Object.keys(by).map((k) => ({ z: +k, reg: cUnion(by[k]!) })).filter((f) => cArea(f.reg) > 0.5 && cOff(f.reg, -0.35).length).sort((a, b) => b.z - a.z);
}
export function camFreeTris(M: YerelAg, keep?: (x: number, y: number, z: number) => boolean): Yollar {
  const V = M.V, T = M.T, nt = T.length / 3, out: Yollar = [];
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, b = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3, ux = V[b]! - V[a]!, uy = V[b + 1]! - V[a + 1]!, uz = V[b + 2]! - V[a + 2]!, vx = V[c]! - V[a]!, vy = V[c + 1]! - V[a + 1]!, vz = V[c + 2]! - V[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx; const ln = Math.sqrt(nx * nx + ny * ny + nz * nz); if (ln < 1e-9) continue; nz /= ln;
    if (nz > 0.03 && nz < 0.996 && (!keep || keep((V[a]! + V[b]! + V[c]!) / 3 + nx / ln * 0.9, (V[a + 1]! + V[b + 1]! + V[c + 1]!) / 3 + ny / ln * 0.9, (V[a + 2]! + V[b + 2]! + V[c + 2]!) / 3 + nz * 0.9))) out.push([cpt(V[a]!, V[a + 1]!), cpt(V[b]!, V[b + 1]!), cpt(V[c]!, V[c + 1]!)]);
  }
  return out;
}

/* ---------- vokseller: hangi talas hangi yonden alinir ---------- */
export function camVoxels(G: CamGeometri, res: number): Voksel {
  const st = G.stock, h = Math.max(st.Lx, st.Ly, st.Lz) / res, nx = Math.max(2, Math.ceil(st.Lx / h)), ny = Math.max(2, Math.ceil(st.Ly / h)), nz = Math.max(2, Math.ceil(st.Lz / h));
  const hx = st.Lx / nx, hy = st.Ly / ny, hz = st.Lz / nz, part = new Uint8Array(nx * ny * nz), cols: (number[] | undefined)[] = new Array<number[] | undefined>(nx * ny), V = G.V, T = G.T, nt = T.length / 3, jx = 0.000137, jy = 0.000291;
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, b = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3, ax = V[a]!, ay = V[a + 1]!, bx = V[b]!, by = V[b + 1]!, cx = V[c]!, cy = V[c + 1]!;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / hx - 0.5)), i1 = Math.min(nx - 1, Math.ceil(Math.max(ax, bx, cx) / hx - 0.5)), j0 = Math.max(0, Math.floor(Math.min(ay, by, cy) / hy - 0.5)), j1 = Math.min(ny - 1, Math.ceil(Math.max(ay, by, cy) / hy - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = (j + 0.5) * hy + jy;
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * hx + jx, w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue; const zz = w1 * V[a + 2]! + w2 * V[b + 2]! + w3 * V[c + 2]!, k = j * nx + i; (cols[k] = cols[k] || []).push(zz);
      }
    }
  }
  for (let q = 0; q < nx * ny; q++) {
    const L = cols[q]; if (!L || L.length < 2) continue; L.sort((u, v) => u - v);
    const ci = q % nx, cj = (q - ci) / nx;
    for (let m = 0; m + 1 < L.length; m += 2) { const z0 = L[m]!, z1 = L[m + 1]!; for (let k2 = 0; k2 < nz; k2++) { const zc = -st.Lz + (k2 + 0.5) * hz; if (zc > z0 && zc < z1) part[(k2 * ny + cj) * nx + ci] = 1; } }
  }
  return { nx, ny, nz, hx, hy, hz, h, part, idx: (i, j, k) => (k * ny + j) * nx + i };
}
type Tutma = (x: number, y: number, z: number) => boolean;
export function camAccess(X: Voksel, d: number, clampG?: Tutma | null): Uint8Array {
  const nx = X.nx, ny = X.ny, nz = X.nz, A = new Uint8Array(nx * ny * nz), P = X.part, dir = yonu(d), ax = dir.az;
  const axis = ax[0] ? 0 : ax[1] ? 1 : 2, sgn = ax[axis] > 0 ? 1 : -1, n = [nx, ny, nz];
  const o1 = axis === 0 ? 1 : 0, o2 = axis === 2 ? 1 : 2;
  for (let a = 0; a < n[o1]!; a++) for (let b = 0; b < n[o2]!; b++) {
    let blocked = false; const c: V3 = [0, 0, 0]; c[o1] = a; c[o2] = b;
    for (let s = 0; s < n[axis]!; s++) {
      c[axis] = sgn > 0 ? n[axis]! - 1 - s : s; const id = (c[2] * ny + c[1]) * nx + c[0];
      if (P[id]) { blocked = true; continue; }
      if (!blocked) A[id] = 1;
    }
  }
  if (clampG) for (let k = 0; k < nz; k++) { const zc = -X.hz * nz + (k + 0.5) * X.hz; for (let q = 0; q < nx * ny; q++) { const i = q % nx, j = (q - i) / nx, x = (i + 0.5) * X.hx, y = (j + 0.5) * X.hy; if (clampG(x, y, zc)) A[(k * ny + j) * nx + i] = 0; } }
  return A;
}
export function camClampFn(G: CamGeometri, d: number, prm: CamParametre, mode: string): Tutma {
  const st = G.stock, cl = prm.clamp;
  if (mode === '32') return (_x, _y, z) => z < -st.Lz + cl;
  const dir = yonu(d), az = dir.az;
  if (az[2] > 0) return (_x, _y, z) => z < -st.Lz + cl;
  if (az[2] < 0) return (_x, _y, z) => z > -cl;
  if (az[0] > 0) return (x) => x < cl;
  if (az[0] < 0) return (x) => x > st.Lx - cl;
  if (az[1] > 0) return (_x, y) => y < cl;
  return (_x, y) => y > st.Ly - cl;
}
export function camChooseSetups(G: CamGeometri, X: Voksel, prm: CamParametre, five: boolean): Atama {
  const N = X.nx * X.ny * X.nz, rem = new Uint8Array(N); let tot = 0, i: number;
  for (i = 0; i < N; i++) if (!X.part[i]) { rem[i] = 1; tot++; }
  const acc: { A: Uint8Array; mode: string }[] = [], setups: Baglama[] = [], assigned = new Int8Array(N).fill(-1);
  for (let d = 0; d < 6; d++) { const mode = five && d >= 2 && prm.use32 ? '32' : 'clamp'; acc.push({ A: camAccess(X, d, camClampFn(G, d, prm, mode)), mode }); }
  let guard = 0;
  while (setups.length < prm.maxSetups && guard++ < 6) {
    let best = -1, bestN = 0;
    for (let d2 = 0; d2 < 6; d2++) { if (setups.some((s) => s.d === d2)) continue; const A = acc[d2]!.A; let c = 0; for (i = 0; i < N; i++) if (assigned[i]! < 0 && rem[i] && A[i]) c++; if (setups.length === 0 && d2 === 0) { best = 0; bestN = c; break; } if (c > bestN) { bestN = c; best = d2; } }
    if (best < 0 || bestN < Math.max(12, tot * 0.0015)) break;
    const sIdx = setups.length, A2 = acc[best]!.A; for (i = 0; i < N; i++) if (assigned[i]! < 0 && rem[i] && A2[i]) { assigned[i] = sIdx; }
    setups.push({ d: best, dir: yonu(best), mode: acc[best]!.mode, vox: bestN, vol: bestN * X.hx * X.hy * X.hz });
  }
  // ulasilamaz bolgeler
  const un = bolgeler(X, rem, assigned, G.stock.Lz, (bb) => bb[2]! * X.hz < prm.clamp + X.hz || (bb[5]! + 1) * X.hz > G.stock.Lz - prm.clamp - X.hz);
  return { setups, assigned, tot, totVol: tot * X.hx * X.hy * X.hz, unreach: un, X };
}
// Atanmamis talasin bagli bilesenleri; hacmi 2 mm3 altindakiler sayilmaz.
export function bolgeler(X: Voksel, rem: Uint8Array, assigned: Int8Array, Lz: number, tutma: (bb: number[]) => boolean): Atama['unreach'] {
  const N = X.nx * X.ny * X.nz, un: Atama['unreach'] = [], seen = new Uint8Array(N), nx = X.nx, ny = X.ny, nz = X.nz;
  for (let i = 0; i < N; i++) {
    if (!rem[i] || assigned[i]! >= 0 || seen[i]) continue;
    const st = [i], bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; let cnt = 0; seen[i] = 1;
    while (st.length) {
      const v = st.pop()!, vi = v % nx, vj = ((v - vi) / nx) % ny, vk = Math.floor(v / (nx * ny)); cnt++;
      bb[0] = Math.min(bb[0]!, vi); bb[1] = Math.min(bb[1]!, vj); bb[2] = Math.min(bb[2]!, vk); bb[3] = Math.max(bb[3]!, vi); bb[4] = Math.max(bb[4]!, vj); bb[5] = Math.max(bb[5]!, vk);
      KOMSU.forEach((o) => { const a = vi + o[0], b = vj + o[1], c = vk + o[2]; if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) return; const w = (c * ny + b) * nx + a; if (rem[w] && assigned[w]! < 0 && !seen[w]) { seen[w] = 1; st.push(w); } });
    }
    const vol = cnt * X.hx * X.hy * X.hz; if (vol < 2) continue;
    un.push({ vol, cnt, box: [bb[0]! * X.hx, bb[1]! * X.hy, -Lz + bb[2]! * X.hz, (bb[3]! + 1) * X.hx, (bb[4]! + 1) * X.hy, -Lz + (bb[5]! + 1) * X.hz], clamp: tutma(bb) });
  }
  un.sort((a, b) => b.vol - a.vol);
  return un;
}
/* baglama icin katman katman atanmis talas bolgesi (yerel XY) */
export function camAssignedRegion(G: CamGeometri, X: Voksel, AS: Atama, sIdx: number, M: YerelAg, dir: Yon, z: number): Yollar {
  const h = Math.min(X.hx, X.hy), nxl = Math.ceil(M.Lx / h), nyl = Math.ceil(M.Ly / h), hx = M.Lx / nxl, hy = M.Ly / nyl, rects: Yollar = [];
  for (let j = 0; j < nyl; j++) {
    let run = -1;
    for (let i = 0; i <= nxl; i++) {
      let on = false;
      if (i < nxl) { const g = camToGlobal(M, dir, (i + 0.5) * hx, (j + 0.5) * hy, z), gi = Math.floor(g[0] / X.hx), gj = Math.floor(g[1] / X.hy), gk = Math.floor((g[2] + G.stock.Lz) / X.hz); if (gi >= 0 && gj >= 0 && gk >= 0 && gi < X.nx && gj < X.ny && gk < X.nz) on = AS.assigned[(gk * X.ny + gj) * X.nx + gi] === sIdx; }
      if (on && run < 0) run = i; if (!on && run >= 0) { rects.push([cpt(run * hx, j * hy), cpt(i * hx, j * hy), cpt(i * hx, (j + 1) * hy), cpt(run * hx, (j + 1) * hy)]); run = -1; }
    }
  }
  return rects.length ? cOff(cUnion(rects), h * 0.75) : [];
}

/* ---------- delik tanima ---------- */
export function camCircle(path: Yol): { x: number; y: number; r: number } | null {
  const n = path.length; if (n < 10) return null; let mx = 0, my = 0; path.forEach((p) => { mx += p.X; my += p.Y; }); mx /= n; my /= n;
  // en kucuk kareler cember uydurma (Kasa): nokta yogunlugu duzensiz aglarda merkez kaymaz
  let Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0, Sz = 0;
  path.forEach((p) => { const x = (p.X - mx) / CK, y = (p.Y - my) / CK, z = x * x + y * y; Sxx += x * x; Syy += y * y; Sxy += x * y; Sxz += x * z; Syz += y * z; Sz += z; });
  const det = Sxx * Syy - Sxy * Sxy; if (Math.abs(det) < 1e-12) return null;
  const a = (Sxz * Syy - Syz * Sxy) / det / 2, b = (Syz * Sxx - Sxz * Sxy) / det / 2, r = Math.sqrt(a * a + b * b + Sz / n);
  const cx = mx / CK + a, cy = my / CK + b; let dev = 0; path.forEach((p) => { dev = Math.max(dev, Math.abs(Math.hypot(p.X / CK - cx, p.Y / CK - cy) - r)); });
  if (dev > Math.max(0.03, r * 0.02)) return null;
  const A = Math.abs(CLP.Clipper.Area(path) as number) / (CK * CK); if (Math.abs(A - Math.PI * r * r) / (Math.PI * r * r) > 0.03) return null;
  return { x: cx, y: cy, r };
}
export function camHoles(_M: YerelAg, slices: Taban[]): Delik[] {
  const groups: Delik[] = [];
  slices.forEach((sl) => {
    sl.reg.forEach((p) => {
      if (CLP.Clipper.Orientation(p)) return; const c = camCircle(p); if (!c || c.r > 25) return;
      let g: Delik | null = null; for (let i = 0; i < groups.length; i++) { const q = groups[i]!; const tl = Math.max(0.08, c.r * 0.04); if (Math.abs(q.x - c.x) < tl && Math.abs(q.y - c.y) < tl && Math.abs(q.r - c.r) < 0.08) { g = q; break; } }
      if (!g) groups.push(g = { x: c.x, y: c.y, r: c.r, top: sl.z, bot: sl.z, n: 0 }); g.top = Math.max(g.top, sl.z); g.bot = Math.min(g.bot, sl.z); g.n++;
    });
  });
  return groups.filter((g) => g.n >= 2);
}

/* ---------- takim secimi ---------- */
export function camReach(t: CamTakim | null | undefined): number { if (!t) return 0; if (t.ln) return t.ln; if (t.kind === 'drill') return /5×D/.test(t.name) ? t.d * 5.5 : t.d * 4.2 + 6; if (t.kind === 'tap') return t.d * 2.5 + 8; if (t.kind === 'facemill' || t.kind === 'facemill45') return 9; if (t.kind === 'ball') return t.d * 3; return t.d * 3; }
export function camTools(lib: CamTakim[]): TakimSecimi {
  const pick = (kinds: string[], f?: (t: CamTakim) => boolean): CamTakim[] => lib.filter((t) => kinds.indexOf(t.kind) >= 0 && (!f || f(t)));
  return {
    lib,
    face: pick(['facemill', 'facemill45']).sort((a, b) => b.d - a.d),
    end: pick(['endmill', 'rougher', 'longneck'], (t) => t.d >= 3 && t.d <= 25 && !/alümin/i.test(t.name)).sort((a, b) => b.d - a.d || (a.tm === 'H' ? 1 : 0) - (b.tm === 'H' ? 1 : 0) || (a.kind === 'endmill' ? -1 : 1)),
    ball: pick(['ball']).sort((a, b) => b.d - a.d),
    spot: pick(['spot', 'center']).sort((a, b) => b.d - a.d),
    drill: pick(['drill', 'stepdrill', 'idrill']),
    tap: pick(['tap'], (t) => !!(t.cut && t.cut.pitch) && !/Form/.test(t.name)),
  };
}
export function camEnd(T: TakimSecimi, minD: number, maxD: number, depth: number): CamTakim | null {
  const c = T.end.filter((t) => t.kind !== 'longneck' && t.d >= minD - 1e-6 && t.d <= maxD + 1e-6 && camReach(t) >= depth); if (c.length) return c[0]!;
  const ln = T.end.filter((t) => t.d >= minD - 1e-6 && t.d <= maxD + 1e-6 && camReach(t) >= depth).sort((a, b) => b.d - a.d); return ln[0] || null;
}

/* ---------- yol uretimi ---------- */
export function camLoops(shadow: Yollar, region: Yollar, rOff: number, so: number, maxN?: number): DonguYollari {
  const out: Yollar[] = [], reg = cOff(region, 0.06);
  for (let i = 0; i < (maxN || 400); i++) {
    const off = shadow.length ? cOff(shadow, rOff + i * so) : [];
    if (!shadow.length) break;
    const lines = off.map((p) => p.concat([p[0]!]));
    const cl = cClipOpen(lines, reg); if (cl.length) out.push(cl);
    if (!cDiff(reg, off).length || cArea(cDiff(reg, off)) < 0.01) break;
  }
  let fl: DonguYollari = []; for (let k = out.length - 1; k >= 0; k--) fl = fl.concat(out[k]!);
  fl.firstN = out.length ? out[out.length - 1]!.length : 0; return fl;
}
export function camZig(region: Yollar, so: number): Yollar {
  if (!region.length) return []; const b = CLP.Clipper.GetBounds(region) as { left: number; top: number; right: number; bottom: number }, lines: Yollar = [], y0 = b.top / CK, y1 = b.bottom / CK, x0 = b.left / CK - 1, x1 = b.right / CK + 1; let k = 0;
  for (let y = y0 + so * 0.5; y < y1; y += so) { lines.push(k++ % 2 ? [cpt(x1, y), cpt(x0, y)] : [cpt(x0, y), cpt(x1, y)]); }
  const cl = cClipOpen(lines, region);
  cl.sort((a, c) => a[0]!.Y - c[0]!.Y || (a[0]!.X - c[0]!.X));
  // zikzak yonunu koru
  let row = -1e18, flip = false; cl.forEach((p) => { if (Math.abs(p[0]!.Y - row) > 1) { row = p[0]!.Y; flip = !flip; } if ((p[0]!.X < p[p.length - 1]!.X) !== flip) p.reverse(); });
  return cl;
}
export function OpB(name: string, kind: string, tool: CamTakim): CamIslem { return { name, kind, tool, mv: [], cyc: null, depth: 0, len: 0 }; }
export function camEmit(op: CamIslem, paths: IsaretliYol[], z: number, zTop: number, safe: number, F: number, Fp: number, ramp: number): void {
  let last = op._last; const link = op._link || 0;
  paths.forEach((p) => {
    if (p.length < 2) return; const pts = p.map((q) => [q.X / CK, q.Y / CK] as [number, number]), s = pts[0]!, Fo = F; if (p.slot) { F = Math.round(Fo * 0.65); op.slots = (op.slots || 0) + 1; }
    const closed = pts.length > 3 && Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1]) < 0.01;
    let seq = pts;
    if (last && Math.abs(last[2]! - z) < 1e-6 && Math.hypot(last[0]! - s[0], last[1]! - s[1]) <= link) op.mv.push({ t: 1, x: s[0], y: s[1], z, f: F });
    else {
      op.mv.push({ t: 0, z: safe }); op.mv.push({ t: 0, x: s[0], y: s[1] }); const z0 = zTop + 1; op.mv.push({ t: 0, z: z0 });
      if (ramp && closed && z0 - z > 0.05) {
        // helisel/rampa giris: dongu boyunca 3 derece egimle in, derinlige ulasinca donguyu o noktadan tam tur kes
        let per = 0; for (let i = 1; i < pts.length; i++) per += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
        const Lr = Math.min(Math.max(ramp, (z0 - z) / Math.tan(3 * Math.PI / 180)), Math.max(per * 2, (z0 - z) / Math.tan(12 * Math.PI / 180))), n = pts.length - 1; let zc = z0, k = 0, guard = 0;
        if (per < 1e-6) { op.mv.push({ t: 1, z, f: Fp }); }
        else while (zc > z + 1e-6 && guard++ < 100000) { const a = pts[k]!, b = pts[k + 1]!, dl = Math.hypot(b[0] - a[0], b[1] - a[1]); zc = Math.max(z, zc - (z0 - z) * dl / Lr); op.mv.push({ t: 1, x: b[0], y: b[1], z: zc, f: Fp }); k = (k + 1) % n; }
        seq = pts.slice(k, n).concat(pts.slice(0, k + 1)); if (!seq.length) seq = pts;
        op.mv.push({ t: 1, x: seq[0]![0], y: seq[0]![1], z, f: F });
      } else op.mv.push({ t: 1, z, f: Fp });
    }
    for (let j = 1; j < seq.length; j++) op.mv.push({ t: 1, x: seq[j]![0], y: seq[j]![1], z, f: F });
    last = [seq[seq.length - 1]![0], seq[seq.length - 1]![1], z]; F = Fo;
  });
  op._last = last; op.depth = Math.min(op.depth, z);
}
export function camEnd3(op: CamIslem, safe: number): void { op.mv.push({ t: 0, z: safe }); op._last = null; }

/* ---------- ana akis: bir baglama ---------- */
export function camSetupOps(G: CamGeometri, AS: Atama, sIdx: number, s: Baglama, prm: CamParametre, T: TakimSecimi, mat: CamMalzeme, mach: CamTezgah): BaglamaSonucu {
  const dir = s.dir, M = camLocalMesh(G, dir), zTopPart = M.zmax, zBotPart = M.zmin, warn: string[] = [], safe = prm.safe;
  let ops: CamIslem[] = [];
  s.M = M; s.L = { x: M.Lx, y: M.Ly, z: M.Lz };
  // atanmis talasin derinlik araligi
  let zLo = 0, zHi = -M.Lz; const step = Math.min(AS.X.hx, AS.X.hy, AS.X.hz);
  for (let zz = -step / 2; zz > -M.Lz; zz -= step) { const R0 = camAssignedRegion(G, AS.X, AS, sIdx, M, dir, zz); if (R0.length && cArea(R0) > 0.5) { zLo = Math.min(zLo, zz); zHi = Math.max(zHi, zz); } }
  if (zHi < zLo) return { ops: [], warn: ['Bu bağlamada talaş yok'], M };
  zLo = Math.max(-M.Lz + 0.01, zLo - step * 0.5); zHi = Math.min(0, zHi + step * 0.5);
  s.zLo = zLo; s.zHi = zHi;
  // dilimler + golge
  const floors = camFloors(M), fine: { z: number; sh: Yollar }[] = [], zs: Record<string, number> = {};
  // vokselin yarim adim ustunde kalan tabani (kama kanali tabani vb.) bolgeye kat
  floors.forEach((f) => { if (f.z < zLo && f.z > zLo - step * 1.3) { const Ra = camAssignedRegion(G, AS.X, AS, sIdx, M, dir, zLo + step * 0.5); if (Ra.length && cArea(cInter(f.reg, Ra)) > 0.5) { zLo = f.z - 0.01; s.zLo = zLo; } } });
  for (let z1 = Math.min(zTopPart, 0); z1 > zBotPart - 0.5; z1 -= 0.5) zs[z1.toFixed(3)] = 1;
  floors.forEach((f) => { zs[(f.z + 0.01).toFixed(3)] = 1; zs[(f.z - 0.01).toFixed(3)] = 1; });
  const zl = Object.keys(zs).map(Number).filter((z) => z <= zTopPart + 1e-6 && z >= zBotPart - 1e-6).sort((a, b) => b - a);
  let cum: Yollar = []; const slices: Taban[] = [];
  zl.forEach((z) => { const sl = camSlice(M, z); slices.push({ z, reg: sl }); cum = cum.length ? cUnion(cum, sl) : sl; fine.push({ z, sh: cum }); });
  const shadowAt = (z: number): Yollar => { let best: { z: number; sh: Yollar } | null = null; for (let i = 0; i < fine.length; i++) { if (fine[i]!.z >= z - 1e-6) best = fine[i]!; else break; } return best ? best.sh : []; };
  const voxAt = (x: number, y: number, z: number): number => {
    const g = camToGlobal(M, dir, x, y, z), X = AS.X, gi = Math.floor(g[0] / X.hx), gj = Math.floor(g[1] / X.hy), gk = Math.floor((g[2] + G.stock.Lz) / X.hz);
    if (gi < 0 || gj < 0 || gk < 0 || gi >= X.nx || gj >= X.ny || gk >= X.nz) return -1; return (gk * X.ny + gj) * X.nx + gi;
  };
  // delikler
  const holes = camHoles(M, slices).filter((hh) => {
    const vi = voxAt(hh.x, hh.y, (hh.top + hh.bot) / 2);
    if (vi < 0) return false; if (AS.assigned[vi] !== sIdx) return false;
    const above = shadowAt(hh.top + 0.6); return !cInside(cpt(hh.x, hh.y), above);
  });
  holes.forEach((hh) => { hh.d = +(hh.r * 2).toFixed(2); let below: Taban | null = null; for (let q = 0; q < slices.length; q++) if (slices[q]!.z < hh.bot - 0.4) { below = slices[q]!; break; } hh.through = hh.bot <= zBotPart + 0.6 || !below || !cInside(cpt(hh.x, hh.y), below.reg); hh.top = Math.min(0, hh.top + 0.25); hh.depth = hh.top - hh.bot + 0.25; });
  const drillHoles: Delik[] = [], helixHoles: Delik[] = [];
  holes.forEach((hh) => {
    const hd = hh.d!, hdep = hh.depth!;
    const drs = T.drill.filter((t) => Math.abs(t.d - hd) <= 0.06), need = hdep + (hh.through ? hd * 0.3 + 1 : 0), dr = drs.filter((t) => camReach(t) >= need).sort((a, b) => camReach(a) - camReach(b))[0] || drs.sort((a, b) => camReach(b) - camReach(a))[0];
    if (dr) { hh.how = 'drill'; hh.tool = dr; drillHoles.push(hh); }
    else if (hd <= 40) { const em = camEnd(T, 3, hd * 0.75, hdep + 2); if (em) { hh.how = 'helix'; hh.tool = em; helixHoles.push(hh); } else { hh.how = 'none'; warn.push('Ø' + fmtN(hd, 1) + ' delik için kütüphanede uygun matkap / freze yok'); } }
    const td = TAP_DRILL.filter((x) => Math.abs(x[0] - hd) < 0.06)[0]; if (td) { hh.tapM = td[1]; hh.pitch = td[2]; hh.tapKey = s.dir.k + ':' + hd.toFixed(2) + ':' + hh.x.toFixed(1) + ':' + hh.y.toFixed(1); }
  });
  const holeDisks = drillHoles.concat(helixHoles).map((hh) => { const p: Yol = []; for (let a = 0; a < 48; a++) { const t2 = a / 48 * Math.PI * 2; p.push(cpt(hh.x + Math.cos(t2) * (hh.r + 0.05), hh.y + Math.sin(t2) * (hh.r + 0.05))); } return { h: hh, p }; });
  const shadowH = (z: number): Yollar => { const sh = shadowAt(z), add = holeDisks.filter((d) => z >= d.h.bot - 0.3 && z <= d.h.top + 0.5).map((d) => d.p); return add.length ? cUnion(sh, add) : sh; };
  const depthMax = -zLo, region = (z: number): Yollar => camAssignedRegion(G, AS.X, AS, sIdx, M, dir, z);
  // 1) alin frezeleme (parcanin ustundeki bosluk)
  const faceTop = prm.noFace ? zHi : Math.min(0, zTopPart), fw = Math.min(M.Lx, M.Ly), fm = T.face.filter((t) => t.d <= fw * 0.8)[0] || T.face[T.face.length - 1];
  if (!prm.noFace && zHi > faceTop + 0.05 && fm) {
    const op = OpB('Alın frezeleme', 'face', fm), cd = kesme(fm, mat, mach), so = fm.d * 0.65, F = cd.F || 800, ap = 2.5;
    const lv: number[] = []; for (let z = -ap; z > faceTop + 0.05; z -= ap) lv.push(z); lv.push(faceTop);
    const reg = cOff(camRect(0, 0, M.Lx, M.Ly), fm.d * 0.35); let prev = 0;
    lv.forEach((z) => { const zig = camZig(reg, so); op._link = so * 1.6; camEmit(op, zig, z, prev, safe, F, F * 0.5, 0); prev = z; });
    camEnd3(op, safe); ops.push(op);
  }
  // 2) kaba: Z kademeleri, kontur-paralel ofset; her kademede iki kademe arasindaki tum talas bandi
  const rcache: Record<string, Yollar> = {}; const regionC = (z: number): Yollar => { const k = z.toFixed(2); return rcache[k] || (rcache[k] = region(z)); };
  const band = (z: number, zp: number): Yollar => { let out: Yollar = []; const st = Math.max(0.5, step * 0.8); for (let q = z + 0.05; q < zp - 0.01; q += st) out = out.length ? cUnion(out, regionC(q)) : regionC(q); const r2 = regionC(Math.min(zp - 0.05, z + 0.05)); return out.length ? cUnion(out, r2) : r2; };
  let levels: number[] = []; const ftop = Math.min(faceTop, zHi);
  const maxD = Math.min(20, Math.max(6, Math.min(M.Lx, M.Ly) / 3)), cand = T.end.filter((t) => t.kind !== 'longneck' && t.d <= maxD && t.d >= 6);
  const rough = cand.filter((t) => camReach(t) >= depthMax)[0] || camEnd(T, 6, 25, depthMax) || cand[0] || T.end[0];
  if (rough && camReach(rough) < depthMax) warn.push(rough.name + ' boyu (' + Math.round(camReach(rough)) + ' mm) bu bağlamanın derinliğine (' + Math.round(depthMax) + ' mm) yetmiyor — uzun takım ya da ek bağlama gerekir');
  const swept: Record<string, Yollar> = {}, bands: Record<string, Yollar> = {};
  if (rough) {
    const apR = rough.d * (mat.iso === 'N' ? 0.9 : prm.ap), lz: Record<string, number> = {}; for (let z2 = ftop - apR; z2 > zLo + 0.3; z2 -= apR) lz[z2.toFixed(3)] = 1; lz[zLo.toFixed(3)] = 1;
    floors.forEach((f) => { if (f.z < ftop - 0.3 && f.z > zLo - 0.01) lz[(f.z + prm.allowF).toFixed(3)] = 1; });
    levels = Object.keys(lz).map(Number).sort((a, b) => b - a);
    const dd: number[] = []; levels.forEach((z) => { if (!dd.length || dd[dd.length - 1]! - z > 0.25) dd.push(z); }); levels = dd;
    let pz0 = ftop; levels.forEach((z) => { bands[z.toFixed(3)] = band(z, Math.max(pz0, z + 0.1)); pz0 = z; });
    const roughPass = (tool: CamTakim, kind: string, nameP: string, getRegion: (z: number) => Yollar | null | undefined): CamIslem => {
      const op = OpB(nameP + ' Ø' + fmtN(tool.d, tool.d % 1 ? 1 : 0), kind, tool), cd = kesme(tool, mat, mach), Fx = cd.F || 600, so = tool.d * (kind === 'rough' || kind === 'rest' ? mbSo(mat, prm.so) : prm.so), r = tool.d / 2; let prevZ = ftop;
      levels.forEach((z) => {
        const Rg = getRegion(z); if (!Rg || !Rg.length) { return; } const sh = shadowH(z + 0.001);
        const C = cDiff(cOff(Rg, r + 0.2), cOff(sh, prm.allow + r)); if (!C.length) return;
        const loops: DonguYollari = sh.length ? camLoops(sh, C, prm.allow + r, so) : camZig(C, so); if (!loops.length) return;
        const inner = cOff(camRect(0, 0, M.Lx, M.Ly), -(r + so)); for (let li = 0; li < (loops.firstN || 0); li++) { const lp = loops[li]!; let ok = lp.length > 2; for (let q = 0; q < lp.length && ok; q += Math.max(1, Math.floor(lp.length / 6))) if (!cInside(lp[q]!, inner)) ok = false; if (ok) lp.slot = true; }
        op._link = so * 1.3; camEmit(op, loops, z, prevZ, safe, Fx, Fx * 0.35, tool.d * 2); const k = z.toFixed(3); swept[k] = swept[k] ? cUnion(swept[k], cOff(C, r)) : cOff(C, r); prevZ = z;
      });
      camEnd3(op, safe); if (op.mv.length > 2) ops.push(op); return op;
    };
    const uncovered = (z: number): Yollar => { const Rg = bands[z.toFixed(3)]; if (!Rg || !Rg.length) return []; const U = cDiff(cDiff(Rg, cOff(shadowH(z + 0.001), prm.allow + 0.05)), swept[z.toFixed(3)] || []); return cArea(cOff(U, -0.25)) > 0.3 ? U : []; };
    roughPass(rough, 'rough', 'Kaba boşaltma', (z) => bands[z.toFixed(3)]);
    // 3) kalan malzeme: daha kucuk takimlarla art arda
    let lastD = rough.d;
    for (let it = 0; it < 4; it++) {
      let any = false; levels.forEach((z) => { if (uncovered(z).length) { any = true; } }); if (!any) break;
      const rc = T.end.filter((t) => t.d < lastD - 0.5 && t.d >= 3).sort((a, b) => b.d - a.d || (a.kind === 'longneck' ? 1 : 0) - (b.kind === 'longneck' ? 1 : 0) || (a.tm === 'H' ? 1 : 0) - (b.tm === 'H' ? 1 : 0)), Us: Record<string, Yollar> = {};
      let nt: CamTakim | null = null, bestCov = 0, Utot = 0;
      levels.forEach((z) => { const U = uncovered(z); if (U.length) { Us[z.toFixed(3)] = U; Utot += cArea(U); } });
      for (let ri = 0; ri < rc.length; ri++) {
        const t = rc[ri]!, r0 = t.d / 2; let got = 0, deep = 0;
        Object.keys(Us).forEach((k) => { const z = +k, U = Us[k]!, sh = shadowH(z + 0.001), C = cDiff(cOff(U, r0 + 0.3), cOff(sh, prm.allow + r0)); if (!C.length) return; const g = cArea(cInter(cOff(C, r0), U)); if (g > 0.2) { got += g; deep = Math.max(deep, -z); } });
        if (got <= 0 || camReach(t) < deep - 0.5) continue; const cov = got / Utot;
        if (cov >= 0.6) { nt = t; break; } if (cov > bestCov + 0.05) { bestCov = cov; nt = t; }
      }
      if (!nt) break;
      const ntd = nt.d;
      roughPass(nt, 'rest', 'Kalan malzeme', (z) => { const U = uncovered(z); return U.length ? cInter(cOff(U, ntd / 2 + 0.3), cOff(bands[z.toFixed(3)]!, ntd / 2 + 0.2)) : null; });
      lastD = nt.d;
    }
    let leftA = 0; levels.forEach((z) => { leftA += cArea(uncovered(z)); }); if (leftA > 3) warn.push('Kaba işlemden sonra ≈' + fmtN(leftA, 0) + ' mm² alan küçük takıma rağmen kaldı (dar köşe / kanal)');
    // 4) finis: tabanlar + duvarlar (her taban icin sigan en buyuk takim)
    const flist: Taban[] = floors.filter((f) => f.z < ftop - 0.05 && f.z > zLo - 0.02), pseudo: Taban = { z: zLo, reg: [], pseudo: true };
    if (!flist.some((f) => Math.abs(f.z - zLo) < 0.05)) flist.push(pseudo);
    const fOps: Record<string, CamIslem> = {};
    flist.forEach((f, fi) => {
      const dep = -f.z, Rg = band(f.z, f.z + 2.5 * step); if (!Rg.length) return;
      const sh = shadowH(f.z + 0.001), target = f.pseudo ? cDiff(Rg, cOff(sh, 0.05)) : cDiff(cInter(f.reg, cOff(Rg, 0.5)), cOff(sh, 0.01)), tA = cArea(target); if (tA < 0.3) return;
      let cands = T.end.filter((t) => t.kind !== 'longneck' && t.d <= 16 && t.d >= 3 && camReach(t) >= dep).sort((a, b) => b.d - a.d);
      if (!cands.length) cands = T.end.filter((t) => t.d >= 3 && camReach(t) >= dep).sort((a, b) => a.d - b.d);
      let ft: CamTakim | null = null; for (let ci = 0; ci < cands.length; ci++) { const t = cands[ci]!, r0 = t.d / 2, Cb0 = cDiff(cOff(Rg, r0 + 0.2), cOff(sh, r0 - 0.002)); if (cOff(Cb0, -0.03).length && cArea(cInter(cOff(cOff(Cb0, -0.03), r0 + 0.03), target)) / tA >= 0.97) { ft = t; break; } }
      if (!ft) { ft = cands[cands.length - 1] || null; if (!ft) return; warn.push('Taban ' + fmtN(-f.z, 1) + ' mm: en küçük takım da bölgeyi tam süpüremiyor'); }
      const opF = fOps[ft.id] || (fOps[ft.id] = OpB('Finiş taban/duvar Ø' + fmtN(ft.d, ft.d % 1 ? 1 : 0), 'finish', ft)), cdF = kesme(ft, mat, mach), FF = (cdF.F || 500) * 0.9, r = ft.d / 2;
      const Cb = cDiff(cOff(Rg, r + 0.2), cOff(sh, r - 0.002));
      if (!f.pseudo) { const fr = cInter(cOff(f.reg, r), Cb); if (fr.length) { const fl = camLoops(sh, fr, r, ft.d * 0.6); opF._link = ft.d * 0.8; camEmit(opF, fl, f.z, Math.max(f.z + 1.5, ftop), safe, FF, FF * 0.4, ft.d * 2); } }
      const wallZone = f.pseudo ? cOff(Rg, r + 0.5) : cOff(f.reg, r + 0.3);
      let topW = ftop; for (let k = fi - 1; k >= 0; k--) { if (!flist[k]!.pseudo) { topW = Math.min(ftop, flist[k]!.z); break; } }
      const hW = topW - f.z, nW = Math.max(1, Math.ceil(hW / (ft.d * 2))), wz: number[] = []; for (let q = 1; q <= nW; q++) wz.push(topW - hW * q / nW);
      wz.forEach((z) => { const shz = shadowH(z + 0.001), Rz = regionC(z + 0.05); const Cz = cDiff(cOff(Rz.length ? Rz : Rg, r + 0.2), cOff(shz, r - 0.002)); const ct = cClipOpen(cOff(shz, r).map((p) => p.concat([p[0]!])), cInter(cOff(Cz, 0.06), wallZone)); opF._link = 0; camEmit(opF, ct, z, Math.max(z + 2, topW + 1), safe, FF, FF * 0.4, 0); });
    });
    Object.keys(fOps).sort((a, b) => fOps[b]!.tool.d - fOps[a]!.tool.d).forEach((k) => { const o = fOps[k]!; camEnd3(o, safe); if (o.mv.length > 2) ops.push(o); });
  }
  // 5) serbest yuzey finisi (kuresel)
  const ft2 = camFreeTris(M, (x, y, z) => { const X = AS.X, vi = voxAt(x, y, z); if (vi < 0) return !X.air; const a = AS.assigned[vi]!; return a === sIdx || (a < 0 && !X.part[vi] && !(X.air && X.air[vi])); });
  if (ft2.length) {
    const freeReg = cUnion(ft2), fa = cArea(freeReg);
    if (fa > 2) {
      const bm = T.ball.filter((t) => camReach(t) >= depthMax * 0.6)[0] || T.ball[0];
      if (bm) {
        const R = bm.d / 2, so2 = Math.max(0.15, Math.min(R * 0.5, 2 * Math.sqrt(2 * R * prm.scallop))), g = 0.25, opB = OpB('Serbest yüzey finiş R' + fmtN(R, R % 1 ? 1 : 0), 'ball', bm), cdB = kesme(bm, mat, mach), FB = cdB.F || 800;
        const HM = camHeight(M, g, freeReg, R), bnd = CLP.Clipper.GetBounds(freeReg) as { left: number; top: number; right: number; bottom: number }, w = (bnd.right - bnd.left) / CK, hgt = (bnd.bottom - bnd.top) / CK, alongX = w < hgt;
        const regB = cInter(cOff(freeReg, R * 0.6), cOff(region(Math.max(zLo, zBotPart) + 0.5).length ? camRect(-5, -5, M.Lx + 5, M.Ly + 5) : [], 0));
        const lines: Yollar = []; if (alongX) { for (let y2 = bnd.top / CK + so2 / 2; y2 < bnd.bottom / CK; y2 += so2) lines.push([cpt(bnd.left / CK - R, y2), cpt(bnd.right / CK + R, y2)]); } else { for (let x2 = bnd.left / CK + so2 / 2; x2 < bnd.right / CK; x2 += so2) lines.push([cpt(x2, bnd.top / CK - R), cpt(x2, bnd.bottom / CK + R)]); }
        const cl2 = cClipOpen(lines, regB); cl2.sort((a, b) => alongX ? a[0]!.Y - b[0]!.Y : a[0]!.X - b[0]!.X);
        let flip = false; opB._link = so2 * 2.5; const link = opB._link;
        cl2.forEach((p) => {
          let a: [number, number] = [p[0]!.X / CK, p[0]!.Y / CK], b: [number, number] = [p[p.length - 1]!.X / CK, p[p.length - 1]!.Y / CK]; if (flip) { const tt = a; a = b; b = tt; } flip = !flip;
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.3)), pts3: V3[] = [];
          for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; pts3.push([x, y, camDrop(HM, x, y, R)]); }
          const simp = camRDP3(pts3, 0.004), s0 = simp[0]!;
          if (opB._last && Math.hypot(opB._last[0]! - s0[0], opB._last[1]! - s0[1]) <= link) opB.mv.push({ t: 1, x: s0[0], y: s0[1], z: s0[2], f: FB });
          else { opB.mv.push({ t: 0, z: safe }); opB.mv.push({ t: 0, x: s0[0], y: s0[1] }); opB.mv.push({ t: 0, z: s0[2] + 2 }); opB.mv.push({ t: 1, z: s0[2], f: FB * 0.4 }); }
          for (let j = 1; j < simp.length; j++) opB.mv.push({ t: 1, x: simp[j]![0], y: simp[j]![1], z: simp[j]![2], f: FB });
          opB._last = simp[simp.length - 1]!; opB.depth = Math.min(opB.depth, simp.reduce((m, q) => Math.min(m, q[2]), 0));
        });
        camEnd3(opB, safe); if (opB.mv.length) ops.push(opB);
        if (camReach(bm) < -opB.depth) warn.push(bm.name + ' boyu serbest yüzey derinliğine yetmiyor');
      } else warn.push('Serbest yüzey var ama kütüphanede küresel freze yok');
    }
  }
  // 6) helisel delik frezeleme
  helixHoles.forEach((hh) => {
    const em = hh.tool!, cd = kesme(em, mat, mach), F = (cd.F || 400) * 0.7, rc = hh.r - em.d / 2; let op = ops.filter((o) => o.kind === 'helix' && o.tool.id === em.id)[0];
    if (!op) { op = OpB((hh.d! >= 16 ? 'Dairesel cep (helis) Ø' : 'Helisel delik Ø') + fmtN(em.d, em.d % 1 ? 1 : 0), 'helix', em); ops.push(op); }
    if (rc < 0.2) return; const pitch = Math.min(em.d * 0.3, 2), zb = hh.through ? hh.bot - 0.5 : hh.bot, zt = hh.top;
    op.mv.push({ t: 0, z: safe }); op.mv.push({ t: 0, x: hh.x + rc, y: hh.y }); op.mv.push({ t: 0, z: zt + 1 });
    let z = zt + 0.5, a = 0; const seg = 32; while (z > zb) { for (let i = 1; i <= seg; i++) { a = i / seg * Math.PI * 2; z = Math.max(zb, z - pitch / seg); op.mv.push({ t: 1, x: hh.x + Math.cos(a) * rc, y: hh.y + Math.sin(a) * rc, z, f: F }); } }
    for (let i2 = 1; i2 <= seg; i2++) { a = i2 / seg * Math.PI * 2; op.mv.push({ t: 1, x: hh.x + Math.cos(a) * rc, y: hh.y + Math.sin(a) * rc, z: zb, f: F }); }
    op.mv.push({ t: 1, x: hh.x, y: hh.y, z: zb + 0.2, f: F }); op.mv.push({ t: 0, z: safe }); op.depth = Math.min(op.depth, zb);
  });
  // 7) delik delme: punta -> matkap -> kilavuz
  if (drillHoles.length) {
    const dmax = Math.max(...drillHoles.map((hh) => hh.d!)), sp = T.spot.filter((t) => t.d >= dmax + 1).sort((a, b) => a.d - b.d)[0] || T.spot[0];
    if (sp) { const opP = OpB('Punta', 'spot', sp); opP.cyc = { type: 'spot', holes: drillHoles.map((hh) => ({ x: hh.x, y: hh.y, top: hh.top, depth: Math.min(sp.d / 2 - 0.2, hh.d! / 2 + 0.3) })) }; ops.push(opP); }
    const byTool: Record<string, { t: CamTakim; hs: Delik[] }> = {}; drillHoles.forEach((hh) => { (byTool[hh.tool!.id] = byTool[hh.tool!.id] || { t: hh.tool!, hs: [] }).hs.push(hh); });
    Object.keys(byTool).forEach((k) => { const b = byTool[k]!, op = OpB('Delme Ø' + fmtN(b.t.d, b.t.d % 1 ? 1 : 0), 'drill', b.t); op.cyc = { type: 'drill', peck: b.t.d * 3, holes: b.hs.map((hh) => ({ x: hh.x, y: hh.y, top: hh.top, depth: hh.through ? hh.depth! + b.t.d * 0.3 + 0.8 : hh.depth! })) }; ops.push(op); });
    const taps: Record<string, { t: CamTakim; hs: Delik[] }> = {}; drillHoles.forEach((hh) => { if (!hh.tapM || !prm.tap[hh.tapKey!]) return; const tp = T.tap.filter((t) => t.d === hh.tapM && Math.abs(t.cut!.pitch! - hh.pitch!) < 0.01)[0]; if (!tp) { warn.push('M' + hh.tapM + ' kılavuz kütüphanede yok'); return; } (taps[tp.id] = taps[tp.id] || { t: tp, hs: [] }).hs.push(hh); });
    Object.keys(taps).forEach((k) => { const b = taps[k]!, pitch = b.t.cut!.pitch!, op = OpB('Kılavuz M' + b.t.d, 'tap', b.t); op.cyc = { type: 'tap', pitch, holes: b.hs.map((hh) => ({ x: hh.x, y: hh.y, top: hh.top, depth: hh.through ? hh.depth! + 1 : Math.max(2, hh.depth! - 3 * pitch) })) }; ops.push(op); });
  }
  ops = ops.filter((o) => o.cyc || o.mv.length > 2);
  if (!ops.some((o) => o.kind === 'rough')) { const fr = ops.filter((o) => o.kind === 'rest')[0]; if (fr) { fr.kind = 'rough'; fr.name = fr.name.replace('Kalan malzeme', 'Kaba boşaltma'); } }
  ops.forEach((o) => { let need: number; if (o.cyc) { o.depth = -Math.max(...o.cyc.holes.map((hh) => hh.depth - hh.top)); need = Math.max(...o.cyc.holes.map((hh) => hh.depth)) + 2; } else need = -o.depth; o.reach = camReach(o.tool); if (need > o.reach + 0.5) warn.push(o.name + ': gereken boy ' + Math.round(need) + ' mm, takım ' + Math.round(o.reach) + ' mm'); });
  return { ops, warn, holes, floors, M, zLo, zHi, free: ft2.length };
}

export interface YukseklikHaritasi { x0: number; y0: number; g: number; nx: number; ny: number; H: Float32Array }
export function camHeight(M: YerelAg, g: number, freeReg: Yollar, R: number): YukseklikHaritasi {
  const b = CLP.Clipper.GetBounds(freeReg) as { left: number; top: number; right: number; bottom: number }, x0 = b.left / CK - R - 1, y0 = b.top / CK - R - 1, x1 = b.right / CK + R + 1, y1 = b.bottom / CK + R + 1, nx = Math.ceil((x1 - x0) / g) + 1, ny = Math.ceil((y1 - y0) / g) + 1, H = new Float32Array(nx * ny).fill(-1e9);
  const V = M.V, T = M.T, nt = T.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, bb = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3, ax = V[a]!, ay = V[a + 1]!, bx = V[bb]!, by = V[bb + 1]!, cx = V[c]!, cy = V[c + 1]!;
    if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(ay, by, cy) < y0 || Math.min(ay, by, cy) > y1) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / g)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / g)), j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / g)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / g));
    for (let j = j0; j <= j1; j++) { const py = y0 + j * g; for (let i = i0; i <= i1; i++) { const px = x0 + i * g, w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2; if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue; const zz = w1 * V[a + 2]! + w2 * V[bb + 2]! + w3 * V[c + 2]!, k = j * nx + i; if (zz > H[k]!) H[k] = zz; } }
  }
  return { x0, y0, g, nx, ny, H };
}
export function camDrop(HM: YukseklikHaritasi, x: number, y: number, R: number): number {
  const g = HM.g, ri = Math.ceil(R / g), ic = Math.round((x - HM.x0) / g), jc = Math.round((y - HM.y0) / g), R2 = R * R; let best = -1e9;
  for (let j = jc - ri; j <= jc + ri; j++) { if (j < 0 || j >= HM.ny) continue; const dy = HM.y0 + j * g - y; for (let i = ic - ri; i <= ic + ri; i++) { if (i < 0 || i >= HM.nx) continue; const dx = HM.x0 + i * g - x, d2 = dx * dx + dy * dy; if (d2 > R2) continue; const h = HM.H[j * HM.nx + i]!; if (h < -1e8) continue; const zt = h + Math.sqrt(R2 - d2) - R; if (zt > best) best = zt; } }
  return best < -1e8 ? 0 : best;
}
export function camRDP3<P extends number[]>(p: P[], eps: number): P[] {
  if (p.length < 3) return p; const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st: [number, number][] = [[0, p.length - 1]];
  while (st.length) {
    const s = st.pop()!, a = p[s[0]]!, b = p[s[1]]!, dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!, L2 = dx * dx + dy * dy + dz * dz; let dm = 0, di = -1;
    for (let i = s[0] + 1; i < s[1]; i++) { const q = p[i]!; let t = L2 ? ((q[0]! - a[0]!) * dx + (q[1]! - a[1]!) * dy + (q[2]! - a[2]!) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); const ex = a[0]! + dx * t - q[0]!, ey = a[1]! + dy * t - q[1]!, ez = a[2]! + dz * t - q[2]!, d = Math.sqrt(ex * ex + ey * ey + ez * ez); if (d > dm) { dm = d; di = i; } }
    if (dm > eps) { keep[di] = 1; st.push([s[0], di], [di, s[1]]); }
  }
  return p.filter((_q, i) => keep[i]);
}

/* ---------- son islemci ---------- */
export function camFmt(v: number): string { let s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); if (s === '-0') s = '0'; return (v >= 0 && s[0] !== '-' ? '+' : '') + s; }
export function camFmtI(v: number): string { let s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); if (s === '-0' || s === '') s = '0'; if (s.indexOf('.') < 0) s += '.'; return s; }

export interface SonIslemSecenegi {
  heid: boolean;
  safe: number;
  five: boolean;
  tmap: Record<string, number>;
  mat: CamMalzeme;
  mach: CamTezgah;
  mt?: boolean;
  R?: number;
}
const TR_HARF: Record<string, string> = { 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' };
/* tek tek islemlerin NC govdesi: freze baglamasi, torna-freze (C ekseni) ve sure hesabi ortak kullanir */
export function camPostOps(H: (l: string) => void, ops: CamIslem[], s: Baglama, c: SonIslemSecenegi): void {
  const heid = c.heid, safe = c.safe, five = c.five, tl = c.tmap, mat = c.mat, mach = c.mach;
  let cur: { x: number | null; y: number | null; z: number | null; f: number | null; g?: number | null } = { x: null, y: null, z: null, f: null };
  const tr = (x: string): string => upTR(x).replace(/[ÇĞİÖŞÜ]/g, (ch) => TR_HARF[ch]!).replace(/[()]/g, '');
  const mv = (m: Hareket): void => {
    let p = '';
    if (heid) {
      if (m.x != null && (cur.x === null || Math.abs(m.x - cur.x) > 5e-4)) { p += ' X' + camFmt(m.x); cur.x = m.x; }
      if (m.y != null && (cur.y === null || Math.abs(m.y - cur.y) > 5e-4)) { p += ' Y' + camFmt(m.y); cur.y = m.y; }
      if (m.z != null && (cur.z === null || Math.abs(m.z - cur.z) > 5e-4)) { p += ' Z' + camFmt(m.z); cur.z = m.z; }
      if (!p) return; if (m.t === 0) H('L' + p + ' R0 FMAX'); else { const f = Math.round(m.f || cur.f || 300); H('L' + p + (f !== cur.f ? ' F' + f : '')); cur.f = f; }
    } else {
      if (m.x != null && (cur.x === null || Math.abs(m.x - cur.x) > 5e-4)) { p += ' X' + camFmtI(m.x); cur.x = m.x; }
      if (m.y != null && (cur.y === null || Math.abs(m.y - cur.y) > 5e-4)) { p += ' Y' + camFmtI(m.y); cur.y = m.y; }
      if (m.z != null && (cur.z === null || Math.abs(m.z - cur.z) > 5e-4)) { p += ' Z' + camFmtI(m.z); cur.z = m.z; }
      if (!p) return; if (m.t === 0) { H((cur.g === 0 ? '' : 'G0') + p); cur.g = 0; } else { const f2 = Math.round(m.f || cur.f || 300); H((cur.g === 1 ? '' : 'G1') + p + (f2 !== cur.f ? ' F' + f2 : '')); cur.g = 1; cur.f = f2; }
    }
  };
  ops.forEach((op) => {
    const t = op.tool, Tn = tl[t.id] || 1, cd = kesme(t, mat, mach), S = Math.round(cd.n || 1000), sd = op.setup || s;
    cur = { x: null, y: null, z: null, f: null, g: null };
    if (heid) {
      H('; --- T' + Tn + ' ' + tr(t.name) + ' : ' + tr(op.name) + ' ---');
      H('TOOL CALL ' + Tn + ' Z S' + S + (cd.F ? ' F' + Math.round(cd.F) : ''));
      if (five && sd.dir.plane) H('PLANE SPATIAL ' + sd.dir.plane + ' TURN MB MAX FMAX');
      H('L Z' + camFmt(safe + 50) + ' R0 FMAX M13'); cur.z = safe + 50;
    } else if (c.mt) {
      const o2 = (Tn < 10 ? '0' : '') + Tn, d = sd.dir;
      H('(T' + Tn + ' ' + tr(t.name) + ' - ' + tr(op.name) + ' - ' + (d.axial ? (d.az[0] < 0 ? 'ON ALIN EKSENEL' : 'ARKA ALIN EKSENEL') : 'C' + d.C + ' RADYAL') + ')');
      H('T' + o2 + o2); H('G98 (DAKIKADA ILERLEME)'); H('M45 (C EKSENI AKTIF *)');
      H('G0 C' + camFmtI(d.axial ? 0 : d.C!));
      H('(YEREL CERCEVE: X0 = ON ALIN, ' + (d.axial ? 'TAKIM EKSENI = IS MILI EKSENI' : 'Z0 = EKSENDEN ' + camFmtI(c.R!) + ' MM YUKARI, TAKIM EKSENI = RADYAL C' + d.C) + ' *)');
      H('G0 X0 Y0 S' + S + ' M13 (CANLI TAKIM *)'); H('G0 Z' + camFmtI(safe + 50) + ' M8'); cur.z = safe + 50; cur.g = 0;
    } else {
      H('(T' + Tn + ' ' + t.name + ' - ' + op.name + ')'); H('T' + Tn + ' M6');
      H('G0 G90 X0 Y0 S' + S + ' M3'); H('G43 H' + Tn + ' Z' + camFmtI(safe + 50) + ' M8'); cur.z = safe + 50; cur.g = 0;
    }
    if (op.cyc) {
      const cy = op.cyc, h0 = cy.holes[0]!;
      if (heid) {
        const top = h0.top, Q204 = Math.max(safe - top, 5).toFixed(0);
        if (cy.type === 'spot') { H('CYCL DEF 240 CENTERING'); H('  Q200=+2 ;SET-UP CLEARANCE'); H('  Q343=+0 ;SELECT DEPTH/DIA.'); H('  Q201=' + camFmt(-h0.depth) + ' ;DEPTH'); H('  Q206=+' + Math.round((cd.F || 150)) + ' ;FEED RATE FOR PLNGNG'); H('  Q211=+0 ;DWELL TIME AT DEPTH'); H('  Q203=' + camFmt(top) + ' ;SURFACE COORDINATE'); H('  Q204=+' + Q204 + ' ;2ND SET-UP CLEARANCE'); }
        else if (cy.type === 'drill') { H('CYCL DEF 200 DRILLING'); H('  Q200=+2 ;SET-UP CLEARANCE'); H('  Q201=' + camFmt(-h0.depth) + ' ;DEPTH'); H('  Q206=+' + Math.round(cd.F || 200) + ' ;FEED RATE FOR PLNGNG'); H('  Q202=+' + camFmt(cy.peck!).replace('+', '') + ' ;PLUNGING DEPTH'); H('  Q210=+0 ;DWELL TIME AT TOP'); H('  Q203=' + camFmt(top) + ' ;SURFACE COORDINATE'); H('  Q204=+' + Q204 + ' ;2ND SET-UP CLEARANCE'); H('  Q211=+0 ;DWELL TIME AT DEPTH'); }
        else { H('CYCL DEF 206 TAPPING'); H('  Q200=+3 ;SET-UP CLEARANCE'); H('  Q201=' + camFmt(-h0.depth) + ' ;DEPTH OF THREAD'); H('  Q206=+' + Math.round(S * cy.pitch!) + ' ;FEED RATE FOR PLNGNG'); H('  Q211=+0 ;DWELL TIME AT DEPTH'); H('  Q203=' + camFmt(top) + ' ;SURFACE COORDINATE'); H('  Q204=+' + Q204 + ' ;2ND SET-UP CLEARANCE'); }
        const byTop: Record<string, typeof cy.holes> = {}; cy.holes.forEach((hh) => { const k = hh.top.toFixed(2) + '|' + hh.depth.toFixed(2); (byTop[k] = byTop[k] || []).push(hh); });
        let first = true; Object.keys(byTop).forEach((k) => { const hs = byTop[k]!; if (!first) { H('CYCL DEF ' + (cy.type === 'spot' ? 240 : cy.type === 'drill' ? 200 : 206)); H('  Q201=' + camFmt(-hs[0]!.depth) + ' ;DEPTH'); H('  Q203=' + camFmt(hs[0]!.top) + ' ;SURFACE COORDINATE'); } first = false; hs.forEach((hh) => { H('L X' + camFmt(hh.x) + ' Y' + camFmt(hh.y) + ' R0 FMAX M99'); }); });
      } else {
        const g = cy.type === 'tap' ? 'G84' : cy.type === 'drill' ? (cy.peck! < h0.depth ? 'G83' : 'G81') : 'G81'; let firstI = true;
        cy.holes.forEach((hh) => { const zb = hh.top - hh.depth, rr = hh.top + 2; if (firstI) { H('G0 X' + camFmtI(hh.x) + ' Y' + camFmtI(hh.y)); H('G98 ' + g + ' X' + camFmtI(hh.x) + ' Y' + camFmtI(hh.y) + ' Z' + camFmtI(zb) + ' R' + camFmtI(rr) + (g === 'G83' ? ' Q' + camFmtI(cy.peck!) : '') + ' F' + Math.round(cy.type === 'tap' ? S * cy.pitch! : (cd.F || 150))); firstI = false; } else H('X' + camFmtI(hh.x) + ' Y' + camFmtI(hh.y) + ' Z' + camFmtI(zb) + ' R' + camFmtI(rr)); });
        H('G80');
      }
    } else op.mv.forEach(mv);
    if (heid) { H('L Z' + camFmt(safe + 50) + ' R0 FMAX M9'); if (five && sd.dir.plane) H('PLANE RESET TURN FMAX'); }
    else if (c.mt) { H('G0 Z' + camFmtI(safe + 50) + ' M9'); H('M15 (CANLI TAKIM DUR *)'); }
    else { H('G0 Z' + camFmtI(safe + 50) + ' M9'); H('M5'); }
  });
}
export interface SonIslemIsi { setups: Baglama[]; res: BaglamaSonucu[]; prm: CamParametre; mat: CamMalzeme; tmap?: Record<string, number>; part?: string }
export function camPost(job: SonIslemIsi, sIdx: number, dialect: string, mach: CamTezgah): { name: string; text: string } {
  const s = job.setups[sIdx]!, R = job.res[sIdx]!, L = s.L!, heid = dialect === 'heid', out: string[] = [], name = s.pname || ('OP' + ((sIdx + 1) * 10) + '_' + s.dir.k.replace('+', 'P').replace('-', 'M')), safe = job.prm.safe, five = s.mode === '32';
  const H = (l: string): void => { out.push(l); };
  const mat = job.mat, g0: V3 = s.M ? s.M.g0 : [0, 0, 0];
  if (heid) {
    H('BEGIN PGM ' + name + ' MM'); H('BLK FORM 0.1 Z X+0 Y+0 Z' + camFmt(-L.z)); H('BLK FORM 0.2 X' + camFmt(L.x) + ' Y' + camFmt(L.y) + ' Z+0');
    H('; OTO-CAM · ' + s.dir.name + ' (' + s.dir.k + ') · ' + (five ? '3+2 eğik düzlem, aynı bağlama' : 'bağlama: ' + s.dir.name + ' yüzü yukarı') + ' · ' + mat.name);
    H('; SIFIR: bu yüzün sol-ön-üst köşesi (ham blok) · ' + (job.part || '')); if (s.dstock) H('; ' + s.dstock.txt);
    if (five && s.dir.plane) { H('TRANS DATUM AXIS X' + camFmt(g0[0]) + ' Y' + camFmt(g0[1]) + ' Z' + camFmt(g0[2])); }
  } else {
    H('%'); H('O' + (1000 + sIdx * 10 + 10) + ' (' + name + ')'); H('(OTO-CAM ' + s.dir.name + ' ' + s.dir.k + ' - ' + mat.name + ')'); if (s.dstock) { H(s.dstock.box); H(s.dstock.txt); } else H('(HAM KUTU X0 Y0 Z' + camFmtI(-L.z) + ' X' + camFmtI(L.x) + ' Y' + camFmtI(L.y) + ' Z0)'); H('G21 G17 G90 G40 G49 G80'); H(five ? 'G54' : ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'][sIdx % 6]!);
    if (five && s.dir.iso) H('(3+2: ' + s.dir.iso + ' - G68.2 X' + camFmtI(g0[0]) + ' Y' + camFmtI(g0[1]) + ' Z' + camFmtI(g0[2]) + ' ILE EGIK DUZLEM TANIMLAYIN)');
  }
  camPostOps(H, R.ops, s, { heid, safe, five, tmap: job.tmap || {}, mat, mach });
  if (heid) { if (five && s.dir.plane) H('TRANS DATUM RESET'); H('L Z+250 R0 FMAX M30'); H('END PGM ' + name + ' MM'); return { name: name + '.H', text: out.map((l, i) => i + ' ' + l).join('\n') }; }
  H('G28 G91 Z0'); H('M30'); H('%'); return { name: name + '.NC', text: out.join('\n') };
}

/* ---------- sure: kinematik + kalibrasyon ---------- */
export function camTime(text: string, mach: { type?: string }, prm: { acc: number; tc: number }): CamSure | null {
  let p: GkodSonucu; try { p = gParse(text, { dialect: 'auto', lathe: mach.type === 'lathe', rapid: 30000 }) as unknown as GkodSonucu; } catch { return null; }
  const a = prm.acc; let extra = 0, prev: number[] | null = null;
  p.moves.forEach((mv) => {
    if (!mv.t) { prev = null; return; }
    const v = mv.F / 60, d = [mv.b[0]! - mv.a[0]!, mv.b[1]! - mv.a[1]!, mv.b[2]! - mv.a[2]!] as V3, L = Math.hypot(d[0], d[1], d[2]); if (L < 1e-9) return;
    if (L < v * v / a) extra += 2 * Math.sqrt(L / a) - L / v;
    if (prev) { const cs = (prev[0]! * d[0] + prev[1]! * d[1] + prev[2]! * d[2]) / L; extra += (v / a) * (1 - cs) / 2; }
    prev = [d[0] / L, d[1] / L, d[2] / L];
  });
  const tc = p.tools.length * prm.tc / 60;
  return { p, cut: p.stat.feedT, rapid: p.total - p.stat.feedT, dyn: extra / 60, tc, total: p.total + extra / 60 + tc };
}

export type { CamIs, Nokta };
