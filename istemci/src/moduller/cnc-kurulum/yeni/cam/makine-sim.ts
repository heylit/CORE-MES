import { clamp } from '../bicim.ts';
import { gParse } from '../hesap/gkod.ts';
import { camPostOps, camReach, camToGlobal } from './cekirdek.ts';
import type { CamTakim, GkodSonucu, MtIs, V3 } from './tipler.ts';

/* Torna-freze makine simulasyonu: butun plan tek seferde, makinenin icinde.
   Malzeme: isaretli mesafe alani (voksel, + = malzeme) · yuzey: parcali "surface nets".
   Torna: takim ucunun disi (ic capta ici) silinir · Freze: silindir / kure / koni takim hacmi.
   Bu dosya sahneden bagimsiz hesaptir; sahne (makine, ayna, takim modeli) arayuz tarafindadir. */
export const MS_CH = 16;

export interface Alan {
  h: number; X0: number; Y0: number; Z0: number; NX: number; NY: number; NZ: number; f: Float32Array;
  R: number; R0: number; Ri0: number; face: number; Xt: number; cl: number;
  rho: Float32Array; base: Uint32Array; ordA: Uint32Array; rhoA: Float32Array;
  CX: number; CY: number; CZ: number; dirty: Uint8Array; cut: number; Rc: Float32Array; Ri: Float32Array;
}
// Makinedeki yerlesim (prototipin msMachine'inin hesap kismi): eksen yuksekligi, ayna yuzu, karsi is mili konumlari.
export interface Yerlesim { sub: boolean; Ay: number; Az: number; Fm: number; Xtail: number; A: number; grip: number; gripR: number; dSub: number; subHome: number; Bf: number }
export function msYerlesim(J: MtIs): Yerlesim {
  const ntx = J.cfg.lathM.type === 'millturn', Fm = ntx ? -970 : -720, Xtail = J.Lp + 30, A = Fm + Xtail; let gripR = 0;
  for (let k = 0; k < J.P.prof.length; k++) if (-J.P.prof[k]!.z <= J.grip) gripR = Math.max(gripR, J.P.prof[k]!.r);
  return { sub: ntx, Ay: ntx ? 1380 : 1300, Az: -150, Fm, Xtail, A, grip: J.grip, gripR, dSub: 140, subHome: A + 900, Bf: Fm + 20 - J.grip };
}

/* alan */
export function msField(J: MtIs, st: Yerlesim): Alan {
  const D0 = J.D0, R0 = D0 / 2, face = J.face, Xt = st.Xtail, R = J.R;
  const h = clamp(Math.max(Xt + face, D0) / 300, 0.3, 1.2), X0 = -face - 2 * h, Y0 = R - R0 - 2 * h, Z0 = -R - R0 - 2 * h;
  const NX = Math.ceil((Xt + 2 * h - X0) / h) + 1, NY = Math.ceil((2 * R0 + 4 * h) / h) + 1, NZ = NY, N = NX * NY * NZ;
  const nyz = NY * NZ, rho = new Float32Array(nyz), base = new Uint32Array(nyz);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const q = k * NY + j; rho[q] = Math.hypot(Y0 + j * h - R, Z0 + k * h + R); base[q] = q * NX; }
  const ord = Array.prototype.slice.call(base.map((_v, q) => q)) as number[]; ord.sort((a, b) => rho[a]! - rho[b]!);
  const CX = Math.ceil((NX - 1) / MS_CH), CY = Math.ceil((NY - 1) / MS_CH), CZ = Math.ceil((NZ - 1) / MS_CH);
  const F: Alan = { h, X0, Y0, Z0, NX, NY, NZ, f: new Float32Array(N), R, R0, Ri0: (J.ID || 0) / 2, face, Xt, cl: 2 * h,
    rho, base, ordA: new Uint32Array(ord), rhoA: new Float32Array(ord.map((q) => rho[q]!)), CX, CY, CZ, dirty: new Uint8Array(CX * CY * CZ), cut: 0, Rc: new Float32Array(0), Ri: new Float32Array(0) };
  msFieldReset(F); return F;
}
export function msFieldReset(F: Alan): void {
  const f = F.f, h = F.h, cl = F.cl, NX = F.NX, nyz = F.NY * F.NZ;
  for (let q = 0; q < nyz; q++) { let r = F.R0 - F.rho[q]!; const b = F.base[q]!; if (F.Ri0 > 0) r = Math.min(r, F.rho[q]! - F.Ri0); for (let i = 0; i < NX; i++) { const X = F.X0 + i * h, v = Math.min(r, X + F.face, F.Xt + 3 - X); f[b + i] = v > cl ? cl : v < -cl ? -cl : v; } }
  F.dirty.fill(1); F.cut = 0; F.Rc = new Float32Array(NX).fill(F.R0 + 2 * h); F.Ri = new Float32Array(NX).fill(F.Ri0 > 0 ? F.Ri0 : -1);
}
export function msMark(F: Alan, i0: number, i1: number, j0: number, j1: number, k0: number, k1: number): void {
  const C = MS_CH, a0 = Math.max(0, Math.floor((i0 - 1) / C)), a1 = Math.min(F.CX - 1, Math.floor((i1 + 1) / C)), b0 = Math.max(0, Math.floor((j0 - 1) / C)), b1 = Math.min(F.CY - 1, Math.floor((j1 + 1) / C)), c0 = Math.max(0, Math.floor((k0 - 1) / C)), c1 = Math.min(F.CZ - 1, Math.floor((k1 + 1) / C));
  for (let c = c0; c <= c1; c++) for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) F.dirty[(c * F.CY + b) * F.CX + a] = 1;
}
/* torna: dis (od) ya da ic (id). Uc ceyrek bolge siler: ucun disi (ic capta ici) ve serbest uca dogru onu (sgn: +1 on taraf kucuk X).
   Kanal / kesme bicagi (blade) yalniz ±w seridini siler. Rc / Ri: dilimde zaten kesilmis dis / ic yaricap (hiz icin). */
