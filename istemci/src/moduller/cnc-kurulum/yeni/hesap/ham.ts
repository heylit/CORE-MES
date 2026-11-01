// Ham malzeme hesabı: STEP/STL ağından hammadde ölçüsü, ağırlık, talaş, dönme ekseni ve yöntem (prototipin hesap kısmı aynen;
// P3 yazdı, çekirdeğe alındı çünkü sonucu Ana Sayfa, Hazırlık ve G-Kod de okur). Parça S'den okuyan sarmalayıcı parca.ts'te.
import { Matrix4, Quaternion } from 'three';
import { num } from '../bicim.ts';
import { STOCK_DEF, type StokAyari } from '../durum.ts';
import { CK, CLP, camSlice } from './kesit.ts';

export type HamTipi = 'block' | 'bar' | 'tube';
export type Eksen = 'auto' | 'x' | 'y' | 'z';

// Ayar ve açılış birleşimi durum.ts'tedir (acilisVarsayimlari).
export type HamAyar = StokAyari;
export { STOCK_DEF };

export const BAR_STD = [6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 36, 40, 42, 45, 50, 55, 60, 63, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 280, 300, 320, 350, 380, 400];
export const PLATE_STD = [3, 4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 250, 280, 300];

export interface Ag { P: Float32Array; I: Uint32Array; solids: number }
export interface Govde { P: Float32Array; I: Uint32Array; vol: number; name: string }

// Hesabin gordugu parca: ag, yon ve onbellek (prototipin S nesnesinin hesap alanlari).
export interface HamParca {
  P: Float32Array; I: Uint32Array; q: Quaternion; name: string; tris: number;
  axKey?: string | null; autoAi?: number; autoCirc?: number; circs?: number[]; geo?: Geometri | null;
}

export interface Kutu { min: number[]; max: number[] }

export function meshVol(P: Float32Array, I: Uint32Array): number {
  let v = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
    v += (P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!)) / 6;
  }
  return Math.abs(v);
}

// Imzali hacim ve yuzey alani (sSetMesh).
export function agOlcu(P: Float32Array, I: Uint32Array): { vol: number; area: number } {
  let vol = 0, area = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
    const ax = P[a]!, ay = P[a + 1]!, az = P[a + 2]!, bx = P[b]!, by = P[b + 1]!, bz = P[b + 2]!, cx = P[c]!, cyv = P[c + 1]!, cz = P[c + 2]!;
    vol += (ax * (by * cz - bz * cyv) - ay * (bx * cz - bz * cx) + az * (bx * cyv - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cyv - ay, vz = cz - az, nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
  }
  return { vol, area };
}

// Cok govdeli STEP: secili govde parca olur; -1 butun govdeler birlikte.
export function govdeAgi(bodies: Govde[], sel: number): Ag {
  const L = sel < 0 ? bodies : [bodies[sel]!];
  let nv = 0, ni = 0;
  L.forEach((b) => { nv += b.P.length; ni += b.I.length; });
  const P = new Float32Array(nv), I = new Uint32Array(ni);
  let po = 0, io = 0;
  L.forEach((b) => { const base = po / 3; P.set(b.P, po); for (let j = 0; j < b.I.length; j++) I[io + j] = b.I[j]! + base; po += b.P.length; io += b.I.length; });
  return { P, I, solids: L.length };
}

// Varsayilan secim en buyuk hacimli govde.
export function enBuyukGovde(bodies: Govde[]): number {
  let s = 0;
  bodies.forEach((b, k) => { if (b.vol > bodies[s]!.vol) s = k; });
  return s;
}

export function parseSTL(buf: Uint8Array): Ag {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  let P: Float32Array;
  if (n && 84 + n * 50 === buf.byteLength) {
    P = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) P[i * 9 + k] = dv.getFloat32(o + k * 4, true); }
  } else {
    const txt = new TextDecoder().decode(buf), re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g, arr: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) arr.push(+m[1]!, +m[2]!, +m[3]!);
    if (!arr.length) throw new Error('STL dosyası okunamadı');
    P = new Float32Array(arr);
  }
  const I = new Uint32Array(P.length / 3);
  for (let i = 0; i < I.length; i++) I[i] = i;
  return { P, I, solids: 1 };
}

