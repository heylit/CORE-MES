// Torna + freze birlesik plan.
// Cubuk parca -> OP10 torna (on) -> C ekseni frezeleme -> kesme -> OP20 ters baglama (arka torna + arka frezeleme).
// Frezelenecek talas = tornalanmis donel govde - parca. Her vokselin hangi yonden (C acisi / eksenel) en sig erisildigi
// hesaplanir; yonler acgozlu kapsama ile secilir, islemler takim degisimi en az olacak sekilde siralanir.
import { fmtN } from '../bicim.ts';
import {
  bolgeler, camFmtI, camPost, camPostOps, camRDP3, camSetupOps, camTime, camTools, camVoxels,
} from './cekirdek.ts';
import { camLathe, camLatheProfile } from './torna.ts';
import type { TornaAgi, TornaIslemi, TornaProfili, TornaSonucu, TornaTezgahi } from './torna.ts';
import type {
  Atama, Baglama, BaglamaSonucu, CamGeometri, CamIslem, CamMalzeme, CamParametre, CamTakim, NcProgram, TakimSecimi, V3,
  Voksel, Yon,
} from './tipler.ts';

export const MT_RANK: Record<string, number> = { face: 0, rough: 1, rest: 2, finish: 3, ball: 4, helix: 5, spot: 6, drill: 7, tap: 8 };
export const MT_KTXT: Record<string, string> = { rough: 'Kaba', drill: 'Delme', bore: 'Baralama', finish: 'Finiş', groove: 'Kanal', part: 'Kesme' };
const KOMSU: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export interface MtBlok extends CamGeometri { R: number; zmax: number; mt: true; bar: false }
/* cubuk-yerel (x,y radyal, z eksen, on = zmax) -> blok: X = on alindan geriye, Y = y + R, Z = x - R (ust = eksenden R) */
export function camMTBlock(LL: { V: ArrayLike<number>; T: ArrayLike<number> }, P: TornaProfili): MtBlok {
  const V = LL.V, n = V.length / 3; let zmax = -1e9, R = 0, i: number;
  for (i = 0; i < n; i++) zmax = Math.max(zmax, V[i * 3 + 2]!);
  P.prof.forEach((p) => { R = Math.max(R, p.r); }); R = Math.ceil((R + 0.05) * 10) / 10;
  const B = new Float64Array(V.length);
  for (i = 0; i < n; i++) { B[i * 3] = zmax - V[i * 3 + 2]!; B[i * 3 + 1] = V[i * 3 + 1]! + R; B[i * 3 + 2] = V[i * 3]! - R; }
  return { V: B, T: LL.T, stock: { Lx: P.len, Ly: 2 * R, Lz: 2 * R }, R, zmax, mt: true, bar: false };
}
/* yon adaylari: 8 radyal C acisi + parcadaki duz yuzeylerin normalleri + on/arka eksenel */
export function camMTDirs(LL: { V: ArrayLike<number>; T: ArrayLike<number> }, _R: number, P: TornaProfili): Yon[] {
  const V = LL.V, T = LL.T, nt = T.length / 3, cl: Record<string, { phi: number; A: number }> = {}, ang = [0, 45, 90, 135, 180, 225, 270, 315], pr = P.prof; let zmax = -1e9; for (let q = 2; q < V.length; q += 3) zmax = Math.max(zmax, V[q]!);
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, b = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3, ux = V[b]! - V[a]!, uy = V[b + 1]! - V[a + 1]!, uz = V[b + 2]! - V[a + 2]!, vx = V[c]! - V[a]!, vy = V[c + 1]! - V[a + 1]!, vz = V[c + 2]! - V[a + 2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ln = Math.sqrt(nx * nx + ny * ny + nz * nz); if (ln < 1e-9) continue; nx /= ln; ny /= ln; nz /= ln;
    if (Math.abs(nz) > 0.02) continue; const d = nx * V[a]! + ny * V[a + 1]!, zc = (V[a + 2]! + V[b + 2]! + V[c + 2]!) / 3, rz = pr[Math.min(pr.length - 1, Math.max(0, Math.floor((zmax - zc) / 0.25)))]!.r; if (d < 0.5 || d > rz - 0.4) continue;
    const phi = (Math.round(Math.atan2(ny, nx) * 180 / Math.PI * 2) / 2 + 360) % 360, key = phi + '|' + d.toFixed(1); (cl[key] = cl[key] || { phi, A: 0 }).A += ln / 2;
  }
  Object.keys(cl).forEach((k) => { const c = cl[k]!; if (c.A > 12 && !ang.some((x) => { const dd = Math.abs(x - c.phi) % 360; return Math.min(dd, 360 - dd) < 1.5; })) ang.push(c.phi); });
  const dirs: Yon[] = [{ k: 'ON', name: 'Ön alın · eksenel', axial: true, C: 0, ax: [0, 0, 1], ay: [0, 1, 0], az: [-1, 0, 0] }, { k: 'ARKA', name: 'Arka alın · eksenel', axial: true, back: true, C: 0, ax: [0, 0, -1], ay: [0, 1, 0], az: [1, 0, 0] }];
  ang.sort((x, y) => x - y).forEach((C) => { const th = C * Math.PI / 180; let s = Math.sin(th), c = Math.cos(th); if (Math.abs(s) < 1e-12) s = 0; if (Math.abs(c) < 1e-12) c = 0; dirs.push({ k: 'C' + fmtN(C, C % 1 ? 1 : 0), name: 'C' + fmtN(C, C % 1 ? 1 : 0) + '° radyal', C: +C.toFixed(1), ax: [1, 0, 0], ay: [0, c, -s], az: [0, s, c] }); });
  return dirs;
}
/* tornalanmis govde disindaki vokseller "hava": talas yalniz govde icinde, parca disinda */
export function camMTAir(X: Voksel, Gb: MtBlok, P: TornaProfili, inner: (x: number) => number): Uint8Array {
  const nx = X.nx, ny = X.ny, nz = X.nz, N = nx * ny * nz, air = new Uint8Array(N), pr = P.prof, R = Gb.R, Lz = Gb.stock.Lz, tol = 0.4 * Math.min(X.hx, X.hy, X.hz);
  for (let k = 0; k < nz; k++) {
    const z = -Lz + (k + 0.5) * X.hz;
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * X.hy;
      for (let i = 0; i < nx; i++) {
        const id = (k * ny + j) * nx + i; if (X.part[id]) continue; const x = (i + 0.5) * X.hx, pi = Math.min(pr.length - 1, Math.max(0, Math.floor(x / 0.25))), rb = Math.hypot(z + R, y - R), ri = inner(x);
        if (rb > pr[pi]!.r - tol || (ri > 0 && rb < ri + tol)) air[id] = 1;
      }
    }
  }
  // gurultu: cok kucuk ayrik talas parcalarini hava say
  const seen = new Uint8Array(N), V3h = X.hx * X.hy * X.hz;
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || air[s0] || X.part[s0]) continue; const st = [s0], comp: number[] = []; seen[s0] = 1;
    while (st.length) { const v = st.pop()!; comp.push(v); const vi = v % nx, vj = ((v - vi) / nx) % ny, vk = Math.floor(v / (nx * ny)); KOMSU.forEach((o) => { const a = vi + o[0], b = vj + o[1], c = vk + o[2]; if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) return; const w = (c * ny + b) * nx + a; if (!seen[w] && !air[w] && !X.part[w]) { seen[w] = 1; st.push(w); } }); }
    if (comp.length < 4 || comp.length * V3h < 3) comp.forEach((v) => { air[v] = 1; });
  }
  return air;
}
/* isin yuruyusu: vokselden takim yonune cikis; parcaya carparsa erisilemez, degilse talas icindeki derinlik */
export function camMTAccess(X: Voksel, _air: Uint8Array, rem: Uint8Array, dir: Yon, allow?: (i: number, j: number, k: number) => boolean): Float32Array {
  const nx = X.nx, ny = X.ny, nz = X.nz, N = nx * ny * nz, D = new Float32Array(N).fill(-1), az = dir.az, st = 0.5 * Math.min(X.hx, X.hy, X.hz), P = X.part;
  for (let id = 0; id < N; id++) {
    if (!rem[id]) continue; const i = id % nx, j = ((id - i) / nx) % ny, k = Math.floor(id / (nx * ny)); if (allow && !allow(i, j, k)) continue;
    const px = (i + 0.5) * X.hx, py = (j + 0.5) * X.hy, pz = (k + 0.5) * X.hz; let blocked = false, t: number;
    for (t = st; ; t += st) {
      const ii = Math.floor((px + az[0] * t) / X.hx), jj = Math.floor((py + az[1] * t) / X.hy), kk = Math.floor((pz + az[2] * t) / X.hz);
      if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) break;
      const w = (kk * ny + jj) * nx + ii; if (w === id) continue; if (P[w]) { blocked = true; break; }
    }
    if (!blocked) D[id] = t;
  }
  return D;
}
interface MtAday { dir: Yon; D: Float32Array; op: number; f: number }
export function camMTSetups(Gb: MtBlok, X: Voksel, air: Uint8Array, dirs: Yon[], o: { sep?: boolean; zSplit: number; grip: number }): Atama {
  const nx = X.nx, ny = X.ny, N = nx * ny * X.nz, rem = new Uint8Array(N); let tot = 0, i: number;
  for (i = 0; i < N; i++) if (!X.part[i] && !air[i]) { rem[i] = 1; tot++; }
  const groups: { op: number; f: number; dirs: Yon[]; allow?: (ii: number) => boolean }[] = o.sep ? [{ op: 30, f: 1, dirs }] : [{ op: 10, f: 1, dirs: dirs.filter((d) => !d.back), allow: (ii) => (ii + 0.5) * X.hx < o.zSplit }, { op: 20, f: 0.85, dirs: dirs.filter((d) => d.axial ? d.back : true), allow: (ii) => (ii + 0.5) * X.hx > o.grip }];
  const best = new Float32Array(N), W = (dep: number, f: number): number => f / (1 + dep / 12); let chosen: MtAday[] = [];
  groups.forEach((g) => {
    const cand = g.dirs.map((d) => ({ dir: d, D: camMTAccess(X, air, rem, d, g.allow), used: false }));
    for (let guard = 0; guard < 10; guard++) {
      let bi = -1, bg = 0;
      cand.forEach((c, ci) => { if (c.used) return; let gain = 0; const D = c.D; for (let v = 0; v < N; v++) { if (D[v]! < 0) continue; const w = W(D[v]!, g.f) - best[v]!; if (w > 0) gain += w; } if (c.dir.C! % 90 === 0) gain *= 1.04; if (gain > bg) { bg = gain; bi = ci; } });
      if (bi < 0 || bg < Math.max(3, tot * 0.0025)) break;
      const c = cand[bi]!; c.used = true; for (let v2 = 0; v2 < N; v2++) if (c.D[v2]! >= 0) best[v2] = Math.max(best[v2]!, W(c.D[v2]!, g.f));
      chosen.push({ dir: c.dir, D: c.D, op: g.op, f: g.f });
    }
  });
  // talas bolgeleri (bagli bilesenler): bir ozellik (kama kanali, duz yuzey, delik) tek yonden islenir
  const comp = new Int32Array(N).fill(-1), comps: number[][] = [];
  for (i = 0; i < N; i++) {
    if (!rem[i] || comp[i]! >= 0) continue; const ci0 = comps.length, stk0 = [i], mem: number[] = []; comp[i] = ci0;
    while (stk0.length) { const u = stk0.pop()!; mem.push(u); const ui = u % nx, uj = ((u - ui) / nx) % ny, uk = Math.floor(u / (nx * ny)); KOMSU.forEach((q) => { const a = ui + q[0], b = uj + q[1], c = uk + q[2]; if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= X.nz) return; const w = (c * ny + b) * nx + a; if (rem[w] && comp[w]! < 0) { comp[w] = ci0; stk0.push(w); } }); }
    comps.push(mem);
  }
  const assign = (list: MtAday[]): { A: Int8Array; cnt: number[] } => {
    const A = new Int8Array(N).fill(-1), cnt = list.map(() => 0);
    comps.forEach((mem) => {
      let bk = -1, bs = -1;
      list.forEach((c, ci) => { let s1 = 0; for (let q = 0; q < mem.length; q++) { const dv = c.D[mem[q]!]!; if (dv < 0) return; s1 += W(dv, c.f); } s1 /= mem.length; if (c.dir.C! % 90 === 0) s1 *= 1.02; if (s1 > bs + 1e-9) { bs = s1; bk = ci; } });
      if (bk >= 0) { mem.forEach((v) => { A[v] = bk; }); cnt[bk] = cnt[bk]! + mem.length; return; }
      mem.forEach((v) => { let bw = 0, b2 = -1; list.forEach((c, ci) => { if (c.D[v]! < 0) return; const w = W(c.D[v]!, c.f); if (w > bw + 1e-6) { bw = w; b2 = ci; } }); if (b2 >= 0) { A[v] = b2; cnt[b2] = cnt[b2]! + 1; } });
    });
    return { A, cnt };
  };
  const R0 = assign(chosen); chosen = chosen.filter((_c, ci) => R0.cnt[ci]! >= 6);
  chosen.sort((a, b) => a.op - b.op || (a.dir.axial ? 1 : 0) - (b.dir.axial ? 1 : 0) || a.dir.C! - b.dir.C!);
  const R1 = assign(chosen), assigned = R1.A, V3h = X.hx * X.hy * X.hz;
  const setups: Baglama[] = chosen.map((c, ci) => {
    let sx = 0, n = 0; for (let v = 0; v < N; v++) if (assigned[v] === ci) { sx += (v % nx + 0.5) * X.hx; n++; }
    return { d: ci, dir: c.dir, mode: o.sep ? 'clamp' : 'mt', op: c.op, vox: n, vol: n * V3h, cx: n ? sx / n : Gb.stock.Lx / 2 };
  });
  // ulasilamaz bolgeler
  const un = bolgeler(X, rem, assigned, Gb.stock.Lz, () => false);
  return { setups, assigned, tot, totVol: tot * V3h, unreach: un, X };
}