export function msTurn(F: Alan, X: number, r: number, w: number, id: boolean, blade: boolean, sgn: number): number {
  const h = F.h, f = F.f, ord = F.ordA, rA = F.rhoA, n = ord.length, base = F.base, NX = F.NX, Rc = F.Rc, Ri = F.Ri;
  let cut = 0, iA: number, iB: number; const ic = (X - F.X0) / h;
  if (blade) { iA = Math.max(0, Math.floor(ic - (w + h) / h)); iB = Math.min(NX - 1, Math.ceil(ic + (w + h) / h)); }
  else if (sgn > 0) { iA = 0; iB = Math.min(NX - 1, Math.ceil(ic + 2)); } else { iA = Math.max(0, Math.floor(ic - 2)); iB = NX - 1; }
  let lo = 1e9, hi = -1;
  for (let i = iA; i <= iB; i++) {
    const dx = F.X0 + i * h - X, sx = blade ? Math.abs(dx) - w : sgn * dx, near = sx > -2 * h;
    if (!near) { if (!id ? Rc[i]! <= r : Ri[i]! >= r) continue; }
    if (!id) {
      const top = near ? F.R0 + 2 * h : Rc[i]! + 2 * h;
      for (let q = n - 1; q >= 0; q--) { const rr = rA[q]!; if (rr > top) continue; if (rr < r - 2 * h) break; const idx = base[ord[q]!]! + i; let sv = r - rr; if (sx > sv) sv = sx; if (f[idx]! > sv) { if (f[idx]! > 0) cut++; f[idx] = sv; } }
      if (sx <= -h && Rc[i]! > r) Rc[i] = r;
    } else {
      const bot = near ? -1 : Ri[i]! - 2 * h;
      for (let q2 = 0; q2 < n; q2++) { const r2 = rA[q2]!; if (r2 < bot) continue; if (r2 > r + 2 * h) break; const id2 = base[ord[q2]!]! + i; let s2 = r2 - r; if (sx > s2) s2 = sx; if (f[id2]! > s2) { if (f[id2]! > 0) cut++; f[id2] = s2; } }
      if (sx <= -h && Ri[i]! < r) Ri[i] = r;
    }
    if (i < lo) lo = i; if (i > hi) hi = i;
  }
  if (hi >= lo) { const rad = id ? r + 2 * h : F.R0 + h, jr = Math.ceil(rad / h) + 1, jc = Math.round((F.R - F.Y0) / h), kc = Math.round((-F.R - F.Z0) / h); msMark(F, lo, hi, Math.max(0, jc - jr), Math.min(F.NY - 1, jc + jr), Math.max(0, kc - jr), Math.min(F.NZ - 1, kc + jr)); }
  F.cut += cut; return cut;
}
/* freze / matkap: uc p, eksen a (uctan sapa), yaricap r, kesen boy L, sekil 0 duz · 1 kure · 2 koni (tan) */
export function msTool(F: Alan, p: number[], a: number[], r: number, L: number, shape: number, tn: number, test?: boolean): number {
  const h = F.h, f = F.f, NX = F.NX, NY = F.NY, ex = r + h, q1 = [p[0]! + a[0]! * L, p[1]! + a[1]! * L, p[2]! + a[2]! * L];
  const i0 = Math.max(0, Math.floor((Math.min(p[0]!, q1[0]!) - ex - F.X0) / h)), i1 = Math.min(NX - 1, Math.ceil((Math.max(p[0]!, q1[0]!) + ex - F.X0) / h));
  const j0 = Math.max(0, Math.floor((Math.min(p[1]!, q1[1]!) - ex - F.Y0) / h)), j1 = Math.min(NY - 1, Math.ceil((Math.max(p[1]!, q1[1]!) + ex - F.Y0) / h));
  const k0 = Math.max(0, Math.floor((Math.min(p[2]!, q1[2]!) - ex - F.Z0) / h)), k1 = Math.min(F.NZ - 1, Math.ceil((Math.max(p[2]!, q1[2]!) + ex - F.Z0) / h));
  if (i0 > i1 || j0 > j1 || k0 > k1) return 0;
  let cut = 0; const ax = a[0]!, ay = a[1]!, az = a[2]!, ca = shape === 2 ? 1 / Math.sqrt(1 + tn * tn) : 1;
  for (let k = k0; k <= k1; k++) {
    const vz = F.Z0 + k * h - p[2]!;
    for (let j = j0; j <= j1; j++) {
      const vy = F.Y0 + j * h - p[1]!, row = (k * NY + j) * NX;
      for (let i = i0; i <= i1; i++) {
        const idx = row + i, fv = f[idx]!; if (fv <= -h) continue;
        const vx = F.X0 + i * h - p[0]!, al = vx * ax + vy * ay + vz * az; if (al < -h || al > L + h) continue;
        const rx = vx - al * ax, ry = vy - al * ay, rz = vz - al * az, rad = Math.sqrt(rx * rx + ry * ry + rz * rz); let s: number;
        if (shape === 1 && al < r) { const cx = vx - r * ax, cy = vy - r * ay, cz = vz - r * az; s = Math.sqrt(cx * cx + cy * cy + cz * cz) - r; }
        else { s = rad - r; if (-al > s) s = -al; if (shape === 2) { const sc = (rad - al * tn) * ca; if (sc > s) s = sc; } }
        if (al - L > s) s = al - L;
        if (fv > s) { if (fv > 0.6 * h) cut++; if (!test) f[idx] = s; }
      }
    }
  }
  if (!test) { msMark(F, i0, i1, j0, j1, k0, k1); F.cut += cut; }
  return cut;
}
/* yuzey (surface nets): bir parcanin noktalari, normalleri, renkleri ve ucgenleri; sahne bunu geometriye cevirir */
export interface ParcaAgi { P: Float32Array; N: Float32Array; C: Float32Array; I: Uint16Array | Uint32Array }
export const MS_TABAN_RENGI: V3 = [0.72, 0.76, 0.8];
export function msMeshChunk(F: Alan, cx: number, cy: number, cz: number, col: ((x: number, y: number, z: number) => number[]) | null): ParcaAgi | null {
  const C = MS_CH, NX = F.NX, NY = F.NY, NZ = F.NZ, f = F.f, h = F.h;
  const a0 = cx * C - 1, b0 = cy * C - 1, c0 = cz * C - 1, n = C + 1, vmap = new Int32Array(n * n * n).fill(-1), P: number[] = [], Nn: number[] = [], idxs: number[] = [];
  const fv = (i: number, j: number, k: number): number => f[(k * NY + j) * NX + i]!;
  const cs = new Float32Array(8);
  for (let kc = 0; kc < n; kc++) {
    const k = c0 + kc; if (k < 0 || k > NZ - 2) continue;
    for (let jc = 0; jc < n; jc++) {
      const j = b0 + jc; if (j < 0 || j > NY - 2) continue;
      for (let ic = 0; ic < n; ic++) {
        const i = a0 + ic; if (i < 0 || i > NX - 2) continue;
        let m = 0; for (let q = 0; q < 8; q++) { const v = fv(i + (q & 1), j + ((q >> 1) & 1), k + ((q >> 2) & 1)); cs[q] = v; if (v > 0) m |= 1 << q; }
        if (m === 0 || m === 255) continue;
        let sx = 0, sy = 0, sz = 0, ne = 0;
        for (let e = 0; e < 12; e++) {
          const ax = e >> 2, o = e & 3, u = o & 1, w = o >> 1; let qa: number, qb: number; // eksen boyunca 4 kenar
          if (ax === 0) { qa = (u << 1) | (w << 2); qb = qa | 1; } else if (ax === 1) { qa = u | (w << 2); qb = qa | 2; } else { qa = u | (w << 1); qb = qa | 4; }
          const va = cs[qa]!, vb = cs[qb]!; if ((va > 0) === (vb > 0)) continue; const t = va / (va - vb);
          sx += (qa & 1) + ((qb & 1) - (qa & 1)) * t; sy += ((qa >> 1) & 1) + (((qb >> 1) & 1) - ((qa >> 1) & 1)) * t; sz += ((qa >> 2) & 1) + (((qb >> 2) & 1) - ((qa >> 2) & 1)) * t; ne++;
        }
        sx /= ne; sy /= ne; sz /= ne;
        const gx = (cs[1]! - cs[0]! + cs[3]! - cs[2]! + cs[5]! - cs[4]! + cs[7]! - cs[6]!), gy = (cs[2]! - cs[0]! + cs[3]! - cs[1]! + cs[6]! - cs[4]! + cs[7]! - cs[5]!), gz = (cs[4]! - cs[0]! + cs[5]! - cs[1]! + cs[6]! - cs[2]! + cs[7]! - cs[3]!), gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        vmap[(kc * n + jc) * n + ic] = P.length / 3; P.push(F.X0 + (i + sx) * h, F.Y0 + (j + sy) * h, F.Z0 + (k + sz) * h); Nn.push(-gx / gl, -gy / gl, -gz / gl);
      }
    }
  }
  if (!P.length) return null;
  // yuzler: bu parcanin sahip oldugu noktalardaki kenarlar
  for (let kk = 1; kk < n; kk++) {
    const K = c0 + kk; if (K > NZ - 1) continue;
    for (let jj = 1; jj < n; jj++) {
      const Jj = b0 + jj; if (Jj > NY - 1) continue;
      for (let ii = 1; ii < n; ii++) {
        const I = a0 + ii; if (I > NX - 1) continue;
        const v0 = fv(I, Jj, K), in0 = v0 > 0;
        for (let A = 0; A < 3; A++) {
          const I2 = I + (A === 0 ? 1 : 0), J2 = Jj + (A === 1 ? 1 : 0), K2 = K + (A === 2 ? 1 : 0); if (I2 > NX - 1 || J2 > NY - 1 || K2 > NZ - 1) continue;
          if (in0 === (fv(I2, J2, K2) > 0)) continue;
          // eksen A etrafindaki 4 hucre: u=(A+1)%3, v=(A+2)%3
          const cc = [ii, jj, kk], U = (A + 1) % 3, Vv = (A + 2) % 3, q4: number[] = []; let ok = true;
          for (let s4 = 0; s4 < 4; s4++) { const d = cc.slice(), du = (s4 === 1 || s4 === 2) ? 0 : -1, dv = s4 >= 2 ? 0 : -1; d[U]! += du; d[Vv]! += dv; if (d[0]! < 0 || d[1]! < 0 || d[2]! < 0) { ok = false; break; } const vi = vmap[(d[2]! * n + d[1]!) * n + d[0]!]!; if (vi < 0) { ok = false; break; } q4.push(vi); }
          if (!ok) continue;
          if (in0) idxs.push(q4[0]!, q4[1]!, q4[2]!, q4[0]!, q4[2]!, q4[3]!); else idxs.push(q4[0]!, q4[2]!, q4[1]!, q4[0]!, q4[3]!, q4[2]!);
        }
      }
    }
  }
  if (!idxs.length) return null;
  const nv = P.length / 3, cl = new Float32Array(nv * 3);
  for (let z = 0; z < nv; z++) { const c3 = col ? col(P[z * 3]!, P[z * 3 + 1]!, P[z * 3 + 2]!) : MS_TABAN_RENGI; cl[z * 3] = c3[0]!; cl[z * 3 + 1] = c3[1]!; cl[z * 3 + 2] = c3[2]!; }
  return { P: new Float32Array(P), N: new Float32Array(Nn), C: cl, I: nv > 65535 ? new Uint32Array(idxs) : new Uint16Array(idxs) };
}
/* karsilastirma: parcanin isaretli mesafesi ayni izgarada */
export function msPartSDF(F: Alan, G: { V: ArrayLike<number>; T: ArrayLike<number> }): Float32Array {
  const V = G.V, T = G.T, h = F.h, NX = F.NX, NY = F.NY, NZ = F.NZ, N = NX * NY * NZ, band = 2.5 * h, d = new Float32Array(N).fill(band), ins = new Uint8Array(N);
  const cols: (number[] | undefined)[] = new Array(NX * NY), nt = T.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, b = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3, ax = V[a]!, ay = V[a + 1]!, bx = V[b]!, by = V[b + 1]!, cx = V[c]!, cy = V[c + 1]!, den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) > 1e-12) {
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - F.X0) / h)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, cx) - F.X0) / h)), j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - F.Y0) / h)), j1 = Math.min(NY - 1, Math.floor((Math.max(ay, by, cy) - F.Y0) / h));
      for (let j = j0; j <= j1; j++) { const py = F.Y0 + j * h + 1.3e-4; for (let i = i0; i <= i1; i++) { const px = F.X0 + i * h + 2.7e-4, w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2; if (w1 < 0 || w2 < 0 || w3 < 0) continue; (cols[j * NX + i] = cols[j * NX + i] || []).push(w1 * V[a + 2]! + w2 * V[b + 2]! + w3 * V[c + 2]!); } }
    }
  }
  for (let q = 0; q < NX * NY; q++) { const L = cols[q]; if (!L || L.length < 2) continue; L.sort((u, v) => u - v); const ii = q % NX, jj = (q - ii) / NX; for (let m = 0; m + 1 < L.length; m += 2) { const k0 = Math.max(0, Math.ceil((L[m]! - F.Z0) / h)), k1 = Math.min(NZ - 1, Math.floor((L[m + 1]! - F.Z0) / h)); for (let k = k0; k <= k1; k++) ins[(k * NY + jj) * NX + ii] = 1; } }
  function ptTri(px: number, py: number, pz: number, a: number, b: number, c: number): number {
    const abx = V[b]! - V[a]!, aby = V[b + 1]! - V[a + 1]!, abz = V[b + 2]! - V[a + 2]!, acx = V[c]! - V[a]!, acy = V[c + 1]! - V[a + 1]!, acz = V[c + 2]! - V[a + 2]!, apx = px - V[a]!, apy = py - V[a + 1]!, apz = pz - V[a + 2]!;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz; if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
    const bpx = px - V[b]!, bpy = py - V[b + 1]!, bpz = pz - V[b + 2]!, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz; if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3), qx = apx - v * abx, qy = apy - v * aby, qz = apz - v * abz; return qx * qx + qy * qy + qz * qz; }
    const cpx = px - V[c]!, cpy = py - V[c + 1]!, cpz = pz - V[c + 2]!, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz; if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6), rx = apx - w * acx, ry = apy - w * acy, rz = apz - w * acz; return rx * rx + ry * ry + rz * rz; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w2 = (d4 - d3) / ((d4 - d3) + (d5 - d6)), sx = bpx - w2 * (V[c]! - V[b]!), sy = bpy - w2 * (V[c + 1]! - V[b + 1]!), sz = bpz - w2 * (V[c + 2]! - V[b + 2]!); return sx * sx + sy * sy + sz * sz; }
    const dn = 1 / (va + vb + vc), v2 = vb * dn, w3 = vc * dn, ux = apx - abx * v2 - acx * w3, uy = apy - aby * v2 - acy * w3, uz = apz - abz * v2 - acz * w3; return ux * ux + uy * uy + uz * uz;
  }
  for (let t2 = 0; t2 < nt; t2++) {
    const A = T[t2 * 3]! * 3, B = T[t2 * 3 + 1]! * 3, Cc = T[t2 * 3 + 2]! * 3;
    const x0 = Math.min(V[A]!, V[B]!, V[Cc]!) - band, x1 = Math.max(V[A]!, V[B]!, V[Cc]!) + band, y0 = Math.min(V[A + 1]!, V[B + 1]!, V[Cc + 1]!) - band, y1 = Math.max(V[A + 1]!, V[B + 1]!, V[Cc + 1]!) + band, z0 = Math.min(V[A + 2]!, V[B + 2]!, V[Cc + 2]!) - band, z1 = Math.max(V[A + 2]!, V[B + 2]!, V[Cc + 2]!) + band;
    for (let k2 = Math.max(0, Math.ceil((z0 - F.Z0) / h)); k2 <= Math.min(NZ - 1, Math.floor((z1 - F.Z0) / h)); k2++) for (let j2 = Math.max(0, Math.ceil((y0 - F.Y0) / h)); j2 <= Math.min(NY - 1, Math.floor((y1 - F.Y0) / h)); j2++) for (let i2 = Math.max(0, Math.ceil((x0 - F.X0) / h)); i2 <= Math.min(NX - 1, Math.floor((x1 - F.X0) / h)); i2++) {
      const id = (k2 * NY + j2) * NX + i2, dd = Math.sqrt(ptTri(F.X0 + i2 * h, F.Y0 + j2 * h, F.Z0 + k2 * h, A, B, Cc)); if (dd < d[id]!) d[id] = dd;
    }
  }
  for (let z = 0; z < N; z++) if (!ins[z]) d[z] = -d[z]!;
  return d;
}
export function msSample(F: Alan, A: Float32Array, x: number, y: number, z: number): number {
  const h = F.h, fx = (x - F.X0) / h, fy = (y - F.Y0) / h, fz = (z - F.Z0) / h, i = Math.max(0, Math.min(F.NX - 2, Math.floor(fx))), j = Math.max(0, Math.min(F.NY - 2, Math.floor(fy))), k = Math.max(0, Math.min(F.NZ - 2, Math.floor(fz))), u = fx - i, v = fy - j, w = fz - k, NX = F.NX, NY = F.NY;
  const g = (a: number, b: number, c: number): number => A[((k + c) * NY + j + b) * NX + i + a]!;
  return ((g(0, 0, 0) * (1 - u) + g(1, 0, 0) * u) * (1 - v) + (g(0, 1, 0) * (1 - u) + g(1, 1, 0) * u) * v) * (1 - w) + ((g(0, 0, 1) * (1 - u) + g(1, 0, 1) * u) * (1 - v) + (g(0, 1, 1) * (1 - u) + g(1, 1, 1) * u) * v) * w;
}
export interface KarsilastirmaSayaci { g: number; l: number; ok: number }
export function msCmpColor(F: Alan, PS: Float32Array, n: KarsilastirmaSayaci, x: number, y: number, z: number): V3 {
  const d = msSample(F, PS, x, y, z), tol = 0.35 * F.h + 0.05;
  if (d > tol) { n.g++; return [0.95, 0.25, 0.22]; } if (d < -tol) { n.l++; return d < -1.5 ? [0.95, 0.62, 0.15] : [0.98, 0.82, 0.3]; } n.ok++; return [0.3, 0.78, 0.42];
}