export function jacobi3(A: number[][]): number[][] {
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], a = A.map((r) => r.slice());
  const g = (m: number[][], r: number, c: number) => m[r]![c]!;
  const s_ = (m: number[][], r: number, c: number, v: number) => { m[r]![c] = v; };
  for (let sweep = 0; sweep < 30; sweep++) {
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(g(a, p, q)) < 1e-12) continue;
      const th = (g(a, q, q) - g(a, p, p)) / (2 * g(a, p, q)), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = g(a, k, p), akq = g(a, k, q); s_(a, k, p, c * akp - s * akq); s_(a, k, q, s * akp + c * akq); }
      for (let k = 0; k < 3; k++) { const apk = g(a, p, k), aqk = g(a, q, k); s_(a, p, k, c * apk - s * aqk); s_(a, q, k, s * apk + c * aqk); }
      for (let k = 0; k < 3; k++) { const vkp = g(V, k, p), vkq = g(V, k, q); s_(V, k, p, c * vkp - s * vkq); s_(V, k, q, s * vkp + c * vkq); }
    }
  }
  return V;
}

export function aabb(P: Float32Array, q: Quaternion): Kutu {
  const e = new Matrix4().makeRotationFromQuaternion(q).elements, mn = [1e30, 1e30, 1e30], mxv = [-1e30, -1e30, -1e30];
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]!, y = P[i + 1]!, z = P[i + 2]!, X = e[0]! * x + e[4]! * y + e[8]! * z, Y = e[1]! * x + e[5]! * y + e[9]! * z, Z = e[2]! * x + e[6]! * y + e[10]! * z;
    if (X < mn[0]!) mn[0] = X; if (X > mxv[0]!) mxv[0] = X; if (Y < mn[1]!) mn[1] = Y; if (Y > mxv[1]!) mxv[1] = Y; if (Z < mn[2]!) mn[2] = Z; if (Z > mxv[2]!) mxv[2] = Z;
  }
  return { min: mn, max: mxv };
}

export function boxVol(P: Float32Array, q: Quaternion): number {
  const b = aabb(P, q);
  return (b.max[0]! - b.min[0]!) * (b.max[1]! - b.min[1]!) * (b.max[2]! - b.min[2]!);
}

// Temel bilesen yonu kutuyu kucultuyorsa onu dondurur; mesaj prototipteki metin.
export function minBox(P: Float32Array, qMevcut: Quaternion, fmtN: (x: number, d?: number) => string): { q: Quaternion; mesaj: string } {
  const n = P.length / 3;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += P[i * 3]!; my += P[i * 3 + 1]!; mz += P[i * 3 + 2]!; }
  mx /= n; my /= n; mz /= n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) { const d = [P[i * 3]! - mx, P[i * 3 + 1]! - my, P[i * 3 + 2]! - mz]; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r]![c] = C[r]![c]! + d[r]! * d[c]!; }
  const V = jacobi3(C), v = (r: number, c: number) => V[r]![c]!;
  const m = new Matrix4().set(v(0, 0), v(1, 0), v(2, 0), 0, v(0, 1), v(1, 1), v(2, 1), 0, v(0, 2), v(1, 2), v(2, 2), 0, 0, 0, 0, 1);
  if (m.determinant() < 0) { m.elements[2] = -m.elements[2]!; m.elements[6] = -m.elements[6]!; m.elements[10] = -m.elements[10]!; }
  const qp = new Quaternion().setFromRotationMatrix(m), qa = qMevcut.clone(), va = boxVol(P, qa), vp = boxVol(P, qp);
  const daha = vp < va * 0.995;
  return {
    q: daha ? qp : qa,
    mesaj: daha ? 'Minimum kutu yönü bulundu — hacim %' + fmtN((1 - vp / va) * 100, 1) + ' daha küçük.' : 'Mevcut yön zaten en küçük kutuyu veriyor.',
  };
}

export function maxRadius(P: Float32Array, q: Quaternion, ai: number, cu: number, cv: number): number {
  const e = new Matrix4().makeRotationFromQuaternion(q).elements, ui = (ai + 1) % 3, vi = (ai + 2) % 3;
  let r2 = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]!, y = P[i + 1]!, z = P[i + 2]!, c = [e[0]! * x + e[4]! * y + e[8]! * z, e[1]! * x + e[5]! * y + e[9]! * z, e[2]! * x + e[6]! * y + e[10]! * z];
    const du = c[ui]! - cu, dv = c[vi]! - cv, d = du * du + dv * dv;
    if (d > r2) r2 = d;
  }
  return Math.sqrt(r2);
}

