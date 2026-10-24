// Talas kaldirma: ham kutunun ustten yukseklik haritasi, takim izinin damgalanmasi, bitmis parcayla karsilastirma.
// Prototipin HM blogunun veri kismi; geometri ve renk yuklemesi sahne dosyasinda.
import { Matrix4, type Quaternion } from 'three';
import type { HamKutu, Hareket, TakimBilgisi } from './tipler.ts';

export interface DonelHam { mode: 'R' | 'A'; c: [number, number]; prof: [number, number][] }

export interface Carpma { ln: number; z: number }
export interface Karsilastirma { gouge: number; gmax: number; left: number; lmax: number; ok: number; cells: number }

export interface YukseklikHaritasi {
  sb: HamKutu; NX: number; NY: number; cx: number; cy: number; H: Float32Array; init?: Float32Array;
  done: number; dirty: boolean; last: number; coll: Carpma[]; cmp: Karsilastirma | null;
  PT?: Float32Array | null; PTmin?: Float32Array; PTmax?: Float32Array;
}

// Kutunun uzun kenarinda 240 hucre (prototipteki cozunurluk).
export function haritaKur(sb: HamKutu, donel: DonelHam | null): YukseklikHaritasi {
  const sx = sb.x1 - sb.x0, sy = sb.y1 - sb.y0, cell = Math.max(sx, sy) / 240;
  const NX = Math.max(2, Math.round(sx / cell) + 1), NY = Math.max(2, Math.round(sy / cell) + 1);
  const hm: YukseklikHaritasi = { sb, NX, NY, cx: sx / (NX - 1), cy: sy / (NY - 1), H: new Float32Array(NX * NY), done: 0, dirty: true, last: 0, coll: [], cmp: null };
  hm.H.fill(sb.z1);
  if (donel) { hm.init = gDonelInit(donel, hm); hm.H.set(hm.init); }
  return hm;
}

// Programdaki (HAM DONEL R|A ...) aciklamasindan baslangic yuzeyi: R yatay eksenli, A dikey eksenli donel ham.
export function gDonelInit(ds: DonelHam, hm: Pick<YukseklikHaritasi, 'sb' | 'NX' | 'NY' | 'cx' | 'cy'>): Float32Array {
  const sb = hm.sb, P = ds.prof, out = new Float32Array(hm.NX * hm.NY);
  function rAt(d: number): number {
    if (!P.length || d < P[0]![0] - 1e-6 || d > P[P.length - 1]![0] + 1e-6) return 0;
    for (let k = 0; k + 1 < P.length; k++) if (d <= P[k + 1]![0]) { const t = (d - P[k]![0]) / Math.max(1e-9, P[k + 1]![0] - P[k]![0]); return P[k]![1] + (P[k + 1]![1] - P[k]![1]) * t; }
    return P[P.length - 1]![1];
  }
  for (let j = 0; j < hm.NY; j++) for (let i = 0; i < hm.NX; i++) {
    const x = sb.x0 + i * hm.cx, y = sb.y0 + j * hm.cy;
    let h = sb.z0;
    if (ds.mode === 'R') { const r = rAt(x), dy = y - ds.c[0]; if (r > Math.abs(dy)) h = Math.min(sb.z1, ds.c[1] + Math.sqrt(r * r - dy * dy)); }
    else { const rho = Math.hypot(x - ds.c[0], y - ds.c[1]); for (const q of P) if (q[1] >= rho) { h = Math.max(sb.z0, -q[0]); break; } }
    out[j * hm.NX + i] = h;
  }
  return out;
}

export function haritaSifirla(hm: YukseklikHaritasi): void {
  hm.H.fill(hm.sb.z1);
  if (hm.init) hm.H.set(hm.init);
  hm.done = 0; hm.coll = []; hm.dirty = true;
}

// Bitmis parcanin ustten izdusumu (PT) ve komsuluk icin alt/ust sinirlari (dalma ve kalan malzeme toleransi).
export function rasterPart(hm: YukseklikHaritasi, P: Float32Array, I: Uint32Array, q: Quaternion, sh: number[]): void {
  const e = new Matrix4().makeRotationFromQuaternion(q).elements, n = P.length / 3, T = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!;
    T[v * 3] = e[0]! * x + e[4]! * y + e[8]! * z + sh[0]!; T[v * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + sh[1]!; T[v * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + sh[2]!;
  }
  const NX = hm.NX, NY = hm.NY, sb = hm.sb, cx = hm.cx, cy = hm.cy, PT = new Float32Array(NX * NY).fill(-1e9);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3, ax = T[a]!, ay = T[a + 1]!, az = T[a + 2]!, bx = T[b]!, by = T[b + 1]!, bz = T[b + 2]!, qx = T[c]!, qy = T[c + 1]!, qz = T[c + 2]!;
    const den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy);
    if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, qx) - sb.x0) / cx)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, qx) - sb.x0) / cx));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, qy) - sb.y0) / cy)), j1 = Math.min(NY - 1, Math.floor((Math.max(ay, by, qy) - sb.y0) / cy));
    for (let j = j0; j <= j1; j++) {
      const py = sb.y0 + j * cy;
      for (let i = i0; i <= i1; i++) {
        const px = sb.x0 + i * cx, w1 = ((by - qy) * (px - qx) + (qx - bx) * (py - qy)) / den, w2 = ((qy - ay) * (px - qx) + (ax - qx) * (py - qy)) / den, w3 = 1 - w1 - w2;
        if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
        const zz = w1 * az + w2 * bz + w3 * qz, k = j * NX + i;
        if (zz > PT[k]!) PT[k] = zz;
      }
    }
  }
  const mn = new Float32Array(NX * NY), mx = new Float32Array(NX * NY), rh = Math.max(1, Math.round(1 / Math.min(cx, cy)));
  let any = false;
  for (let jj = 0; jj < NY; jj++) for (let ii = 0; ii < NX; ii++) {
    let lo = 1e9, hi = -1e9;
    for (let dj = -rh; dj <= rh; dj++) for (let di = -rh; di <= rh; di++) {
      const j2 = jj + dj, i2 = ii + di;
      if (j2 < 0 || i2 < 0 || j2 >= NY || i2 >= NX) continue;
      const vv = PT[j2 * NX + i2]!;
      if (vv > hi) hi = vv;
      if (Math.abs(dj) <= 1 && Math.abs(di) <= 1 && vv < lo) lo = vv;
    }
    mn[jj * NX + ii] = lo; mx[jj * NX + ii] = hi;
    if (PT[jj * NX + ii]! > -1e8) any = true;
  }
  hm.PT = any ? PT : null; hm.PTmin = mn; hm.PTmax = mx;
}