/* zaman cizelgesi */
export interface TakimHacmi { r: number; shape: number; tn: number; L: number; reach: number; lmode?: 'id' | 'drill' | 'od'; blade?: boolean; w?: number }
export function msToolInfo(t: CamTakim, proc: string): TakimHacmi {
  const k = t.kind, I: TakimHacmi = { r: (t.d || 6) / 2, shape: 0, tn: 0, L: Math.max(8, (t.d || 6) * 1.3), reach: 0 };
  if (k === 'ball' || k === 'taperball' || k === 'lollipop') I.shape = 1;
  if (/^(drill|stepdrill|idrill|lt_udrill)$/.test(k)) { I.shape = 2; I.tn = 1.66; I.L = Math.max(12, I.r * 4); }
  if (/^(spot|center|csink|chamfer)$/.test(k)) { I.shape = 2; I.tn = 1; I.L = Math.max(6, I.r * 2); }
  if (k === 'tap') I.L = Math.max(10, I.r * 3);
  I.reach = camReach(t) || 40;
  if (proc === 'turn') {
    I.lmode = /^lt_(bore|igroove|ithread)$/.test(k) ? 'id' : /^(drill|stepdrill|idrill|lt_udrill|spot|center)$/.test(k) ? 'drill' : 'od';
    const mw = /(\d+(?:[.,]\d)?) *mm/.exec(t.name || ''); I.blade = /^lt_(groove|part|igroove|facegroove)$/.test(k); I.w = I.blade ? (mw ? parseFloat(mw[1]!.replace(',', '.')) : 3) / 2 : 0.1;
  }
  return I;
}
export interface SimHareketi { a: number[]; b: number[]; t: number; dur: number }
export interface SimParcasi {
  ev?: 'approach' | 'transfer' | 'flip' | 'tc';
  dur: number; row: number; stage: 'op10' | 'op20';
  tool?: CamTakim; proc?: 'turn' | 'mill'; back?: boolean; ti?: TakimHacmi; mv?: SimHareketi[];
  axis?: number[]; C?: number; axial?: boolean;
}
export interface ZamanCizelgesi { segs: SimParcasi[]; cum: number[]; total: number; rowStart: number[] }
export function msBuildTimeline(J: MtIs, st: Yerlesim): ZamanCizelgesi {
  const segs: SimParcasi[] = [], prm = J.prm, tcm = (prm.tc || 8) / 60, hasSub = st.sub; let prev: MtIs['rows'][number] | null = null;
  const add = (s: SimParcasi): void => { segs.push(s); };
  J.rows.forEach((r, ri) => {
    const stage = r.op === 10 ? 'op10' : 'op20', tl = msToolInfo(r.tool, r.proc);
    if (r.proc === 'turn' && r.sub === 'part' && hasSub) add({ ev: 'approach', dur: 4 / 60, row: ri, stage: 'op10' });
    if (prev && prev.op === 10 && r.op !== 10) add({ ev: hasSub ? 'transfer' : 'flip', dur: (hasSub ? 5 : 8) / 60, row: ri, stage: 'op20' });
    if (!prev || prev.tool.id !== r.tool.id || prev.proc !== r.proc) add({ ev: 'tc', dur: tcm, row: ri, stage, tool: r.tool, proc: r.proc });
    const mvs: SimHareketi[] = [];
    if (r.proc === 'turn') {
      const L = r.L!, txt = L.lines.slice(0, L.hdr).concat(L.lines.slice(r.lo!.i0, r.lo!.i1)).join('\n'), p = gParse(txt, { dialect: 'iso', lathe: true, rapid: 30000 }) as unknown as GkodSonucu, back = L === J.L2;
      const mx = back ? (z: number): number => J.Lp + z : (z: number): number => -z;
      p.moves.forEach((m, mi) => { if (mi === 0 && !m.t) return; mvs.push({ a: [mx(m.a[2]!), m.a[0]!], b: [mx(m.b[2]!), m.b[0]!], t: m.t, dur: m.dur }); });
      add({ row: ri, stage, proc: 'turn', back, tool: r.tool, ti: tl, mv: mvs, dur: mvs.reduce((a, m) => a + m.dur, 0) });
    } else {
      const out = ['%', 'O9999', 'G21 G17 G90 G40 G49 G80', 'G54']; camPostOps((l) => { out.push(l); }, [r.mop!], r.setup!, { heid: false, safe: prm.safe, five: false, tmap: J.tmap!, mat: J.c.mat, mach: J.c.millM }); out.push('M30');
      const p2 = gParse(out.join('\n'), { dialect: 'iso', lathe: false, rapid: 30000 }) as unknown as GkodSonucu, M = r.setup!.M!, dir = r.setup!.dir, G = (q: number[]): number[] => camToGlobal(M, dir, q[0]!, q[1]!, q[2]!);
      p2.moves.forEach((m, mi) => {
        if (mi === 0 && !m.t) return;
        if (m.pts && m.pts.length > 3) { let pa = m.a; const n = m.pts.length / 3, dd = m.dur / n; for (let q = 0; q < n; q++) { const pb = [m.pts[q * 3]!, m.pts[q * 3 + 1]!, m.pts[q * 3 + 2]!]; mvs.push({ a: G(pa), b: G(pb), t: m.t, dur: dd }); pa = pb; } }
        else mvs.push({ a: G(m.a), b: G(m.b), t: m.t, dur: m.dur });
      });
      add({ row: ri, stage: r.op === 10 ? 'op10' : 'op20', proc: 'mill', tool: r.tool, ti: tl, axis: dir.az.slice(), C: dir.axial ? 0 : dir.C, axial: !!dir.axial, mv: mvs, dur: mvs.reduce((a, m) => a + m.dur, 0) });
    }
    prev = r;
  });
  const cum = [0]; segs.forEach((s) => { cum.push(cum[cum.length - 1]! + s.dur); });
  return { segs, cum, total: cum[cum.length - 1]!, rowStart: J.rows.map((_r, ri) => { for (let i = 0; i < segs.length; i++) if (segs[i]!.row === ri) return cum[i]!; return 0; }) };
}