export function roundUp(v: number, step: number): number { return step > 0 ? Math.ceil(v / step - 1e-9) * step : Math.round(v * 10) / 10; }
export function stdUp(v: number, list: number[]): number { for (const x of list) if (x >= v - 1e-9) return x; return roundUp(v, 10); }

/* Donme ekseni, kesitler, yuzey siniflari.
   Kesit: parca ai ekseni boyunca dilimlenir; dis halkanin alani / (pi*rmaks^2) >= 0,88 ise kesit dairesel sayilir.
   En cok dairesel kesit veren eksen donme eksenidir (kesitlerin yarisindan azi daireselse parca donel degildir). */
export function sAxisIdx(st: HamAyar, parca: HamParca | null): number {
  return st.axis === 'x' ? 0 : st.axis === 'y' ? 1 : st.axis === 'z' ? 2 : (parca && parca.autoAi != null ? parca.autoAi : 2);
}

export function sLocal(parca: HamParca, ai: number): Float64Array {
  const P = parca.P, n = P.length / 3, e = new Matrix4().makeRotationFromQuaternion(parca.q).elements, b = aabb(P, parca.q), ui = (ai + 1) % 3, vi = (ai + 2) % 3;
  const cu = (b.min[ui]! + b.max[ui]!) / 2, cv = (b.min[vi]! + b.max[vi]!) / 2, ca = (b.min[ai]! + b.max[ai]!) / 2, V = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3]!, y = P[i * 3 + 1]!, z = P[i * 3 + 2]!, w = [e[0]! * x + e[4]! * y + e[8]! * z, e[1]! * x + e[5]! * y + e[9]! * z, e[2]! * x + e[6]! * y + e[10]! * z];
    V[i * 3] = w[ui]! - cu; V[i * 3 + 1] = w[vi]! - cv; V[i * 3 + 2] = w[ai]! - ca;
  }
  return V;
}

export interface KesitProfili { ai: number; prof: { z: number; r: number; ri: number }[]; step: number; zmax: number; len: number; circ: number; thr: number }

interface ClipNokta { X: number; Y: number }

export function sAxisProf(parca: HamParca, ai: number, nSl: number, Vg?: Float64Array): KesitProfili {
  const V = Vg || sLocal(parca, ai), T = parca.I, nt = T.length / 3, tz0 = new Float64Array(nt), tz1 = new Float64Array(nt);
  let zmin = 1e9, zmax = -1e9;
  for (let t = 0; t < nt; t++) {
    const a = V[T[t * 3]! * 3 + 2]!, b = V[T[t * 3 + 1]! * 3 + 2]!, c = V[T[t * 3 + 2]! * 3 + 2]!;
    tz0[t] = Math.min(a, b, c); tz1[t] = Math.max(a, b, c);
    if (tz0[t]! < zmin) zmin = tz0[t]!; if (tz1[t]! > zmax) zmax = tz1[t]!;
  }
  const len = zmax - zmin, step = len / nSl, MM = { V, T, tz0, tz1 }, prof: KesitProfili['prof'] = [];
  let circ = 0, nn = 0;
  const CL = CLP.Clipper;
  for (let k = 0; k < nSl; k++) {
    const z = zmax - (k + 0.5) * step, sl = camSlice(MM, z) as ClipNokta[][];
    let ro = 0, ri = 0, aOut = 0;
    sl.forEach((p) => {
      const hole = !CL.Orientation(p), inside = CL.PointInPolygon({ X: 0, Y: 0 }, p) !== 0;
      let mn = 1e18, mx = 0;
      p.forEach((q) => { const d = Math.hypot(q.X, q.Y); if (d < mn) mn = d; if (d > mx) mx = d; });
      if (!hole) { ro = Math.max(ro, mx / CK); aOut += CL.Area(p) / (CK * CK); } else if (inside) ri = Math.max(ri, mn / CK);
    });
    if (ro > 0.5) { nn++; if (aOut / (Math.PI * ro * ro) > 0.88) circ++; }
    prof.push({ z, r: ro, ri });
  }
  // boydan boya delik: ic kesitlerin en az %85'inde eksendeki delik gorunmeli (capraz delik birkac kesiti boler)
  let thr = 0, nIn = 0, nHole = 0, rmin = 1e9;
  const m = prof.length;
  for (let j = 1; j < m - 1; j++) { nIn++; if (prof[j]!.ri > 0.3) { nHole++; rmin = Math.min(rmin, prof[j]!.ri); } }
  if (nIn > 2 && nHole >= nIn * 0.85 && prof[0]!.ri > 0.3 && prof[m - 1]!.ri > 0.3) thr = Math.min(rmin, prof[0]!.ri, prof[m - 1]!.ri);
  return { ai, prof, step, zmax, len, circ: nn ? circ / nn : 0, thr };
}