// Kesici sekli: duz, kuresel (ball) ya da koni (cone = tan katsayisi); hizli harekette yalniz temas kaydi.
export function stampSeg(hm: YukseklikHaritasi, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ti: TakimBilgisi, rapidCheck: boolean, ln: number): void {
  const r = (ti.cutD || ti.d) / 2, H = hm.H, NX = hm.NX, NY = hm.NY, sb = hm.sb, cx = hm.cx, cy = hm.cy;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), step = Math.min(cx, cy) * 0.6, n = Math.max(1, Math.ceil(len / step));
  const ri = Math.ceil(r / cx) + 1, rj = Math.ceil(r / cy) + 1, r2 = r * r;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
    if (z >= sb.z1 || x < sb.x0 - r || x > sb.x1 + r || y < sb.y0 - r || y > sb.y1 + r) continue;
    const ic = Math.round((x - sb.x0) / cx), jc = Math.round((y - sb.y0) / cy);
    for (let j = Math.max(0, jc - rj); j <= Math.min(NY - 1, jc + rj); j++) {
      const dy = sb.y0 + j * cy - y, dy2 = dy * dy;
      if (dy2 > r2) continue;
      for (let i = Math.max(0, ic - ri); i <= Math.min(NX - 1, ic + ri); i++) {
        const dx = sb.x0 + i * cx - x, d2 = dx * dx + dy2;
        if (d2 > r2) continue;
        const bz = ti.ball ? z + r - Math.sqrt(r2 - d2) : ti.cone ? z + Math.sqrt(d2) * ti.cone : z, k = j * NX + i;
        if (bz < H[k]! - 0.01) {
          if (rapidCheck) {
            const son = hm.coll[hm.coll.length - 1];
            if (hm.coll.length < 50 && (!son || son.ln !== ln)) hm.coll.push({ ln, z });
            return;
          }
          H[k] = bz; hm.dirty = true;
        }
      }
    }
  }
}

// upto: hareketin o ana kadar kesilen kesri (0-1); verilmezse hareketin tamami.
export function stampMove(hm: YukseklikHaritasi, mv: Hareket, ti: TakimBilgisi, upto?: number): void {
  const pts = mv.pts || mv.b, n = pts.length / 3, lim = upto == null ? n : upto * n;
  let px = mv.a[0]!, py = mv.a[1]!, pz = mv.a[2]!;
  for (let j = 0; j < n; j++) {
    let nx = pts[j * 3]!, ny = pts[j * 3 + 1]!, nz = pts[j * 3 + 2]!;
    if (j + 1 > lim) {
      const f = lim - j;
      if (f <= 0) break;
      nx = px + (nx - px) * f; ny = py + (ny - py) * f; nz = pz + (nz - pz) * f;
      stampSeg(hm, px, py, pz, nx, ny, nz, ti, mv.t === 0, mv.ln);
      break;
    }
    stampSeg(hm, px, py, pz, nx, ny, nz, ti, mv.t === 0, mv.ln);
    px = nx; py = ny; pz = nz;
  }
}

export type HucreRengi = 'dalma' | 'fazla' | 'tamam' | 'disari' | 'yuzey';

// Karsilastirma: parca altina inen hucre dalma, 0,2 mm'den fazla kalan hucre fazla malzeme.
export function hucreSinifi(hm: YukseklikHaritasi, v: number): { tur: HucreRengi; fark: number } {
  const PT = hm.PT, H = hm.H[v]!;
  if (!PT || !(PT[v]! > -1e8)) return { tur: 'disari', fark: 0 };
  const lo = hm.PTmin![v]!, hi = hm.PTmax![v]!;
  if (lo > -1e8 && H < lo - 0.05) return { tur: 'dalma', fark: lo - H };
  if (H > hi + 0.2) return { tur: 'fazla', fark: H - hi };
  return { tur: 'tamam', fark: 0 };
}

export function karsilastir(hm: YukseklikHaritasi): Karsilastirma {
  const st: Karsilastirma = { gouge: 0, gmax: 0, left: 0, lmax: 0, ok: 0, cells: 0 };
  for (let v = 0; v < hm.H.length; v++) {
    const s = hucreSinifi(hm, v);
    if (s.tur === 'disari') continue;
    st.cells++;
    if (s.tur === 'dalma') { st.gouge++; st.gmax = Math.max(st.gmax, s.fark); }
    else if (s.tur === 'fazla') { st.left++; st.lmax = Math.max(st.lmax, s.fark); }
    else st.ok++;
  }
  return st;
}