/* oynatici: zaman t'ye kadar talas kaldirir, hizli harekette carpismayi kaydeder */
export interface Carpisma { si: number; row: number; p: number[]; t: number }
export interface Benzetim extends ZamanCizelgesi { J: MtIs; st: Yerlesim; F: Alan; pos: number; si: number; colls: Carpisma[]; stubOn: boolean; t: number }
export function msBaslat(J: MtIs): Benzetim {
  const st = msYerlesim(J), F = msField(J, st), Z = msBuildTimeline(J, st);
  const S: Benzetim = { ...Z, J, st, F, pos: 0, si: 0, colls: [], stubOn: false, t: 0 };
  msReset(S); return S;
}
export function msSegPlace(st: Yerlesim, s: SimParcasi, u: number): { stage: 'flip' | 'op10'; off: number } {
  let off = 0; const stage = s.stage;
  if (stage === 'op20' && st.sub) off = st.dSub;
  if (s.ev === 'transfer') off = st.dSub * u;
  return { stage: !st.sub && stage === 'op20' ? 'flip' : 'op10', off };
}
export function msApply(S: Benzetim, si: number, u0: number, u1: number): void {
  const s = S.segs[si]!, F = S.F;
  if (s.ev) {
    if ((s.ev === 'transfer' || s.ev === 'flip') && u0 === 0 && u1 > 0) msCutStub(S);
    return;
  }
  const mv = s.mv!, tot = s.dur || 1e-9, ti = s.ti!; let acc = 0;
  for (let k = 0; k < mv.length; k++) {
    const m = mv[k]!, a0 = acc / tot, a1 = (acc + m.dur) / tot; acc += m.dur;
    if (a1 <= u0 || a0 >= u1) continue; const v0 = m.dur > 0 ? Math.max(0, (u0 - a0) / (a1 - a0)) : 0, v1 = m.dur > 0 ? Math.min(1, (u1 - a0) / (a1 - a0)) : 1;
    if (s.proc === 'turn') {
      const L = Math.hypot(m.b[0]! - m.a[0]!, m.b[1]! - m.a[1]!) * (v1 - v0), n = Math.max(1, Math.ceil(L / (ti.blade ? Math.min(ti.w!, F.h) * 0.7 : 0.18)));
      for (let q = 1; q <= n; q++) {
        const w = v0 + (v1 - v0) * q / n, X = m.a[0]! + (m.b[0]! - m.a[0]!) * w, r = m.a[1]! + (m.b[1]! - m.a[1]!) * w;
        if (!m.t) { if (msProbe(S, X, r, ti)) msCollide(S, si, [X, r]); continue; }
        if (ti.lmode === 'drill') msTool(F, [X, S.J.R, -S.J.R], s.back ? [1, 0, 0] : [-1, 0, 0], ti.r, ti.L, ti.shape, ti.tn);
        else msTurn(F, X, r, ti.w!, ti.lmode === 'id', !!ti.blade, s.back ? -1 : 1);
      }
    } else {
      const L2 = Math.hypot(m.b[0]! - m.a[0]!, m.b[1]! - m.a[1]!, m.b[2]! - m.a[2]!) * (v1 - v0), stp = clamp(ti.r * 0.35, F.h * 0.6, 2), n2 = Math.max(1, Math.ceil(L2 / (m.t ? stp : 1.5)));
      for (let q2 = 1; q2 <= n2; q2++) {
        const w2 = v0 + (v1 - v0) * q2 / n2, p = [m.a[0]! + (m.b[0]! - m.a[0]!) * w2, m.a[1]! + (m.b[1]! - m.a[1]!) * w2, m.a[2]! + (m.b[2]! - m.a[2]!) * w2];
        if (!m.t) { if (msTool(F, p, s.axis!, ti.r * 0.95, Math.min(ti.reach, 60), ti.shape, ti.tn, true) > 4) msCollide(S, si, p); continue; }
        msTool(F, p, s.axis!, ti.r, ti.L, ti.shape, ti.tn);
      }
    }
  }
}
export function msProbe(S: Benzetim, X: number, r: number, ti: TakimHacmi): boolean {
  const F = S.F, h = F.h, pt = ti.lmode === 'drill' ? [X, S.J.R, -S.J.R] : [X, S.J.R, r - S.J.R];
  if (ti.lmode === 'drill') return false;
  const i = Math.round((pt[0]! - F.X0) / h), j = Math.round((pt[1]! - F.Y0) / h), k = Math.round((pt[2]! - F.Z0) / h); if (i < 0 || j < 0 || k < 0 || i >= F.NX || j >= F.NY || k >= F.NZ) return false;
  return F.f[(k * F.NY + j) * F.NX + i]! > 1.2 * h;
}
export function msCollide(S: Benzetim, si: number, p: number[]): void {
  const s = S.segs[si]!; if (S.colls.some((c) => c.si === si)) return;
  S.colls.push({ si, row: s.row, p: p.slice(), t: S.cum[si]! });
}
export function msCutStub(S: Benzetim): void {
  const F = S.F, h = F.h, cutX = S.J.Lp + 2, i0 = Math.max(0, Math.floor((cutX - F.X0) / h));
  for (let k = 0; k < F.NZ; k++) for (let j = 0; j < F.NY; j++) { const b = (k * F.NY + j) * F.NX; for (let i = i0; i < F.NX; i++) F.f[b + i] = -F.cl; }
  for (let i3 = i0; i3 < F.NX; i3++) F.Rc[i3] = -1;
  msMark(F, i0, F.NX - 1, 0, F.NY - 1, 0, F.NZ - 1); S.stubOn = true;
}
// `budget` (ms) verilirse calisma o kadar surer ve false doner (kare dongusu); `simdi` olcum saatidir.
export function msAdvance(S: Benzetim, t: number, budget?: number, simdi: () => number = () => performance.now()): boolean {
  const t0 = simdi(), segs = S.segs, cum = S.cum;
  while (S.pos < t - 1e-12) {
    const si = S.si; if (si >= segs.length) { S.pos = S.total; break; }
    const s0 = cum[si]!, s1 = cum[si + 1]!, d = s1 - s0, u0 = d > 0 ? (S.pos - s0) / d : 1; let tgt = Math.min(t, s1), u1 = d > 0 ? (tgt - s0) / d : 1;
    if (budget) { const maxStep = d > 0 ? 0.06 : 1; if (u1 - u0 > maxStep) { u1 = u0 + maxStep; tgt = s0 + u1 * d; } }
    msApply(S, si, u0, u1); S.pos = tgt; if (tgt >= s1 - 1e-12) S.si++;
    if (budget && simdi() - t0 > budget) return false;
  }
  return true;
}
export function msReset(S: Benzetim): void { msFieldReset(S.F); S.pos = 0; S.si = 0; S.colls = []; S.stubOn = false; }
export function msSegAt(S: ZamanCizelgesi, t: number): number { const c = S.cum; let lo = 0, hi = S.segs.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid]! <= t) lo = mid; else hi = mid - 1; } return lo; }
// geri sarista alan bastan kurulur (prototipteki gibi); ileri sarista yalniz aradaki talas kaldirilir
export function msSeekHesap(S: Benzetim, t: number): void { t = clamp(t, 0, S.total); if (t < S.pos - 1e-9) msReset(S); S.t = t; msAdvance(S, t); }