export function sAuto(parca: HamParca): void {
  const key = parca.name + '|' + parca.tris + '|' + parca.q.toArray().join(',');
  if (parca.axKey === key) return;
  parca.axKey = key; parca.geo = null;
  const b = aabb(parca.P, parca.q), L: number[] = [];
  let best = -1, bs = -1;
  for (let ai = 0; ai < 3; ai++) { const p = sAxisProf(parca, ai, 40); L.push(p.circ); const sc = p.circ + (b.max[ai]! - b.min[ai]!) * 1e-7; if (sc > bs) { bs = sc; best = ai; } }
  if (L[best]! < 0.5) { const d = [0, 1, 2].map((i) => b.max[i]! - b.min[i]!); best = d.indexOf(Math.max(d[0]!, d[1]!, d[2]!)); }
  parca.autoAi = best; parca.autoCirc = L[best]; parca.circs = L;
}

export interface Geometri {
  key: string; ai: number; auto: boolean; circ: number; rot: boolean; turnFrac: number; millFrac: number;
  cls: Uint8Array; thr: number; method: 'mill' | 'turn' | 'turnmill';
}

// Yuzey sinifi: donme eksenine gore teget bileseni olmayan ve kesit profilinin uzerinde kalan ucgen torna (1), oteki freze (2).
export function sGeoCalc(parca: HamParca, st: HamAyar): Geometri {
  const ai = sAxisIdx(st, parca), key = parca.axKey + '|' + ai;
  if (parca.geo && parca.geo.key === key) return parca.geo;
  const b = aabb(parca.P, parca.q), len = b.max[ai]! - b.min[ai]!, V = sLocal(parca, ai);
  const pf = sAxisProf(parca, ai, Math.max(60, Math.min(300, Math.round(len / 0.5))), V), pr = pf.prof, T = parca.I, nt = T.length / 3, cls = new Uint8Array(nt);
  let aT = 0, aM = 0;
  const circ = parca.circs ? parca.circs[ai]! : pf.circ;
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3]! * 3, bb = T[t * 3 + 1]! * 3, c = T[t * 3 + 2]! * 3;
    const ux = V[bb]! - V[a]!, uy = V[bb + 1]! - V[a + 1]!, uz = V[bb + 2]! - V[a + 2]!, vx = V[c]! - V[a]!, vy = V[c + 1]! - V[a + 1]!, vz = V[c + 2]! - V[a + 2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ln = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (ln < 1e-12) { cls[t] = 1; continue; }
    nx /= ln; ny /= ln; nz /= ln;
    const ar = ln / 2, cx = (V[a]! + V[bb]! + V[c]!) / 3, cy = (V[a + 1]! + V[bb + 1]! + V[c + 1]!) / 3, cz = (V[a + 2]! + V[bb + 2]! + V[c + 2]!) / 3, r = Math.hypot(cx, cy);
    let turn: boolean;
    if (Math.abs(nz) > 0.985) turn = true;
    else if (r > 0.3 && Math.abs((-cy * nx + cx * ny) / r) > 0.12) turn = false;
    else {
      const k = Math.min(pr.length - 1, Math.max(0, Math.floor((pf.zmax - cz) / pf.step))), k0 = Math.max(0, k - 1), k1 = Math.min(pr.length - 1, k + 1);
      const p0 = pr[k0]!, pk = pr[k]!, p1 = pr[k1]!;
      const ro = Math.max(p0.r, pk.r, p1.r), rl = Math.min(p0.r, pk.r, p1.r), ri = Math.max(p0.ri, pk.ri, p1.ri), tol = Math.max(0.2, 0.02 * ro);
      turn = (r <= ro + tol && r >= rl - tol) || (ri > 0 && Math.abs(r - ri) < tol);
    }
    cls[t] = turn ? 1 : 2;
    if (turn) aT += ar; else aM += ar;
  }
  const tot = aT + aM || 1, rot = circ >= 0.5 && aT / tot >= 0.5;
  if (!rot) cls.fill(2);
  const mf = rot ? aM / tot : 1;
  return { key, ai, auto: st.axis === 'auto', circ, rot, turnFrac: rot ? aT / tot : 0, millFrac: mf, cls, thr: pf.thr, method: !rot ? 'mill' : mf >= 0.015 ? 'turnmill' : 'turn' };
}

