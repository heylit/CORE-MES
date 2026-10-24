import * as THREE from 'three';
import { save, state } from '../depo.ts';
import { clamp, num } from '../bicim.ts';
import { dirtyUsage, invKey, machine, material, toolById, tools } from '../secici.ts';
import { tStation, type GHareket, type GProgram, type GTakim } from '../hesap/gkod.ts';
import { PS, denemeBitti, prPerTool, prProg, prStk, prTs } from '../hesap/hazirlik.ts';
import { cycleOf, lifeCard, wearRec } from '../hesap/omur.ts';
import type { Kalem } from '../veri/tipler.ts';
import { renk } from './renk.ts';
import { prLayout, type Yerlesim } from './yerlesim.ts';

// Eksik ham ölçüsü prototipte undefined okur ve NaN üretir; aynı sonuç.
const olc = (v: number | undefined): number => v ?? Number.NaN;

// Deneme: takım ham parçayı gerçekten keser (yükseklik haritası), talaş saçılır, takım aşınır (prototip 21590-21793).

const TAU = Math.PI * 2;
export const PRT_SPEEDS = [1, 5, 20, 60, 200, 600];

interface Harita { NX: number; NY: number; cx: number; cy: number; H: Float32Array; dirty: boolean; last: number; geo: THREE.BufferGeometry; ring: number[]; wall: THREE.BufferGeometry }
interface HaritaSiniri { x0: number; y0: number; z1: number; z0: number; x1: number; y1: number; ox: number; oz: number; top: number; k: number }
interface Talas { pts: THREE.Points; pos: Float32Array; vel: Float32Array; life: Float32Array; n: number; i: number }
export interface DenemeOlayi { t: string; c: string; p: number }

export const PRT = {
  on: false, playing: false, speed: 20, k: 0, frac: 0, part: 0, target: 10,
  wear: {} as Record<string, number>, w0: {} as Record<string, number>, TR: {} as Record<string, number | null>, spare: {} as Record<string, number>,
  spK: {} as Record<string, boolean>, chg: {} as Record<string, number>, over: {} as Record<string, number>, cutT: {} as Record<string, number>,
  log: [] as DenemeOlayi[], removed: 0, hm: null as Harita | null, map: null as HaritaSiniri | null, grp: new THREE.Group(), curT: null as GTakim | null,
  tip: new THREE.Vector3(), done: false, fromCur: true, spinOn: false, liveT: 0, err: null as string | null, p: null as GProgram | null,
  L: null as Yerlesim | null, chgEv: [] as { T: number; part: number }[], chips: null as Talas | null,
};

// Talaş bulutu sahneye bir kez eklenir; renk ilk kurulumda okunur.
export function talasBulutu(): THREE.Points {
  if (PRT.chips) return PRT.chips.pts;
  const N = 700, pos = new Float32Array(N * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: new THREE.Color(renk('talas')), size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.95 }); m.userData['keep'] = true;
  PRT.chips = { pts: new THREE.Points(g, m), pos, vel: new Float32Array(N * 3), life: new Float32Array(N), n: N, i: 0 };
  PRT.chips.pts.frustumCulled = false; for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
  return PRT.chips.pts;
}

const bildir = (): void => { denemeBitti(!!(PRT.part && PRT.done)); };

// Adlı takım (Heidenhain) cep numarası değildir; prototipteki gibi boş cep sayılır.
export function prtTool(T: GTakim): Kalem | null { const id = tools()[Number(T) - 1]; return id && id !== 'empty' ? toolById(id) : null; }
function prtTI(t: Kalem | null): { r: number; ball: boolean; cone: number } | null {
  if (!t) return null; const o = { r: (t.d ?? 10) / 2, ball: false, cone: 0 };
  if (t.kind === 'ball' || t.kind === 'taperball' || t.kind === 'lollipop') o.ball = true;
  if (t.kind === 'spot' || t.kind === 'chamfer' || t.kind === 'csink') o.cone = 1; else if (t.kind === 'drill' || t.kind === 'stepdrill' || t.kind === 'idrill') o.cone = 0.6009; else if (t.kind === 'center' || t.kind === 'engrave') o.cone = 1.732;
  if (t.kind === 'tap') o.r = ((t.d ?? 0) - 1.0825 * (t.cut?.pitch ?? 1.5)) / 2;
  return o;
}