/* ---------- ana akis ---------- */
export interface MtGirdi {
  prm: CamParametre;
  mat: CamMalzeme;
  lathM: TornaTezgahi;
  millM: TornaTezgahi;
  lathLib: CamTakim[];
  millLib: CamTakim[];
  sep: boolean;
}
export interface MtSatiri {
  op: number;
  proc: 'turn' | 'mill';
  name: string;
  tool: CamTakim;
  kind: string;
  side?: number;
  sub?: string;
  L?: TornaSonucu;
  lo?: TornaIslemi;
  mop?: CamIslem;
  setup?: Baglama;
  C?: number;
  axial?: boolean;
  T?: number;
  time?: number;
  cut?: number;
  tcSkip?: boolean;
}
export interface MtGrubu { op: number; rows: MtSatiri[]; time: number }
export interface MtPlani {
  c: MtGirdi;
  prm: CamParametre;
  warn: string[];
  res: (BaglamaSonucu | undefined)[];
  setups: Baglama[];
  tn: Record<string, number>;
  P: TornaProfili;
  Lp: number;
  L1: TornaSonucu;
  L2: TornaSonucu;
  zone: number;
  grip: number;
  G: MtBlok;
  R: number;
  D0: number;
  ID: number;
  face: number;
  X: Voksel;
  dirs: Yon[];
  zSplit: number;
  AS: Atama;
  T: TakimSecimi;
  part?: string;
  tmap?: Record<string, number>;
  ltmap?: Record<string, number>;
  rows?: MtSatiri[];
  ops?: MtGrubu[];
  total?: number;
  progs?: NcProgram[];
}
export function camMTInit(LL: TornaAgi, c: MtGirdi): MtPlani {
  const prm = c.prm, tn: Record<string, number> = {}, warn: string[] = [];
  const P = camLatheProfile(LL, 0.25), Lp = P.len;
  const L1 = camLathe(LL, prm, c.lathM, c.mat, c.lathLib, { mt: true, tn, P, offAllow: 0.5 });
  // OP20: parca ters cevrilir (z -> -z, y -> -y)
  const V2 = new Float64Array(LL.V); for (let i = 0; i < V2.length; i += 3) { V2[i + 1] = -V2[i + 1]!; V2[i + 2] = -V2[i + 2]!; }
  const LL2: TornaAgi = { V: V2, T: LL.T, D0: LL.D0, L0: LL.L0, ID: LL.ID || 0, face: 0.5 }, P2 = camLatheProfile(LL2, 0.25); let envMax = 0; L1.env.forEach((e) => { envMax = Math.max(envMax, e); });
  const zone = L1.backLen, zLim = zone > 0 ? zone + 0.5 : 0.5, grip = Math.min(30, Math.max(12, (Lp - zLim) * 0.5));
  if (Lp - zLim < 10) warn.push('Ters bağlamada tutulacak boy çok kısa (' + fmtN(Lp - zLim, 1) + ' mm) — punta / özel pens gerekir');
  const L2 = camLathe(LL2, prm, c.lathM, c.mat, c.lathLib, { mt: true, op2: true, tn, P: P2, D0: 2 * envMax, face: 0.5, zLim, noPartOff: true, noBore: L1.bore > 0 && L1.Lb >= Lp - 1 });
  L1.warn.forEach((w) => { warn.push('OP10 torna: ' + w); }); L2.warn.forEach((w) => { warn.push('OP20 torna: ' + w); });
  // freze artigi
  const Gb = camMTBlock(LL, P);
  const b1 = L1.bore, l1 = L1.Lb, b2 = L2.bore, l2 = L2.Lb;
  const X = camVoxels(Gb, prm.res);
  X.air = camMTAir(X, Gb, P, (x) => b1 > 0 && x < l1 ? b1 : b2 > 0 && x > Lp - l2 ? b2 : 0);
  const dirs = camMTDirs(LL, Gb.R, P);
  const zSplit = Lp - zone;
  const AS = camMTSetups(Gb, X, X.air, dirs, { sep: c.sep, zSplit, grip });
  const T = camTools(c.millLib);
  const J: MtPlani = {
    c, prm: Object.assign({}, c.prm, { noFace: true }), warn, res: [], setups: [], tn, P, Lp, L1, L2, zone, grip,
    G: Gb, R: Gb.R, D0: LL.D0, ID: LL.ID || 0, face: LL.face, X, dirs, zSplit, AS, T,
  };
  AS.setups.forEach((s) => { J.setups.push(s); });
  return J;
}
export function camMTSetupOps(J: MtPlani, i: number): BaglamaSonucu {
  const s = J.AS.setups[i]!, r = camSetupOps(J.G, J.AS, i, s, J.prm, J.T, J.c.mat, J.c.millM); J.res[i] = r;
  r.ops.forEach((o) => { o.setup = s; o.sIdx = i; });
  r.warn.forEach((w) => { const t = 'OP' + (s.opn || s.op) + ' ' + s.dir.name + ': ' + w; if (J.warn.indexOf(t) < 0) J.warn.push(t); });
  if (r.holes && r.holes.some((h) => h.how === 'none') && !J.c.sep) { const t2 = 'Bazı delikler için ' + (J.c.lathM.type === 'lathe' ? 'canlı takım' : 'freze') + ' kütüphanesinde uygun takım yok — takımı ekleyin ya da “Frezeleme nerede?” seçimini ayrı tezgâh yapın'; if (J.warn.indexOf(t2) < 0) J.warn.unshift(t2); }
  return r;
}
/* siralama + numaralama + programlar + sureler */
export function camMTFinish(J: MtPlani, dialect: string): MtPlani {
  const c = J.c, rows: MtSatiri[] = [], tm: Record<string, number> = {}; let nT = 0;
  Object.keys(J.tn).forEach((id) => { tm[id] = J.tn[id]!; nT = Math.max(nT, J.tn[id]!); });
  const lrow = (L: TornaSonucu, op: number, o: TornaIslemi, side: number): void => { rows.push({ op, proc: 'turn', side, name: o.name, tool: o.tool, sub: o.sub, L, lo: o, kind: 'lathe' }); };
  const msort = (ops: CamIslem[]): CamIslem[] => ops.slice().sort((a, b) => (MT_RANK[a.kind] || 9) - (MT_RANK[b.kind] || 9) || b.tool.d - a.tool.d || (a.tool.id < b.tool.id ? -1 : a.tool.id > b.tool.id ? 1 : 0) || a.sIdx! - b.sIdx!);
  const mrows = (op: number, list: CamIslem[]): void => { msort(list).forEach((o) => { rows.push({ op, proc: 'mill', name: o.name, tool: o.tool, kind: o.kind, mop: o, setup: o.setup, C: o.setup!.dir.C, axial: o.setup!.dir.axial }); }); };
  const mills: Record<number, CamIslem[]> = {}; J.res.forEach((r, i) => { if (!r) return; const s = J.AS.setups[i]!; (mills[s.op!] = mills[s.op!] || []).push(...r.ops); });
  const part = J.L1.ops.filter((o) => o.sub === 'part')[0];
  J.L1.ops.forEach((o) => { if (o.sub !== 'part') lrow(J.L1, 10, o, 1); });
  if (!c.sep) mrows(10, mills[10] || []);
  if (part) lrow(J.L1, 10, part, 1);
  J.L2.ops.forEach((o) => { lrow(J.L2, 20, o, 2); });
  if (!c.sep) mrows(20, mills[20] || []);
  else J.AS.setups.forEach((s, i) => { const r = J.res[i]; if (!r) return; const opn = 30 + i * 10; s.opn = opn; r.ops.forEach((o) => { rows.push({ op: opn, proc: 'mill', name: o.name, tool: o.tool, kind: o.kind, mop: o, setup: s, C: s.dir.C, axial: s.dir.axial }); }); });
  // freze takim numaralari: ayni tezgahta tornadan sonra, ayri tezgahta 1'den
  const mt: Record<string, number> = {}; let mn = c.sep ? 0 : nT; rows.forEach((r) => { if (r.proc === 'mill' && mt[r.tool.id] == null) { mt[r.tool.id] = c.sep ? ++mn : (tm[r.tool.id] || ++mn); } });
  Object.keys(mt).forEach((id) => { if (!c.sep) tm[id] = mt[id]!; });
  J.tmap = c.sep ? mt : tm; J.ltmap = J.tn; J.rows = rows;
  // sureler
  const lm = { type: 'lathe', rpm: c.lathM.rpm }, mm = { type: 'mill', rpm: c.millM.rpm }, prm = J.prm; let prev: MtSatiri | null = null;
  const tmap = J.tmap, ltmap = J.ltmap;
  rows.forEach((r) => {
    let txt: string;
    if (r.proc === 'turn') { txt = r.L!.lines.slice(0, r.L!.hdr).concat(r.L!.lines.slice(r.lo!.i0, r.lo!.i1)).join('\n'); r.T = ltmap[r.tool.id]; }
    else { const out = ['%', 'O9999', 'G21 G17 G90 G40 G49 G80', 'G54']; camPostOps((l) => { out.push(l); }, [r.mop!], r.setup!, { heid: false, safe: prm.safe, five: false, tmap, mat: c.mat, mach: c.millM }); out.push('M30'); txt = out.join('\n'); r.T = tmap[r.tool.id]; }
    const t = camTime(txt, r.proc === 'turn' ? lm : mm, prm); r.time = t ? t.total : 0; r.cut = t ? t.cut : 0;
    const p = prev as MtSatiri | null;
    const same = p && p.tool.id === r.tool.id && p.op === r.op; if (same && t) r.time -= t.tc; r.tcSkip = !!same;
    if (r.proc === 'mill' && !c.sep && p && p.proc === 'mill' && p.op === r.op && (p.C !== r.C || p.axial !== r.axial)) r.time += 2 / 60;
    prev = r;
  });
  const ops: MtGrubu[] = []; rows.forEach((r) => { if (!ops.some((x) => x.op === r.op)) ops.push({ op: r.op, rows: [], time: 0 }); const g = ops.filter((x) => x.op === r.op)[0]!; g.rows.push(r); g.time += r.time!; });
  J.ops = ops;
  J.total = rows.reduce((a, r) => a + r.time!, 0);
  camMTProgs(J, dialect); return J;
}
export function camMTMillProg(J: MtPlani, sIdx: number, dialect: string, name: string): NcProgram {
  const s = J.AS.setups[sIdx]!, job = { setups: J.AS.setups, res: J.res as BaglamaSonucu[], prm: J.prm, mat: J.c.mat, tmap: J.tmap, part: J.part || '' };
  s.pname = name; s.dstock = camMTDStock(J, s); const p = camPost(job, sIdx, dialect, J.c.millM); delete s.pname; delete s.dstock; return p;
}
/* simulasyon icin donel ham: bu operasyon anindaki tornalanmis profil, baglamanin yerel cercevesinde */
export function camMTDStock(J: MtPlani, s: Baglama): { txt: string; box: string } {
  const M = s.M!, d = s.dir, R = J.R, pr = J.P.prof, env = J.L1.env, Lp = J.Lp; let pts: V3[] = [], rm = 0;
  for (let k = 0; k < pr.length; k++) { const X = -pr[k]!.z, r = s.op === 10 && X > J.zSplit ? env[k]! : pr[k]!.r; pts.push([X, r, 0]); }
  pts.unshift([0, pts[0]![1], 0]); pts.push([Lp, pts[pts.length - 1]![1], 0]); pts = camRDP3(pts, 0.03); pts.forEach((q) => { rm = Math.max(rm, q[1]); });
  const C: V3 = [0, R, -R], dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], f = (v: number): string => camFmtI(v);
  if (!d.axial) {
    const yc = dot(d.ay, C) - M.o[1], zc = dot(d.az, C) - M.o[2];
    return { txt: '(HAM DONEL R C' + f(yc) + ',' + f(zc) + ' P ' + pts.map((q) => f(q[0] - M.o[0]) + ':' + f(q[1])).join(' ') + ')', box: '(HAM KUTU X' + f(-M.o[0]) + ' Y' + f(yc - rm) + ' Z' + f(zc) + ' X' + f(Lp - M.o[0]) + ' Y' + f(yc + rm) + ' Z' + f(zc + rm) + ')' };
  }
  const xc = dot(d.ax, C) - M.o[0], yc2 = dot(d.ay, C) - M.o[1], q2 = d.back ? pts.map((q) => [Lp - q[0], q[1]] as [number, number]).reverse() : pts.map((q) => [q[0], q[1]] as [number, number]), o2 = M.o[2], top = d.back ? Lp - o2 : -o2;
  return { txt: '(HAM DONEL A C' + f(xc) + ',' + f(yc2) + ' P ' + q2.map((q) => f(q[0] - top) + ':' + f(q[1])).join(' ') + ')', box: '(HAM KUTU X' + f(xc - rm) + ' Y' + f(yc2 - rm) + ' Z' + f(-Lp) + ' X' + f(xc + rm) + ' Y' + f(yc2 + rm) + ' Z0)' };
}
export function camMTProgs(J: MtPlani, dialect: string): NcProgram[] {
  const c = J.c, P: NcProgram[] = [], prm = J.prm, tmap = J.tmap || {};
  const comb = (op: number, L: TornaSonucu): NcProgram | null => {
    const out: string[] = [], rows = (J.rows || []).filter((r) => r.op === op); if (!rows.length) return null;
    const H = (l: string): void => { out.push(l); };
    L.lines.slice(0, L.hdr).forEach(H); H('(OTO-CAM TORNA-FREZE BIRLESIK - OP' + op + ' - ' + rows.length + ' ISLEM)'); H('(* ISARETLI SATIRLAR TEZGAHA GORE UYARLANMALIDIR)');
    let inMill = false;
    rows.forEach((r, k) => {
      H('(--- ' + (k + 1) + '/' + rows.length + ' ' + (r.proc === 'turn' ? 'TORNA' : 'FREZE') + ' ---)');
      if (r.proc === 'turn') { if (inMill) { H('M46 (C EKSENI BIRAK *)'); H('G99'); inMill = false; } L.lines.slice(r.lo!.i0, r.lo!.i1).forEach(H); }
      else { if (!inMill) { H('G0 X' + camFmtI(J.D0 + 10) + ' Z' + camFmtI(J.face + 10)); inMill = true; } camPostOps(H, [r.mop!], r.setup!, { heid: false, mt: true, R: J.R, safe: prm.safe, five: false, tmap, mat: c.mat, mach: c.millM }); }
    });
    if (inMill) H('M46 (C EKSENI BIRAK *)');
    H('G28 U0 W0'); H('M30'); H('%');
    return { name: 'OP' + op + '_TORNA_FREZE.NC', text: out.join('\n'), kind: 'comb', op };
  };
  if (!c.sep) { const a = comb(10, J.L1), b = comb(20, J.L2); if (a) P.push(a); if (b) P.push(b); }
  P.push({ name: J.L1.name, text: J.L1.text, kind: 'lathe', op: 10 }); P.push({ name: J.L2.name, text: J.L2.text, kind: 'lathe', op: 20, back: true });
  J.AS.setups.forEach((s, i) => { const r = J.res[i]; if (!r || !r.ops.length) return; const nm = 'OP' + (c.sep ? s.opn : s.op) + '_' + (s.dir.axial ? (s.dir.back ? 'ARKA_ALIN' : 'ON_ALIN') : 'C' + String(s.dir.C).replace('.', '_')); const p = camMTMillProg(J, i, c.sep ? dialect : 'iso', nm); p.kind = 'mill'; p.op = c.sep ? s.opn : s.op; p.sIdx = i; P.push(p); });
  J.progs = P; return P;
}