export interface HamSonuc {
  ok: true; dim: number[]; ctr: number[]; type: 'block' | 'bar'; tube: boolean;
  D?: number; L?: number; R?: number; ai?: number; partLen?: number; partD?: number; ID?: number;
  idAuto?: number; thr?: number; idMan?: boolean; idBad?: boolean; S?: number[];
  Vs: number; label: string; rho: number; Vp: number; ms: number; mp: number; mc: number; ratio: number; qty: number; price: number;
}

export interface HamGirdi { st: HamAyar; parca: HamParca | null; rho: number; fmtN: (x: number, d?: number) => string }

export function sStockRes(g: HamGirdi, type: HamTipi, box: Kutu, have: boolean, partVol: number, ai: number): HamSonuc {
  const { st, fmtN } = g;
  const dim = [box.max[0]! - box.min[0]!, box.max[1]! - box.min[1]!, box.max[2]! - box.min[2]!], ctr = [(box.max[0]! + box.min[0]!) / 2, (box.max[1]! + box.min[1]!) / 2, (box.max[2]! + box.min[2]!) / 2];
  const res = { ok: true, dim, ctr, type: type === 'tube' ? 'bar' : type, tube: type === 'tube', Vs: 0, label: '' } as HamSonuc;
  if (type !== 'block') {
    const ui = (ai + 1) % 3, vi = (ai + 2) % 3, R = have && g.parca ? maxRadius(g.parca.P, g.parca.q, ai, ctr[ui]!, ctr[vi]!) : Math.max(dim[ui]!, dim[vi]!) / 2;
    const dRaw = 2 * R + 2 * num(st.dAllow, 0), D0 = st.barStd ? stdUp(dRaw, BAR_STD) : roundUp(dRaw, num(st.round, 0));
    const Lraw = dim[ai]! + 2 * num(st.face, 0) + num(st.cut, 0), L0 = roundUp(Lraw, num(st.round, 0) || 1);
    res.D = D0; res.L = L0; res.R = R; res.ai = ai; res.partLen = dim[ai]; res.partD = 2 * R; res.ID = 0;
    res.Vs = Math.PI * D0 * D0 / 4 * L0; res.label = 'Ø' + fmtN(D0, D0 % 1 ? 1 : 0) + ' × ' + fmtN(L0, L0 % 1 ? 1 : 0) + ' mm';
    if (type === 'tube') {
      // ic cap: parcanin boydan boya deliginden isleme payi dusulur, adima asagi yuvarlanir
      const ia = st.idAllow === '' || st.idAllow == null ? num(st.dAllow, 0) : num(st.idAllow, 0), stp = num(st.idStep, 1) > 0 ? num(st.idStep, 1) : 1, thr = have && g.parca && g.parca.geo ? g.parca.geo.thr : 0;
      const idA = thr > 0 ? Math.floor((2 * thr - 2 * ia + 0.05) / stp) * stp : 0, idM = num(st.idMan, 0);
      let ID = idM > 0 ? idM : idA;
      if (!(ID > 0) || ID >= D0 - 2) ID = 0;
      res.ID = ID; res.idAuto = idA; res.thr = thr; res.idMan = idM > 0; res.idBad = thr > 0 && ID > 2 * thr - 0.01;
      res.Vs = Math.PI * (D0 * D0 - ID * ID) / 4 * L0;
      if (ID > 0) res.label = 'Ø' + fmtN(D0, D0 % 1 ? 1 : 0) + ' × Ø' + fmtN(ID, ID % 1 ? 1 : 0) + ' × ' + fmtN(L0, L0 % 1 ? 1 : 0) + ' mm';
    }
  } else {
    const a = st.uni ? [num(st.ax, 0), num(st.ax, 0), num(st.ax, 0)] : [num(st.ax, 0), num(st.ay, 0), num(st.az, 0)], step = num(st.round, 0);
    const sd = dim.map((d, i) => roundUp(d + 2 * a[i]!, step));
    if (st.plate) sd[2] = stdUp(dim[2]! + 2 * a[2]!, PLATE_STD);
    res.S = sd; res.Vs = sd[0]! * sd[1]! * sd[2]!;
    res.label = sd.map((v) => fmtN(v, v % 1 ? 1 : 0)).join(' × ') + ' mm';
  }
  const rho = g.rho;
  res.rho = rho; res.Vp = partVol;
  res.ms = res.Vs / 1000 * rho / 1000; res.mp = partVol / 1000 * rho / 1000; res.mc = Math.max(0, res.ms - res.mp); res.ratio = res.ms > 0 ? res.mc / res.ms : 0;
  res.qty = Math.max(1, Math.round(num(st.qty, 1))); res.price = num(st.price, 0);
  return res;
}