// Deneme adımına girilince başlar, çıkılınca durur (prototip prtSync 21610-21614). Dönüş: sahne yeniden kurulmalı mı.
export function prtSync(on: boolean): boolean {
  if (on && !PRT.on) { PRT.on = true; prtInit(); return true; }
  if (!on && PRT.on) { PRT.on = false; PRT.playing = false; prtClearHM(); return true; }
  return false;
}
function prtClearHM(): void {
  while (PRT.grp.children.length) { const c = PRT.grp.children[0] as THREE.Mesh | undefined; if (!c) break; PRT.grp.remove(c); c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
  PRT.hm = null;
}
export function prtInit(): void {
  // Hazırlık programı testte sahte konabilsin diye dar tiplidir; gerçeği gParse sonucudur.
  const p = prProg() as unknown as GProgram | null, m = machine(); PRT.err = null; PRT.playing = false; prtClearHM();
  if (!p || p.err || !p.moves.length) { PRT.err = 'Önce bir program seçin (adım 2) — deneme programdaki yolu keser.'; PRT.p = null; bildir(); return; }
  PRT.p = p; PRT.k = 0; PRT.frac = 0; PRT.part = 0; PRT.target = Math.max(1, Math.round(num(PS().qty, 1))); PRT.log = []; PRT.done = false; PRT.removed = 0; PRT.curT = null; PRT.chgEv = [];
  PRT.wear = {}; PRT.w0 = {}; PRT.TR = {}; PRT.spare = {}; PRT.spK = {}; PRT.chg = {}; PRT.over = {}; PRT.cutT = {};
  prTs().forEach((T) => {
    const t = prtTool(T); if (!t) return; let c = null;
    try { c = lifeCard(m, T - 1, t, material(), tools(), cycleOf(m, tools())); } catch { /* ömür modeli bu takımı tanımıyorsa takip yok */ }
    PRT.TR[T] = c?.TR ?? null; PRT.wear[T] = PRT.fromCur && c?.w ? c.w.used : 0; PRT.w0[T] = PRT.wear[T] ?? 0;
    PRT.spK[T] = !!(c && c.spare != null); PRT.spare[T] = c?.spare ?? 0; PRT.chg[T] = 0; PRT.cutT[T] = 0;
  });
  PRT.L = prLayout(); if (!PRT.L.lathe) prtBuildHM();
  const m0 = p.moves[0]; PRT.curT = m0 ? tStation(m0.T, m, p.heid) : null; prtTipAt(); bildir();
}
function prtMap(): HaritaSiniri {
  const L = PRT.L as Yerlesim, p = PRT.p as GProgram, s = prStk(), b = p.blk;
  const x0 = b ? Math.min(b.min.x, b.max.x) : 0, y0 = b ? Math.min(b.min.y, b.max.y) : 0, z1 = b ? Math.max(b.min.z, b.max.z) : 0;
  return { x0, y0, z1, z0: z1 - olc(s.z), x1: x0 + olc(s.x), y1: y0 + olc(s.y), ox: (L.offs[0] ?? 0) - L.sx / 2, oz: L.sz / 2, top: L.stockTop, k: L.k };
}
const prtC0 = new THREE.Color(), prtC1 = new THREE.Color(), prtC2 = new THREE.Color(), prtTmp = new THREE.Color();
function prtBuildHM(): void {
  const M = PRT.map = prtMap(), sx = M.x1 - M.x0, sy = M.y1 - M.y0, cell = Math.max(sx, sy) / 170, NX = Math.max(2, Math.round(sx / cell) + 1), NY = Math.max(2, Math.round(sy / cell) + 1);
  prtC0.set(renk(`ham-${material().iso}` as 'ham') || renk('ham')); prtC1.set(renk('kesik-ust')); prtC2.set(renk('kesik-alt'));
  const pos = new Float32Array(NX * NY * 3), col = new Float32Array(NX * NY * 3), idx = new Uint32Array((NX - 1) * (NY - 1) * 6);
  let q = 0;
  const cxs = sx / (NX - 1), cys = sy / (NY - 1);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const v = j * NX + i; pos[v * 3] = M.ox + i * cxs * M.k; pos[v * 3 + 1] = M.top; pos[v * 3 + 2] = M.oz - j * cys * M.k; }
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b2 = a + 1, c = a + NX, d = c + 1; idx[q++] = a; idx[q++] = d; idx[q++] = b2; idx[q++] = a; idx[q++] = c; idx[q++] = d; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  PRT.grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })));
  const ring: number[] = [], wi: number[] = [];
  for (let i = 0; i < NX; i++) ring.push(i); for (let j = 1; j < NY; j++) ring.push(j * NX + NX - 1); for (let i = NX - 2; i >= 0; i--) ring.push((NY - 1) * NX + i); for (let j = NY - 2; j > 0; j--) ring.push(j * NX);
  const R2 = ring.length, wp = new Float32Array(R2 * 6), bot = M.top - (M.z1 - M.z0) * M.k;
  for (let r = 0; r < R2; r++) { const vv = ring[r] ?? 0; wp.set([pos[vv * 3] ?? 0, M.top, pos[vv * 3 + 2] ?? 0, pos[vv * 3] ?? 0, bot, pos[vv * 3 + 2] ?? 0], r * 6); const n0 = r * 2, n1 = ((r + 1) % R2) * 2; wi.push(n0, n1, n0 + 1, n1, n1 + 1, n0 + 1); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
  PRT.hm = { NX, NY, cx: cxs, cy: cys, H: new Float32Array(NX * NY).fill(M.z1), dirty: true, last: 0, geo: g, ring, wall: wg };
  PRT.grp.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: prtC0.clone(), metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })));
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(sx * M.k, sy * M.k), new THREE.MeshStandardMaterial({ color: new THREE.Color(renk('ham-alt')), side: THREE.DoubleSide }));
  bm.rotation.x = -Math.PI / 2; bm.position.set(M.ox + sx * M.k / 2, bot, M.oz - sy * M.k / 2); PRT.grp.add(bm);
  prtUpload();
}
function prtUpload(): void {
  const hm = PRT.hm, M = PRT.map; if (!hm || !M) return;
  const posA = hm.geo.attributes['position'] as THREE.BufferAttribute, colA = hm.geo.attributes['color'] as THREE.BufferAttribute;
  const pos = posA.array as Float32Array, col = colA.array as Float32Array, H = hm.H, dz = Math.max(1e-6, M.z1 - M.z0);
  for (let v = 0; v < H.length; v++) {
    const h = H[v] ?? M.z1;
    pos[v * 3 + 1] = M.top + (h - M.z1) * M.k; const dep = (M.z1 - h) / dz;
    if (dep < 0.002) prtTmp.copy(prtC0); else prtTmp.copy(prtC1).lerp(prtC2, Math.min(1, dep * 1.4));
    col[v * 3] = prtTmp.r; col[v * 3 + 1] = prtTmp.g; col[v * 3 + 2] = prtTmp.b;
  }
  posA.needsUpdate = true; colA.needsUpdate = true; hm.geo.computeVertexNormals();
  const wA = hm.wall.attributes['position'] as THREE.BufferAttribute, wp = wA.array as Float32Array;
  for (let r = 0; r < hm.ring.length; r++) wp[r * 6 + 1] = pos[(hm.ring[r] ?? 0) * 3 + 1] ?? 0;
  wA.needsUpdate = true; hm.dirty = false;
}
export function prtStamp(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ti: { r: number; ball: boolean; cone: number } | null): number {
  const hm = PRT.hm, M = PRT.map; if (!hm || !M || !ti) return 0;
  const r = ti.r, H = hm.H, NX = hm.NX, NY = hm.NY, cx = hm.cx, cy = hm.cy, ca = cx * cy;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), step = Math.min(cx, cy) * 0.7, n = Math.max(1, Math.ceil(len / step)), ri = Math.ceil(r / cx) + 1, rj = Math.ceil(r / cy) + 1, r2 = r * r;
  let vol = 0;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
    if (z >= M.z1 || x < M.x0 - r || x > M.x1 + r || y < M.y0 - r || y > M.y1 + r) continue;
    const ic = Math.round((x - M.x0) / cx), jc = Math.round((y - M.y0) / cy);
    for (let j = Math.max(0, jc - rj); j <= Math.min(NY - 1, jc + rj); j++) {
      const dy = M.y0 + j * cy - y, dy2 = dy * dy; if (dy2 > r2) continue;
      for (let i = Math.max(0, ic - ri); i <= Math.min(NX - 1, ic + ri); i++) {
        const dx = M.x0 + i * cx - x, d2 = dx * dx + dy2; if (d2 > r2) continue;
        let bz = ti.ball ? z + r - Math.sqrt(r2 - d2) : ti.cone ? z + Math.sqrt(d2) * ti.cone : z;
        const k = j * NX + i, h = H[k] ?? M.z1;
        bz = Math.max(bz, M.z0); if (bz < h - 0.005) { vol += (h - bz) * ca; H[k] = bz; hm.dirty = true; }
      }
    }
  }
  return vol;
}
// Hareketin yay uzunluğu birikimi (prototipte hareketin _cl alanı).
const YAY = new WeakMap<GHareket, number[]>();
export function prtPt(mv: GHareket, f: number, out: number[]): number[] {
  const pts = mv.pts; f = clamp(f, 0, 1);
  const a = (i: number) => mv.a[i] ?? 0, b = (i: number) => mv.b[i] ?? 0;
  if (!pts) { out[0] = a(0) + (b(0) - a(0)) * f; out[1] = a(1) + (b(1) - a(1)) * f; out[2] = a(2) + (b(2) - a(2)) * f; return out; }
  let c2 = YAY.get(mv);
  if (!c2) { const cl = [0]; let px = a(0), py = a(1), pz = a(2), L0 = 0; for (let i = 0; i < pts.length; i += 3) { const qx = pts[i] ?? 0, qy = pts[i + 1] ?? 0, qz = pts[i + 2] ?? 0; L0 += Math.hypot(qx - px, qy - py, qz - pz); cl.push(L0); px = qx; py = qy; pz = qz; } YAY.set(mv, cl); c2 = cl; }
  const tl = f * (c2[c2.length - 1] ?? 0); let k = 1; while (k < c2.length - 1 && (c2[k] ?? 0) < tl) k++;
  const P = (i: number) => pts[i] ?? 0;
  const ax = k === 1 ? a(0) : P((k - 2) * 3), ay = k === 1 ? a(1) : P((k - 2) * 3 + 1), az = k === 1 ? a(2) : P((k - 2) * 3 + 2), bx = P((k - 1) * 3), by = P((k - 1) * 3 + 1), bz = P((k - 1) * 3 + 2);
  const sg = (c2[k] ?? 0) - (c2[k - 1] ?? 0), u = sg > 0 ? (tl - (c2[k - 1] ?? 0)) / sg : 1;
  out[0] = ax + (bx - ax) * u; out[1] = ay + (by - ay) * u; out[2] = az + (bz - az) * u; return out;
}
const prtA = [0, 0, 0], prtB = [0, 0, 0];
function prtLog(txt: string, cls?: string): void { PRT.log.unshift({ t: txt, c: cls ?? '', p: PRT.part + 1 }); if (PRT.log.length > 60) PRT.log.length = 60; }
// Dönüş: takım değişti mi (sahnede iş mili yeniden kurulur).
function prtApply(mv: GHareket, f0: number, f1: number): { vol: number; degisti: boolean } {
  const m = machine(), T = tStation(mv.T, m, PRT.p?.heid);
  let degisti = false;
  if (T !== PRT.curT) { PRT.curT = T; degisti = true; prtLog(`T${String(T)} iş miline takıldı · ${prtTool(T)?.name ?? 'cep boş'}`, 'tc'); }
  if (!mv.t) return { vol: 0, degisti };
  const dur = mv.dur * (f1 - f0), w = PRT.wear[T];
  if (w != null) { PRT.wear[T] = w + dur; PRT.cutT[T] = (PRT.cutT[T] ?? 0) + dur; const TR = PRT.TR[T]; if (TR && w + dur > TR && !PRT.over[T]) { PRT.over[T] = 1; prtLog(`⚠ T${String(T)} güvenli ömrü aştı (parça ${String(PRT.part + 1)} sırasında)`, 'warn'); } }
  if (!PRT.hm) return { vol: 0, degisti };
  const ti = prtTI(prtTool(T)); if (!ti) return { vol: 0, degisti };
  const n = mv.pts ? Math.max(1, Math.ceil((f1 - f0) * (mv.pts.length / 3) * 1.5)) : 1;
  let vol = 0;
  prtPt(mv, f0, prtA);
  for (let i = 1; i <= n; i++) { prtPt(mv, f0 + (f1 - f0) * i / n, prtB); vol += prtStamp(prtA[0] ?? 0, prtA[1] ?? 0, prtA[2] ?? 0, prtB[0] ?? 0, prtB[1] ?? 0, prtB[2] ?? 0, ti); prtA[0] = prtB[0] ?? 0; prtA[1] = prtB[1] ?? 0; prtA[2] = prtB[2] ?? 0; }
  PRT.removed += vol; return { vol, degisti };
}
export function prtPartDone(): void {
  PRT.part++; const any: string[] = [];
  for (const k of Object.keys(PRT.wear)) {
    const T = Number(k), TR = PRT.TR[T];
    if (!TR || (PRT.wear[T] ?? 0) < TR) continue;
    if ((PRT.spare[T] ?? 0) > 0 || !PRT.spK[T]) { if (PRT.spK[T]) PRT.spare[T] = (PRT.spare[T] ?? 0) - 1; PRT.chg[T] = (PRT.chg[T] ?? 0) + 1; PRT.wear[T] = 0; PRT.over[T] = 0; any.push(`T${k}`); PRT.chgEv.push({ T, part: PRT.part }); }
    else if (!PRT.over[T] || PRT.over[T] === 1) { PRT.over[T] = 2; prtLog(`✕ T${k} ömrü bitti, depoda yedek yok — sipariş verin`, 'err'); }
  }
  prtLog(`Parça ${String(PRT.part)} bitti${any.length ? ` · ${any.join(', ')} yenisiyle değiştirildi` : ''}`, any.length ? 'chg' : 'ok');
  if (PRT.part >= PRT.target) { PRT.done = true; PRT.playing = false; prtLog(`✓ Parti tamam: ${String(PRT.part)} parça`, 'ok'); bildir(); return; }
  PRT.k = 0; PRT.frac = 0; if (PRT.hm && PRT.map) { PRT.hm.H.fill(PRT.map.z1); PRT.hm.dirty = true; }
  bildir();
}
function prtTipAt(): void {
  const p = PRT.p, L = PRT.L, M = PRT.map; if (!p || !L || L.lathe || !M) return;
  const mv = p.moves[Math.min(PRT.k, p.moves.length - 1)], f = PRT.k >= p.moves.length ? 1 : PRT.frac; if (!mv) return; prtPt(mv, f, prtA);
  PRT.tip.set(M.ox + ((prtA[0] ?? 0) - M.x0) * M.k, M.top + ((prtA[2] ?? 0) - M.z1) * M.k, M.oz - ((prtA[1] ?? 0) - M.y0) * M.k);
  if (PRT.done) PRT.tip.y = Math.max(PRT.tip.y, M.top + 2.4);
  PRT.spinOn = !PRT.done && (mv.S ?? 0) > 0;
}
function prtChips(dt: number, vol: number): void {
  const C = PRT.chips; if (!C) return; const pos = C.pos, vel = C.vel, life = C.life;
  if (vol > 0 && PRT.L && !PRT.L.lathe) {
    const n = Math.min(14, 2 + Math.round(Math.sqrt(vol) * 0.6));
    for (let q = 0; q < n; q++) { const i = C.i = (C.i + 1) % C.n, a = Math.random() * TAU, sp = 2 + Math.random() * 4; pos[i * 3] = PRT.tip.x; pos[i * 3 + 1] = PRT.tip.y + 0.05; pos[i * 3 + 2] = PRT.tip.z; vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = 2 + Math.random() * 4; vel[i * 3 + 2] = Math.sin(a) * sp; life[i] = 0.6 + Math.random() * 0.8; }
  }
  const floor = PRT.L && !PRT.L.lathe ? PRT.L.tableTop + 0.05 : 0;
  for (let k = 0; k < C.n; k++) {
    const l = life[k] ?? 0;
    if (l <= 0) { if ((pos[k * 3 + 1] ?? 0) > -900) pos[k * 3 + 1] = -999; continue; }
    life[k] = l - dt; vel[k * 3 + 1] = (vel[k * 3 + 1] ?? 0) - 18 * dt;
    pos[k * 3] = (pos[k * 3] ?? 0) + (vel[k * 3] ?? 0) * dt; pos[k * 3 + 1] = (pos[k * 3 + 1] ?? 0) + (vel[k * 3 + 1] ?? 0) * dt; pos[k * 3 + 2] = (pos[k * 3 + 2] ?? 0) + (vel[k * 3 + 2] ?? 0) * dt;
    if ((pos[k * 3 + 1] ?? 0) < floor) { pos[k * 3 + 1] = floor; vel[k * 3] = (vel[k * 3] ?? 0) * 0.3; vel[k * 3 + 2] = (vel[k * 3 + 2] ?? 0) * 0.3; vel[k * 3 + 1] = 0; }
  }
  (C.pts.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
}
// Kare (prototip prtFrame 21729-21745). Dönüş: takım değişti mi; canlı panel ayrıca 250 ms'de bir yenilenir (canli).
export function prtFrame(dt: number): { degisti: boolean; canli: boolean } {
  const C = PRT.chips;
  if (!PRT.on) { if (C?.pts.visible) { C.life.fill(0); prtChips(0, 0); C.pts.visible = false; } return { degisti: false, canli: false }; }
  if (C) C.pts.visible = true;
  let vol = 0, degisti = false;
  if (PRT.playing && PRT.p) {
    const p = PRT.p, t0 = performance.now(); let adv = Math.min(dt, 0.05) * PRT.speed / 60;
    while (adv > 1e-9 && PRT.playing && performance.now() - t0 < 14) {
      const mv = p.moves[PRT.k]; if (!mv) { prtPartDone(); continue; }
      const rem = mv.dur * (1 - PRT.frac);
      if (adv >= rem) { const r = prtApply(mv, PRT.frac, 1); vol += r.vol; degisti ||= r.degisti; adv -= rem; PRT.k++; PRT.frac = 0; }
      else { const f1 = PRT.frac + adv / Math.max(1e-9, mv.dur), r = prtApply(mv, PRT.frac, f1); vol += r.vol; degisti ||= r.degisti; PRT.frac = f1; adv = 0; }
    }
  }
  prtTipAt(); prtChips(dt, vol);
  if (PRT.hm?.dirty && performance.now() - PRT.hm.last > 50) { prtUpload(); PRT.hm.last = performance.now(); }
  PRT.liveT += dt; let canli = false; if (PRT.liveT > 0.25) { PRT.liveT = 0; canli = true; }
  return { degisti, canli };
}
// Dönüş: hata iletisi (program yoksa).
export function prtToggle(): string | null {
  if (!PRT.p) { prtInit(); if (!PRT.p) return PRT.err; }
  if (PRT.done) prtInit();
  PRT.playing = !PRT.playing; return null;
}
export function prtSpeed(d: number): void { const i = PRT_SPEEDS.indexOf(PRT.speed); PRT.speed = PRT_SPEEDS[clamp((i < 0 ? 2 : i) + d, 0, PRT_SPEEDS.length - 1)] ?? 20; }
// Kalan parçaları anında hesaplar (prototip prtFast 21748-21758).
export function prtFast(): void {
  if (!PRT.p) prtInit(); if (!PRT.p) return; PRT.playing = false;
  const per: Record<number, number> = {}; for (const k of Object.keys(PRT.wear)) { const st = prPerTool(Number(k)); per[Number(k)] = st ? st.t : 0; }
  let guard = 0;
  while (!PRT.done && guard++ < 100000) {
    const p = PRT.p;
    if (PRT.k > 0 || PRT.frac > 0) {
      while (PRT.k < p.moves.length) { const mv = p.moves[PRT.k]; if (mv?.t) { const T = tStation(mv.T, machine(), p.heid), w = PRT.wear[T]; if (w != null) { const d = mv.dur * (1 - PRT.frac); PRT.wear[T] = w + d; PRT.cutT[T] = (PRT.cutT[T] ?? 0) + d; } } PRT.k++; PRT.frac = 0; }
    } else {
      for (const k of Object.keys(per)) { const T = Number(k), d = per[T] ?? 0; PRT.wear[T] = (PRT.wear[T] ?? 0) + d; PRT.cutT[T] = (PRT.cutT[T] ?? 0) + d; const TR = PRT.TR[T]; if (TR && (PRT.wear[T] ?? 0) > TR && !PRT.over[T]) PRT.over[T] = 1; }
    }
    PRT.k = p.moves.length; prtPartDone();
  }
  prtTipAt();
}
export function prtHedef(n: number): void { PRT.target = Math.max(1, Math.round(n)); if (PRT.part < PRT.target) PRT.done = false; bildir(); }

// Sonucu takım ömrüne işler (prototip prtApplyLife 21759-21770). Üretim günlüğüne (wearLog) satır yazılmaz: elle üretim kaydı
// sunucuda reddedilir (311 a; servis.ts elleUretimKaydiVarMi). Dönüş: işlenen takım sayısı.
export function prtApplyLife(): number {
  const m = machine(); let n = 0;
  for (const k of Object.keys(PRT.wear)) {
    const T = Number(k), t = prtTool(T); if (!t) continue;
    const r = wearRec(m.id, T - 1, t.id); let lastChg = 0;
    PRT.chgEv.forEach((e) => { if (e.T === T) lastChg = e.part; });
    const chg = PRT.chg[T] ?? 0;
    if (chg) { r.used = PRT.wear[T] ?? 0; r.parts = PRT.part - lastChg; r.since = Date.now(); const iv = state.inv[invKey(t)]; if (iv && iv.qty != null) iv.qty = Math.max(0, iv.qty - chg); }
    else { r.used = PRT.wear[T] ?? 0; r.parts = (r.parts ?? 0) + PRT.part; }
    delete r.demo; n++;
  }
  dirtyUsage(); save();
  return n;
}
