// G-kod sahnesinin tampon verileri: takim yolu cizgileri, talas yuzeyi agi ve renkleri, yan duvar halkasi.
// three nesnesi kurmaz; sahne dosyasi bu dizileri BufferGeometry'ye verir.
import type { Program, TakimNo } from './tipler.ts';
import { hucreSinifi, type Karsilastirma, type YukseklikHaritasi } from './talas.ts';

export interface YolTamponu {
  hizli: Float32Array; kesme: Float32Array; kesmeRengi: Float32Array;
  // Hareket k bitince cizilecek kose sayisi (setDrawRange icin).
  rEnd: Uint32Array; cEnd: Uint32Array;
}

export type Rgb = [number, number, number];

export function yolTamponu(p: Program, renk: (T: TakimNo) => Rgb): YolTamponu {
  const M = p.moves.length;
  let rN = 0, cN = 0;
  for (const mv of p.moves) { const n = mv.pts ? mv.pts.length / 3 : 1; if (mv.t) cN += n * 2; else rN += n * 2; }
  const rp = new Float32Array(rN * 3), cp = new Float32Array(cN * 3), cc = new Float32Array(cN * 3), rEnd = new Uint32Array(M), cEnd = new Uint32Array(M);
  let ri = 0, ci = 0;
  for (let k = 0; k < M; k++) {
    const mv = p.moves[k]!, pts = mv.pts || mv.b, c = mv.t ? renk(mv.T) : null;
    let px = mv.a[0]!, py = mv.a[1]!, pz = mv.a[2]!;
    for (let j = 0; j < pts.length; j += 3) {
      const x = pts[j]!, y = pts[j + 1]!, z = pts[j + 2]!;
      if (c) { cp.set([px, py, pz, x, y, z], ci * 3); cc.set([c[0], c[1], c[2], c[0], c[1], c[2]], ci * 3); ci += 2; }
      else { rp.set([px, py, pz, x, y, z], ri * 3); ri += 2; }
      px = x; py = y; pz = z;
    }
    rEnd[k] = ri; cEnd[k] = ci;
  }
  return { hizli: rp, kesme: cp, kesmeRengi: cc, rEnd, cEnd };
}

export interface HaritaAgi { konum: Float32Array; renk: Float32Array; indis: Uint32Array; halka: number[]; duvar: Float32Array; duvarIndis: number[] }

// Izgara agi ve cevre halkasi (yan duvar ust kenari haritanin yuksekligini izler).
export function haritaAgi(hm: YukseklikHaritasi): HaritaAgi {
  const { NX, NY, sb } = hm, konum = new Float32Array(NX * NY * 3), renk = new Float32Array(NX * NY * 3), indis = new Uint32Array((NX - 1) * (NY - 1) * 6);
  let q = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const v = j * NX + i; konum[v * 3] = sb.x0 + i * hm.cx; konum[v * 3 + 1] = sb.y0 + j * hm.cy; konum[v * 3 + 2] = sb.z1; }
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    indis[q++] = a; indis[q++] = b; indis[q++] = d; indis[q++] = a; indis[q++] = d; indis[q++] = c;
  }
  const halka: number[] = [];
  for (let i = 0; i < NX; i++) halka.push(i);
  for (let j = 1; j < NY; j++) halka.push(j * NX + NX - 1);
  for (let i = NX - 2; i >= 0; i--) halka.push((NY - 1) * NX + i);
  for (let j = NY - 2; j > 0; j--) halka.push(j * NX);
  const R2 = halka.length, duvar = new Float32Array(R2 * 6), duvarIndis: number[] = [];
  for (let r = 0; r < R2; r++) {
    const vv = halka[r]!, x = konum[vv * 3]!, y = konum[vv * 3 + 1]!;
    duvar.set([x, y, sb.z1, x, y, sb.z0], r * 6);
    const n0 = r * 2, n1 = ((r + 1) % R2) * 2;
    duvarIndis.push(n0, n1, n0 + 1, n1, n1 + 1, n0 + 1);
  }
  return { konum, renk, indis, halka, duvar, duvarIndis };
}

// Talas yuzeyi renkleri; sahne rengi tasarim degiskeninden gelir (T1).
export interface TalasRenkleri { ust: Rgb; derin: Rgb; orta: Rgb; tamam: Rgb; fazla: Rgb; dalma: Rgb; disari: Rgb; mor: Rgb }

const karis = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const kis = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// Yukseklikleri ve renkleri aga yazar (gHMUpload); karsilastirma acik ve parca varsa istatistik doner.
export function haritaYukle(hm: YukseklikHaritasi, ag: HaritaAgi, karsilastirmaAcik: boolean, R: TalasRenkleri): Karsilastirma | null {
  const H = hm.H, z1 = hm.sb.z1, z0 = hm.sb.z0, dz = Math.max(1e-6, z1 - z0), cmp = karsilastirmaAcik && !!hm.PT;
  const st: Karsilastirma | null = cmp ? { gouge: 0, gmax: 0, left: 0, lmax: 0, ok: 0, cells: 0 } : null;
  for (let v = 0; v < H.length; v++) {
    const h = H[v]!;
    ag.konum[v * 3 + 2] = h;
    let c: Rgb;
    if (st) {
      const s = hucreSinifi(hm, v);
      if (s.tur === 'disari') { const d2 = (z1 - h) / dz; c = karis(R.disari, R.derin, Math.min(1, d2 * 1.5) * 0.5); }
      else {
        st.cells++;
        if (s.tur === 'dalma') { c = R.dalma; st.gouge++; st.gmax = Math.max(st.gmax, s.fark); }
        else if (s.tur === 'fazla') { c = karis(R.tamam, R.fazla, kis(s.fark / 2, 0.35, 1)); st.left++; st.lmax = Math.max(st.lmax, s.fark); }
        else { c = R.tamam; st.ok++; }
      }
    } else {
      const dep = (z1 - h) / dz;
      if (dep < 0.002) c = R.ust;
      else if (dep < 0.5) c = karis(karis(R.orta, R.derin, dep * 2), R.ust, 0.15);
      else c = karis(R.derin, R.mor, (dep - 0.5) * 2);
    }
    ag.renk[v * 3] = c[0]; ag.renk[v * 3 + 1] = c[1]; ag.renk[v * 3 + 2] = c[2];
  }
  for (let r = 0; r < ag.halka.length; r++) ag.duvar[r * 6 + 2] = H[ag.halka[r]!]!;
  hm.cmp = st; hm.dirty = false;
  return st;
}