export interface HamHesap { res: HamSonuc | null; alt: { bar: HamSonuc; block: HamSonuc } | null; geo: Geometri | null }

// sCompute: modelden ya da elle girilen zarf olcusunden hammadde; ayrica obur tipin sonucu (alt).
export function sCompute(g: HamGirdi, partVolModel: number): HamHesap {
  const st = g.st, have = !!g.parca;
  let box: Kutu, partVol = 0, geo: Geometri | null = null;
  if (have && g.parca) { box = aabb(g.parca.P, g.parca.q); partVol = partVolModel; sAuto(g.parca); geo = g.parca.geo = sGeoCalc(g.parca, st); }
  else {
    const mx = num(st.mx, 0), my = num(st.my, 0), mz = num(st.mz, 0);
    if (!(mx > 0 && my > 0 && mz > 0)) return { res: null, alt: null, geo: null };
    box = { min: [-mx / 2, -my / 2, -mz / 2], max: [mx / 2, my / 2, mz / 2] }; partVol = num(st.mvol, 0) * 1000;
  }
  const ai = sAxisIdx(st, g.parca), type: HamTipi = st.type === 'tube' || st.type === 'bar' ? st.type : 'block';
  const res = sStockRes(g, type, box, have, partVol, ai);
  const alt = { bar: type === 'block' ? sStockRes(g, 'bar', box, have, partVol, ai) : res, block: type === 'block' ? res : sStockRes(g, 'block', box, have, partVol, ai) };
  return { res, alt, geo };
}

export function hamTipiAdi(r: HamSonuc): string { return r.tube ? 'Boru' : r.type === 'bar' ? 'Yuvarlak çubuk' : 'Blok / plaka'; }

// Hammadde CSV satirlari (noktali virgul ayrac, BOM ile; prototipin bicimi).
export function hamCsv(r: HamSonuc, ad: string, malzeme: string, fmt: (x: number) => string): string {
  const rows: (string | number)[][] = [['Parça / dosya', ad || 'Elle'], ['Malzeme', malzeme], ['Yoğunluk (g/cm³)', fmt(r.rho)], ['Hammadde tipi', r.tube ? 'Boru' + ((r.ID || 0) > 0 ? ' (iç Ø' + fmt(r.ID!) + ')' : '') : r.type === 'bar' ? 'Yuvarlak çubuk' : 'Blok'], ['Hammadde ölçüsü', r.label], ['Parça zarf ölçüsü (mm)', r.dim.map((v) => fmt(+v.toFixed(2))).join(' x ')],
    ['Hammadde hacmi (cm³)', fmt(+(r.Vs / 1000).toFixed(2))], ['Parça hacmi (cm³)', fmt(+(r.Vp / 1000).toFixed(3))], ['Hammadde ağırlığı (kg)', fmt(+r.ms.toFixed(3))], ['Parça ağırlığı (kg)', fmt(+r.mp.toFixed(3))], ['Talaş ağırlığı (kg)', fmt(+r.mc.toFixed(3))], ['Talaş oranı (%)', fmt(+(r.ratio * 100).toFixed(1))], ['Adet', r.qty], ['Toplam hammadde (kg)', fmt(+(r.ms * r.qty).toFixed(2))]];
  if (r.price) rows.push(['Hammadde maliyeti (TL/adet)', fmt(+(r.ms * r.price).toFixed(2))]);
  return '﻿' + rows.map((x) => x.join(';')).join('\r\n');
}

export function hamCsvAdi(ad: string): string { return 'Hammadde_' + (ad || 'parca').replace(/[^\w-]+/g, '_') + '.csv'; }
