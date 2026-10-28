import * as THREE from 'three';
import { htype, isLatheTool, isMillTool } from '../veri/takim-turu.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import { sahneRengi3 } from './renkler.ts';

// Prototipin CNC 3B model kütüphanesi (CNC3D): takım, tutucu, aparat, çene, ölçüm, sarf ve tezgâh modelleri koddan çizilir, dış
// dosya yoktur. Kesici takımlarda eksen Y, uç aşağıda (-Y), üst y=0; torna takımlarında eksen X, kesici baş +X yönündedir. Tezgâhlar
// metre ölçeğindedir. Ölçüler, parça sırası ve adlar prototipinkidir: görünümler parçaları adlarıyla ve sırasıyla okur.
// Renkler tasarım değişkenindedir (renkler.ts, `--cnc3d-m-*`); veri kalemlerinin kendi rengi (malzeme, soğutma, sarf) veridir.

const PI = Math.PI, TAU = PI * 2;

// Kalemin sayı alanı yoksa prototipteki undefined gibi NaN olur (aritmetik ve `||` yedekleri aynı sonucu verir).
const n = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);

type Malzeme = THREE.MeshStandardMaterial;
function sm(c: THREE.ColorRepresentation, me: number, ro: number, x?: THREE.MeshStandardMaterialParameters): Malzeme {
  return new THREE.MeshStandardMaterial({ color: c, metalness: me, roughness: ro, ...x });
}
const r3 = (ad: string): THREE.Color => sahneRengi3(`m-${ad}`);
const isikli = (ad: string, me: number, ro: number, isik: string, guc: number, x?: THREE.MeshStandardMaterialParameters): Malzeme =>
  sm(r3(ad), me, ro, { emissive: r3(isik), emissiveIntensity: guc, ...x });

// Ortak malzemeler (prototipin initMats'i). Görünümler `M.steel` gibi adlarla kullanır; dispose bunları bırakmaz.
function malzemeleriKur() {
  return {
    steel: sm(r3('celik'), 0.9, 0.28), carb: sm(r3('karbur'), 0.8, 0.33), dark: sm(r3('koyu'), 0.6, 0.45),
    black: sm(r3('siyah'), 0.5, 0.5), tin: sm(r3('tin'), 0.85, 0.3), altin: sm(r3('altin'), 0.75, 0.3),
    bright: sm(r3('parlak'), 1, 0.12), paint: sm(r3('boya'), 0.15, 0.55), paintDark: sm(r3('boya-koyu'), 0.25, 0.6),
    accent: sm(r3('vurgu'), 0.2, 0.45), blue: sm(r3('mavi'), 0.25, 0.45), red: sm(r3('kirmizi'), 0.2, 0.4),
    green: sm(r3('yesil'), 0.2, 0.45), yellow: sm(r3('sari'), 0.2, 0.45),
    glass: sm(r3('cam'), 0.1, 0.08, { transparent: true, opacity: 0.45 }), alu: sm(r3('alu'), 0.85, 0.35),
    ruby: sm(r3('yakut'), 0.2, 0.15), brass: sm(r3('pirinc'), 0.9, 0.3), rubber: sm(r3('kaucuk'), 0, 0.9),
    screen: isikli('ekran', 0.2, 0.3, 'ekran-isik', 0.7),
    oxide: sm(r3('oksit'), 0.55, 0.5), white: sm(r3('beyaz'), 0, 0.6), paper: sm(r3('kagit'), 0, 0.95),
    cloth: sm(r3('bez'), 0, 1), vise: sm(r3('mengene'), 0.3, 0.5), cyan: isikli('camgobegi', 0.2, 0.4, 'camgobegi', 0.6),
    orangeRub: sm(r3('turuncu-kaucuk'), 0, 0.8),
    cab: sm(r3('kabin'), 0.25, 0.45), cab2: sm(r3('kabin-2'), 0.3, 0.5), anth: sm(r3('antrasit'), 0.4, 0.5), inner: sm(r3('ic'), 0.3, 0.85),
    frameD: sm(r3('cerceve'), 0.4, 0.5),
    win: sm(r3('pencere'), 0.0, 0.05, { transparent: true, opacity: 0.13, depthWrite: false, envMapIntensity: 0.35 }),
    scr2: isikli('ekran-2', 0.2, 0.4, 'ekran-2-isik', 0.9), scrA: isikli('ekran-a', 0.1, 0.4, 'ekran-a-isik', 0.9),
    scrB: isikli('yesil', 0.1, 0.4, 'yesil', 0.8), scrC: isikli('vurgu', 0.1, 0.4, 'vurgu', 0.8), bellows: sm(r3('korukluk'), 0.2, 0.8),
    chips: sm(r3('talas'), 0.8, 0.55),
  };
}
export type MalzemeAdi = keyof ReturnType<typeof malzemeleriKur>;
export const M: Record<MalzemeAdi, Malzeme> = malzemeleriKur();

/* ---------- yardımcılar ---------- */
type Nesne = THREE.Object3D;
const G = (): THREE.Group => new THREE.Group();
const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => new THREE.Mesh(g, m);
function xz<T extends Nesne>(m: T, x?: number, z?: number): T { m.position.x = x || 0; m.position.z = z || 0; return m; }
function at<T extends Nesne>(m: T, x?: number, y?: number, z?: number): T { m.position.set(x || 0, y || 0, z || 0); return m; }
function cy(rt: number, rb: number, yT: number, yB: number, mat: THREE.Material, seg?: number): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, Math.abs(yT - yB) || 0.001, seg || 28), mat); m.position.y = (yT + yB) / 2; return m;
}
function cyX(rL: number, rR: number, x0: number, x1: number, mat: THREE.Material, y?: number, z?: number, seg?: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rR, rL, Math.abs(x1 - x0), seg || 28); geo.rotateZ(-PI / 2);
  const m = mesh(geo, mat); m.position.set((x0 + x1) / 2, y || 0, z || 0); return m;
}
function cyZ(rB: number, rF: number, z0: number, z1: number, mat: THREE.Material, x?: number, y?: number, seg?: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rF, rB, Math.abs(z1 - z0), seg || 28); geo.rotateX(PI / 2);
  const m = mesh(geo, mat); m.position.set(x || 0, y || 0, (z0 + z1) / 2); return m;
}
function bx(w: number, h: number, d: number, mat: THREE.Material, x?: number, y?: number, z?: number): THREE.Mesh { return at(mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z); }
function sp(r: number, mat: THREE.Material, x?: number, y?: number, z?: number): THREE.Mesh { return at(mesh(new THREE.SphereGeometry(r, 20, 14), mat), x, y, z); }
function tor(R: number, r: number, mat: THREE.Material, x?: number, y?: number, z?: number, arc?: number): THREE.Mesh {
  return at(mesh(new THREE.TorusGeometry(R, r, 10, 36, arc || TAU), mat), x, y, z);
}
function add<T extends Nesne>(g: T, ...parcalar: Nesne[]): T { for (const p of parcalar) g.add(p); return g; }
// Prototip son eklenen parçayı yerinde düzeltir (g.children[g.children.length - 1]).
const son = (g: Nesne): Nesne => g.children[g.children.length - 1] ?? g;
const cocuk = (g: Nesne, i: number): Nesne => g.children[i] ?? g;

class Helix extends THREE.Curve<THREE.Vector3> {
  private readonly r: number; private readonly len: number; private readonly turns: number; private readonly phase: number; private readonly y0: number;
  constructor(r: number, len: number, turns: number, phase: number, y0: number) { super(); this.r = r; this.len = len; this.turns = turns; this.phase = phase; this.y0 = y0; }
  override getPoint(t: number, tg = new THREE.Vector3()): THREE.Vector3 {
    const a = this.phase + t * this.turns * TAU;
    return tg.set(Math.cos(a) * this.r, this.y0 - t * this.len, Math.sin(a) * this.r);
  }
}
function lands(g: THREE.Group, r: number, y0: number, y1: number, adet: number, deg: number, mat: THREE.Material): void {
  const len = y0 - y1, turns = len * Math.tan(deg * PI / 180) / (TAU * r);
  for (let i = 0; i < adet; i++) g.add(mesh(new THREE.TubeGeometry(new Helix(r * 0.8, len, turns, i * TAU / adet, y0), Math.max(20, Math.ceil(turns * 40)), r * 0.21, 8, false), mat));
}
function coat(t: Kalem): Malzeme { return t.coat === 'tin' ? M.tin : t.coat === 'bright' ? M.bright : t.coat === 'altin' ? M.altin : M.carb; }
function shankMat(t: Kalem): Malzeme { return t.tm === 'H' ? M.steel : M.carb; }
const govde = (g: THREE.Group, shank: number): THREE.Group => { g.userData['shank'] = shank; return g; };

/* ---------- FREZE TAKIMLARI ---------- */
function endmill(t: Kalem): THREE.Group {
  const g = G(), D = n(t.d) / 10, r = D / 2, rs = (n(t.s) || n(t.d)) / 20, L = 4 + D * 3, fl = Math.min(D * 2.6, L * 0.5), cm = coat(t);
  const ys = -(L - fl);
  g.add(cy(rs, rs, 0, ys, shankMat(t))); g.add(cy(rs, r * 0.9, ys, ys - 0.12, shankMat(t)));
  const y0 = ys - 0.12, y1 = -L;
  g.add(cy(r * 0.62, r * 0.62, y0, y1, M.dark));
  lands(g, r, y0, y1, n(t.z), t.kind === 'rougher' ? 30 : 38, cm);
  if (t.kind === 'rougher') for (let y = y0 - 0.25; y > y1 + 0.1; y -= 0.3) { const tr = tor(r * 0.97, 0.035, M.dark, 0, y, 0); tr.rotation.x = PI / 2; g.add(tr); }
  if (t.kind === 'ball') { const s = mesh(new THREE.SphereGeometry(r * 0.97, 24, 12, 0, TAU, PI / 2, PI / 2), cm); s.position.y = y1; g.add(s); }
  else { g.add(cy(r * 0.97, r * 0.97, y1 + 0.06, y1, cm)); if (t.kind === 'bullnose') { const b = tor(r * 0.85, r * 0.12, cm, 0, y1 + 0.05, 0); b.rotation.x = PI / 2; g.add(b); } }
  return govde(g, L - fl);
}
function drill(t: Kalem): THREE.Group {
  const g = G(), D = n(t.d) / 10, r = D / 2, rs = (n(t.s) || n(t.d)) / 20, fl = Math.max(D * ((n(t.ld) || 4) + 1), 2.4), sh = Math.max(rs * 6, 2.6), cm = coat(t);
  g.add(cy(rs, rs, 0, -sh, shankMat(t))); g.add(cy(rs, r, -sh, -sh - 0.15, shankMat(t)));
  const y0 = -sh - 0.15, y1 = y0 - fl;
  g.add(cy(r * 0.45, r * 0.45, y0, y1, M.dark)); lands(g, r, y0, y1, 2, 30, cm);
  const th = r * 0.6, c = mesh(new THREE.ConeGeometry(r * 0.98, th, 24), cm); c.rotation.x = PI; c.position.y = y1 - th / 2; g.add(c);
  return govde(g, sh);
}
function spot(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, cm = coat(t);
  g.add(cy(r, r, 0, -3.4, M.carb)); g.add(cy(r, r, -3.4, -4.4, cm));
  const c = mesh(new THREE.ConeGeometry(r, r, 24), cm); c.rotation.x = PI; c.position.y = -4.4 - r / 2; g.add(c);
  g.add(bx(0.06, 1.2, r * 1.6, M.dark, 0, -4.2, 0));
  return govde(g, 3.4);
}
function tap(t: Kalem): THREE.Group {
  const g = G(), D = n(t.d) / 10, r = D / 2, p = (t.cut?.pitch ? t.cut.pitch : 1.5) / 10, cm = coat(t), sh = D * 4.2 + 1;
  g.add(bx(r * 1.15, r * 1.2, r * 1.15, M.steel, 0, -r * 0.6, 0));
  g.add(cy(r * 0.78, r * 0.78, -r * 1.2, -sh, M.steel));
  const tl = D * 2, y0 = -sh, y1 = -sh - tl;
  g.add(cy(r * 0.78, r * 0.78, y0, y1, cm));
  for (let y = y0 - p / 2; y > y1 + p; y -= p) { const tr = tor(r * 0.86, r * 0.13, cm, 0, y, 0); tr.rotation.x = PI / 2; g.add(tr); }
  const c = mesh(new THREE.ConeGeometry(r * 0.82, p * 3, 20), cm); c.rotation.x = PI; c.position.y = y1 - p * 1.5; g.add(c);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3, f = bx(r * 0.4, tl, 0.07, M.dark, Math.cos(a) * r * 0.75, (y0 + y1) / 2, Math.sin(a) * r * 0.75); f.rotation.y = -a; g.add(f); }
  return govde(g, sh);
}
function reamer(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, cm = coat(t), sh = 3.2, bl = 2.6;
  g.add(cy(r, r, 0, -sh, M.carb)); g.add(cy(r * 0.72, r * 0.72, -sh, -sh - bl, M.dark));
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6, l = bx(r * 0.32, bl, r * 0.22, cm, Math.cos(a) * r * 0.82, -sh - bl / 2, Math.sin(a) * r * 0.82); l.rotation.y = -a; g.add(l); }
  g.add(cy(r * 0.8, r * 0.6, -sh - bl, -sh - bl - 0.15, cm));
  return govde(g, sh);
}
function chamfer(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, cm = coat(t), sh = 3.4;
  g.add(cy(r, r, 0, -sh, M.carb)); g.add(cy(r, 0.1, -sh, -sh - r, cm));
  for (let i = 0; i < 4; i++) { const f = bx(0.05, r * 0.95, r * 1.6, M.dark, 0, -sh - r * 0.45, 0); f.rotation.y = i * PI / 4; g.add(f); }
  return govde(g, sh);
}
function threadmill(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, cm = coat(t), sh = 3.4, bl = 2.0;
  g.add(cy(r, r, 0, -sh, M.carb)); g.add(cy(r * 0.62, r * 0.62, -sh, -sh - bl, M.dark));
  for (let y = -sh - 0.15; y > -sh - bl; y -= 0.15) { const tr = tor(r * 0.72, r * 0.15, cm, 0, y, 0); tr.rotation.x = PI / 2; g.add(tr); }
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3, f = bx(r * 0.45, bl, 0.07, M.dark, Math.cos(a) * r * 0.7, -sh - bl / 2, Math.sin(a) * r * 0.7); f.rotation.y = -a; g.add(f); }
  return govde(g, sh);
}
function tslot(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = (n(t.s) || 16) / 20, cm = coat(t), z = n(t.z);
  g.add(cy(rs, rs, 0, -3, M.carb)); g.add(cy(rs * 0.7, rs * 0.7, -3, -4.2, M.carb));
  g.add(cy(r, r, -4.2, -4.85, M.dark));
  for (let i = 0; i < z * 2; i++) { const a = i * TAU / (z * 2), k = bx(0.3, 0.68, 0.18, cm, Math.cos(a) * r, -4.52, Math.sin(a) * r); k.rotation.y = -a; g.add(k); }
  return govde(g, 3);
}
function facemill(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, h = Math.max(r * 0.9, 2.2), bb = t.kind === 'facemill45' ? r * 0.82 : r, z = n(t.z);
  g.add(cy(r * 0.55, r * 0.55, 0, -h * 0.35, M.oxide));
  g.add(cy(r, bb, -h * 0.35, -h, M.oxide));
  for (let i = 0; i < z; i++) {
    const a = i / z * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const pk = bx(0.95, h * 0.42, 1.0, M.black, ca * (bb - 0.3), -h + h * 0.2, sa * (bb - 0.3)); pk.rotation.y = -a; g.add(pk);
    const ins = bx(0.8, 0.85, 0.24, M.tin, ca * (bb - 0.3), -h + 0.38, sa * (bb - 0.3)); ins.rotation.y = -a - 0.25; g.add(ins);
  }
  g.add(cy(0.55, 0.55, -h + 0.02, -h - 0.04, M.steel));
  return govde(g, 0);
}
function boring(): THREE.Group {
  const g = G();
  g.add(cy(1.6, 1.6, 0, -2.2, M.steel)); g.add(bx(2.8, 0.8, 1.4, M.oxide, 0.3, -2.6, 0));
  g.add(cy(0.12, 0.12, -1.0, -1.4, M.dark));
  const bar = cy(0.5, 0.5, -3.0, -5.6, M.oxide); bar.position.x = 1.0; g.add(bar);
  g.add(bx(0.35, 0.3, 0.3, M.tin, 1.5, -5.4, 0));
  g.add(cyZ(0.5, 0.5, 0.7, 0.9, M.steel, -0.6, -2.6));
  return govde(g, 0);
}
function probe(): THREE.Group {
  const g = G();
  g.add(cy(2.0, 2.0, 0, -3.2, M.paintDark)); g.add(cy(2.02, 2.02, -1.0, -1.6, M.glass));
  g.add(cy(2.0, 1.0, -3.2, -4.2, M.paintDark)); g.add(cy(0.3, 0.3, -4.2, -4.6, M.steel));
  g.add(cy(0.14, 0.14, -4.6, -7.6, M.carb)); g.add(sp(0.32, M.ruby, 0, -7.85, 0));
  g.add(sp(0.14, M.green, 1.7, -1.3, 1.0));
  return govde(g, 0);
}

/* ---------- TAKIM TUTUCULAR ---------- */
interface Tutucu { g: THREE.Group; bot: number; ins: number }
function holder(taper: string | undefined, ht: string | undefined, toolR: number): Tutucu {
  const g = G();
  let top: number;
  if (taper === 'BT40' || taper === 'BT50' || taper === 'SK40') {
    const s = taper === 'BT50' ? 1.5 : 1;
    add(g, cy(0.55 * s, 0.55 * s, 8.5 * s, 7.3 * s, M.steel), cy(0.78 * s, 0.78 * s, 8.9 * s, 8.5 * s, M.steel),
      cy(1.6 * s, 2.22 * s, 7.3 * s, 0.9 * s, M.steel), cy(3.15 * s, 3.15 * s, 0.9 * s, 0.45 * s, M.steel),
      cy(2.7 * s, 2.7 * s, 0.45 * s, 0.2 * s, M.steel), cy(3.15 * s, 3.15 * s, 0.2 * s, -0.55 * s, M.steel),
      bx(1.0 * s, 0.9 * s, 0.6 * s, M.dark, 0, 0.35 * s, 3.0 * s), bx(1.0 * s, 0.9 * s, 0.6 * s, M.dark, 0, 0.35 * s, -3.0 * s));
    top = -0.55 * s;
  } else if (taper === 'Capto C6') {
    add(g, cy(2.0, 2.6, 3.4, 0.3, M.steel, 3), cy(3.15, 3.15, 0.3, -1.0, M.steel), cy(2.85, 2.85, -0.2, -0.5, M.dark));
    top = -1.0;
  } else {
    const hs = taper === 'HSK-A100' ? 1.4 : 1;
    add(g, cy(2.05 * hs, 2.35 * hs, 3.4 * hs, 0.4 * hs, M.steel), cy(3.15 * hs, 3.15 * hs, 0.4 * hs, -0.1 * hs, M.steel), cy(2.85 * hs, 2.85 * hs, -0.1 * hs, -0.4 * hs, M.steel), cy(3.15 * hs, 3.15 * hs, -0.4 * hs, -1.1 * hs, M.steel),
      bx(0.9, 0.6, 0.8, M.dark, 0, -0.75 * hs, 3.0 * hs));
    top = -1.1 * hs;
  }
  let bot: number, ins = 3, rr: number;
  switch (ht) {
    case 'shrink': bot = top - 6; g.add(cy(2.0, Math.max(toolR + 0.4, 0.75), top, bot, M.steel)); break;
    case 'weldon': rr = toolR + 1.1; bot = top - 5; g.add(cy(rr, rr, top, bot, M.steel)); g.add(bx(0.6, 0.6, 0.6, M.black, rr, top - 2, 0)); break;
    case 'hyd': rr = toolR + 1.15; bot = top - 5.2; add(g, cy(rr, rr, top, top - 2.5, M.steel), cy(rr, rr * 0.9, top - 2.5, bot, M.steel), bx(0.45, 0.45, 0.45, M.black, 0, top - 1.2, rr)); break;
    case 'er': bot = top - 4.9; ins = 2.4; add(g, cy(2.0, 2.0, top, top - 2.8, M.steel), cy(2.45, 2.45, top - 2.8, top - 4.4, M.steel), cy(1.5, toolR + 0.15, top - 4.4, bot, M.steel));
      for (let i = 0; i < 4; i++) g.add(bx(0.35, 1.2, 0.35, M.dark, Math.cos(i * PI / 2) * 2.42, top - 3.6, Math.sin(i * PI / 2) * 2.42)); break;
    case 'tap': bot = top - 5.8; ins = 2.2; add(g, cy(1.9, 1.9, top, top - 4.5, M.steel), cy(2.2, 2.2, top - 4.5, bot, M.dark)); break;
    case 'arbor': bot = top - 2.2; ins = 0; add(g, cy(2.2, 2.2, top, bot, M.steel), cy(1.1, 1.1, bot, bot - 0.9, M.steel)); break;
    case 'arbord': bot = top - 4.5; ins = 0; add(g, cy(2.2, 1.6, top, top - 1.5, M.steel), cy(1.1, 1.1, top - 1.5, bot, M.steel)); break;
    case 'mchuck': bot = top - 5.5; rr = toolR + 1.6; add(g, cy(rr + 0.3, rr + 0.3, top, top - 2.2, M.steel), cy(rr + 0.5, rr + 0.5, top - 2.2, top - 3.8, M.oxide), cy(rr, rr * 0.92, top - 3.8, bot, M.steel));
      for (let kk = 0; kk < 14; kk++) g.add(bx(0.12, 1.5, 0.12, M.dark, Math.cos(kk / 14 * TAU) * (rr + 0.5), top - 3.0, Math.sin(kk / 14 * TAU) * (rr + 0.5))); break;
    case 'mt': bot = top - 6; ins = 3; add(g, cy(1.9, 1.9, top, top - 1.2, M.steel), cy(1.5, 1.0, top - 1.2, bot, M.steel), bx(0.3, 0.6, 2.8, M.dark, 0, top - 1.6, 0)); break;
    case 'boringh': bot = top - 2; ins = 0; add(g, cy(1.8, 1.8, top, bot, M.steel)); break;
    case 'er16': case 'er25': case 'er40': {
      const es = ht === 'er16' ? 0.6 : ht === 'er25' ? 0.8 : 1.25;
      bot = top - 4.9 * Math.max(0.8, es); ins = 2.2;
      add(g, cy(2.0 * es, 2.0 * es, top, top - 2.8, M.steel), cy(2.45 * es, 2.45 * es, top - 2.8, top - 4.2, M.steel), cy(1.5 * es, Math.max(toolR + 0.15, 0.5), top - 4.2, bot, M.steel)); break;
    }
    default: bot = top - 1; ins = 0; g.add(cy(1.8, 1.8, top, bot, M.steel));
  }
  return { g, bot, ins };
}

/* ---------- TORNA TAKIMLARI ---------- */
const UC_ACISI: Record<string, number> = { C: 80, D: 55, V: 35, S: 90, W: 80 };
function insShape(type: string, ic: number): THREE.Shape {
  let pts: [number, number][];
  if (type === 'R') { const cs = new THREE.Shape(); cs.absarc(0, 0, ic / 2, 0, TAU, false); return cs; }
  if (type === 'T') { const s0 = ic * Math.sqrt(3); pts = [[0, 0], [s0, 0], [s0 / 2, s0 * Math.sqrt(3) / 2]]; }
  else { const a = (UC_ACISI[type] ?? 80) * PI / 180, s = ic / Math.sin(a); pts = [[0, 0], [s, 0], [s + s * Math.cos(a), s * Math.sin(a)], [s * Math.cos(a), s * Math.sin(a)]]; }
  let cx = 0, cyy = 0;
  for (const [x, y] of pts) { cx += x; cyy += y; }
  cx /= pts.length; cyy /= pts.length;
  const [x0, y0] = pts[0] ?? [0, 0];
  const rot = -Math.atan2(y0 - cyy, x0 - cx), sh = new THREE.Shape();
  pts.forEach(([px, py], i) => {
    const x = px - cx, y = py - cyy, X = x * Math.cos(rot) - y * Math.sin(rot), Y = x * Math.sin(rot) + y * Math.cos(rot);
    if (i) sh.lineTo(X, Y); else sh.moveTo(X, Y);
  });
  sh.closePath(); return sh;
}
function insertMesh(type: string, ic: number, th: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(insShape(type, ic), { depth: th, bevelEnabled: false }); geo.rotateX(-PI / 2); return mesh(geo, M.tin);
}
function clampAt(g: THREE.Group, x: number, y: number, z: number): void { const c = cy(0.3, 0.3, y + 0.25, y, M.steel); c.position.x = x; c.position.z = z; g.add(c); }

function ltExt(t: Kalem): THREE.Group {
  const g = G(), S = 2.5, it = t.kind === 'lt_thread' ? 'T' : (t.ins || 'C'), ic = it === 'V' || it === 'T' ? 0.95 : it === 'D' ? 1.1 : 1.27;
  add(g, bx(11, S, S, M.oxide, -6.6, 0, 0), bx(2.6, S, S + 0.4, M.oxide, 0, 0, 0.2));
  const im = insertMesh(it, ic, 0.48); im.position.set(1.15, S / 2 - 0.12, 0.75); im.rotation.y = -0.3 + ((n(t.kap) || 95) - 95) * PI / 180; g.add(im);
  clampAt(g, 1.0, S / 2 + 0.36, 0.75); return g;
}
function ltBore(t: Kalem): THREE.Group {
  const g = G(), r = (n(t.bar) || 2.5) / 2, it = t.kind === 'lt_ithread' ? 'T' : (t.ins || 'C');
  g.add(cyX(r, r, -12, 1.2, M.oxide));
  const im = insertMesh(it, r > 1 ? 0.95 : 0.64, 0.36); im.position.set(1.0, r - 0.3, 0.2); im.rotation.y = -0.3; g.add(im);
  return g;
}
function ltGroove(): THREE.Group {
  const g = G(), S = 2.5;
  add(g, bx(11, S, S, M.oxide, -6.6, 0, 0), bx(2.6, S, S + 0.4, M.oxide, 0, 0, 0.2), bx(2.2, 1.8, 0.32, M.oxide, 2.3, 0.3, 0.9), bx(0.5, 0.35, 0.34, M.tin, 3.4, 1.05, 0.9));
  return g;
}
function ltPart(): THREE.Group {
  const g = G(), S = 2.5;
  add(g, bx(7, S, S, M.oxide, -8.5, 0, 0), bx(5, S * 1.2, S * 1.4, M.oxide, -3, 0, 0), bx(9, 2.2, 0.3, M.steel, 1.5, 0.4, 0), bx(0.45, 0.35, 0.32, M.tin, 6.1, 1.4, 0));
  return g;
}
function ltUdrill(): THREE.Group {
  const g = G();
  add(g, cyX(1.25, 1.25, -8, -3, M.steel), cyX(1.9, 1.9, -3, -2.4, M.oxide), cyX(1.0, 1.0, -2.4, 3.2, M.oxide),
    bx(5.4, 0.3, 0.6, M.dark, 0.4, 0.85, 0), bx(5.4, 0.3, 0.6, M.dark, 0.4, -0.85, 0),
    bx(0.4, 0.45, 0.16, M.tin, 3.3, 0.55, 0.3), bx(0.4, 0.45, 0.16, M.tin, 3.3, -0.55, -0.3));
  return g;
}

/* ---------- BAĞLAMA ---------- */
function vise(o: { hyd?: boolean } = {}): THREE.Group {
  const g = G(), w = 4, L = 9, mat = o.hyd ? M.blue : M.vise;
  add(g, bx(L, 1.2, w, mat, 0, 0.6, 0), bx(1.2, 1.6, w, mat, -L / 2 + 1.2, 2.0, 0), bx(0.25, 1.2, w * 0.98, M.steel, -L / 2 + 1.95, 2.2, 0),
    bx(1.4, 1.6, w, mat, 0.8, 2.0, 0), bx(0.25, 1.2, w * 0.98, M.steel, 0.8 - 0.82, 2.2, 0), bx(2.25, 1.1, w * 0.7, M.alu, -1.3, 2.35, 0));
  if (o.hyd) add(g, cyX(0.9, 0.9, L / 2, L / 2 + 1.6, M.accent, 1.0, 0), tor(0.6, 0.12, M.rubber, L / 2 + 1.9, 1.6, 0.6));
  else add(g, cyX(0.3, 0.3, L / 2, L / 2 + 1.4, M.steel, 1.0, 0), bx(0.7, 0.7, 0.7, M.steel, L / 2 + 1.6, 1.0, 0));
  return g;
}
function dvise(): THREE.Group {
  const g = G(), w = 4;
  add(g, bx(10, 1.2, w, M.vise, 0, 0.6, 0), bx(1.2, 1.6, w, M.vise, 0, 2.0, 0), bx(1.4, 1.6, w, M.vise, -3.8, 2.0, 0), bx(1.4, 1.6, w, M.vise, 3.8, 2.0, 0),
    bx(2.2, 1.1, w * 0.7, M.alu, -1.95, 2.35, 0), bx(2.2, 1.1, w * 0.7, M.alu, 1.95, 2.35, 0), cyX(0.3, 0.3, 5, 6, M.steel, 1.0, 0), cyX(0.3, 0.3, -6, -5, M.steel, 1.0, 0));
  return g;
}
function zeroPoint(o?: { riser?: boolean }): THREE.Group {
  const g = G(); g.add(bx(8, 0.8, 8, M.oxide, 0, 0.4, 0));
  for (let i = 0; i < 4; i++) { const x = (i % 2 ? 1 : -1) * 2.2, z = (i < 2 ? 1 : -1) * 2.2; add(g, xz(cy(1.2, 1.2, 1.2, 0.8, M.steel), x, z), xz(cy(0.55, 0.55, 1.25, 1.0, M.dark), x, z)); }
  if (o?.riser) add(g, bx(3, 3.2, 3, M.steel, 0, 2.8, 0), bx(2.4, 1.2, 2.4, M.alu, 0, 5, 0));
  return g;
}
function magTable(): THREE.Group {
  const g = G(); g.add(bx(8, 1.2, 5, M.paintDark, 0, 0.6, 0));
  for (let i = 0; i < 16; i++) g.add(bx(0.45, 0.06, 4.8, i % 2 ? M.brass : M.steel, -3.75 + i * 0.5, 1.23, 0));
  g.add(bx(1.2, 0.6, 0.8, M.red, 3.2, 0.6, 2.8)); return g;
}
function vacTable(): THREE.Group {
  const g = G(); g.add(bx(8, 0.8, 5, M.alu, 0, 0.4, 0));
  for (let i = -3; i <= 3; i++) g.add(bx(0.08, 0.04, 4.8, M.dark, i * 1.1, 0.82, 0));
  for (let j = -2; j <= 2; j++) g.add(bx(7.8, 0.04, 0.08, M.dark, 0, 0.82, j * 0.9));
  add(g, cyZ(0.3, 0.3, 2.5, 3.2, M.brass, 3.4, 0.4), bx(4, 0.5, 2.6, M.white, -0.5, 1.05, 0)); return g;
}
function clampSet(): THREE.Group {
  const g = G(); g.add(bx(9, 0.8, 5, M.steel, 0, 0.4, 0));
  for (let i = -1; i <= 1; i++) g.add(bx(9.02, 0.3, 0.6, M.black, 0, 0.7, i * 1.6));
  add(g, bx(3, 1.2, 2.4, M.alu, 0, 1.4, 0));
  for (const s of [-1, 1]) {
    const bar = bx(3.2, 0.4, 0.9, M.oxide, s * 2.6, 2.1, 0); bar.rotation.z = s * 0.12; g.add(bar);
    add(g, xz(cy(0.22, 0.22, 3.0, 0.6, M.steel), s * 2.4, 0), at(bx(0.6, 0.35, 0.6, M.steel, 0, 2.5, 0), s * 2.4, 2.5, 0));
    for (let k = 0; k < 3; k++) g.add(bx(0.9, 0.4 + k * 0.4, 1.0, M.oxide, s * (3.6 + k * 0.35), 1.0 + k * 0.2, 0));
  }
  return g;
}
function customFix(): THREE.Group {
  const g = G(); add(g, bx(8, 0.6, 5, M.alu, 0, 0.3, 0), bx(3.6, 1.4, 2.4, M.paint, 0, 1.3, 0));
  for (const [x, z] of [[-2.6, -1.8], [2.6, -1.8], [-2.6, 1.8]] as const) add(g, xz(cy(0.18, 0.18, 1.4, 0.6, M.steel), x, z));
  for (const [x, z] of [[-1.4, 1.6], [1.4, -1.6]] as const) add(g, xz(cy(0.45, 0.45, 2.4, 0.6, M.accent), x, z), bx(1.4, 0.3, 0.45, M.steel, x + 0.5, 2.3, z));
  return g;
}
function rot4(): THREE.Group {
  const g = G(); add(g, bx(9, 0.5, 3.4, M.steel, 0, 0.25, 0), bx(2.4, 3, 3, M.vise, -3.2, 2, 0), cyX(1.3, 1.3, -2.0, -1.4, M.steel, 2.2, 0), cyX(0.5, 0.5, -1.4, 3.0, M.alu, 2.2, 0),
    bx(1.4, 2.2, 2.2, M.vise, 3.6, 1.6, 0), cyX(0.3, 0.05, 3.0, 2.85 - 0.6, M.steel, 2.2, 0));
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; g.add(bx(0.4, 0.45, 0.35, M.dark, -1.2, 2.2 + Math.cos(a) * 0.85, Math.sin(a) * 0.85)); }
  return g;
}
function chuck(adet: number, o: { soft?: boolean } = {}): THREE.Group {
  const g = G(), R = 2.1;
  add(g, cyZ(R, R, -1.6, 0, M.steel, 0, 0, 40), cyZ(R * 0.95, R * 0.95, -2.2, -1.6, M.oxide), cyZ(0.55, 0.55, 0, 0.02, M.black));
  for (let i = 0; i < adet; i++) {
    const a = i * TAU / adet + PI / 2, j = G();
    add(j, bx(0.55, 1.1, 0.6, o.soft ? M.alu : M.steel, 0, 0, 0.3), bx(0.55, 0.6, 0.6, o.soft ? M.alu : M.steel, 0, 0.25, 0.9));
    j.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0); j.rotation.z = a - PI / 2; g.add(j);
    if (adet === 4) g.add(at(cyX(0.15, 0.15, 0, 0.4, M.dark, 0, 0), Math.cos(a) * 2.1, Math.sin(a) * 2.1, -0.8));
  }
  return g;
}
function colletChuck(): THREE.Group {
  const g = G(); add(g, cyZ(2.0, 2.0, -2.2, 0, M.steel), cyZ(1.6, 0.9, 0, 1.0, M.steel), cyZ(0.6, 0.6, 1.0, 2.6, M.alu));
  for (let i = 0; i < 3; i++) { const s = bx(0.08, 0.7, 1.0, M.dark, 0, 0, 0.5); s.position.set(Math.cos(i * TAU / 3) * 1.2, Math.sin(i * TAU / 3) * 1.2, 0.5); s.rotation.z = i * TAU / 3; g.add(s); }
  return g;
}
function chuckTail(o?: { steady?: boolean }): THREE.Group {
  const g = G(), c = chuck(3); c.rotation.y = PI / 2; c.position.x = -4; g.add(c);
  g.add(cyX(0.6, 0.6, -3.0, 3.6, M.alu));
  if (o?.steady) { const st = G(); add(st, tor(1.2, 0.3, M.vise, 0, 0, 0), bx(0.6, 2.2, 0.6, M.vise, 0, -2.0, 0)); st.rotation.y = PI / 2; g.add(st); }
  else add(g, cyX(0.45, 0.05, 4.6, 3.6, M.steel), bx(2, 2, 2, M.paint, 5.6, -0.4, 0));
  return g;
}
function facePlate(): THREE.Group {
  const g = G(); g.add(cyZ(3, 3, -0.6, 0, M.steel, 0, 0, 48));
  for (let i = 0; i < 4; i++) { const s = bx(0.25, 2, 0.05, M.dark, 0, 0, 0.01); s.position.set(Math.cos(i * PI / 2) * 1.8, Math.sin(i * PI / 2) * 1.8, 0.01); s.rotation.z = i * PI / 2; g.add(s); }
  add(g, bx(2.2, 1.4, 1.6, M.paint, 0, 0.6, 0.8), bx(1.4, 0.8, 1, M.alu, 0, 1.6, 0.8)); return g;
}

/* ---------- ÇENE / DESTEK ---------- */
function jaw(kind: string): THREE.Group {
  const g = G();
  switch (kind) {
    case 'j_hard':
      g.add(bx(5, 1.6, 0.6, M.steel, 0, 0, 0));
      for (let i = 0; i < 9; i++) g.add(bx(4.9, 0.06, 0.05, M.dark, 0, -0.6 + i * 0.15, 0.31));
      add(g, cyZ(0.25, 0.25, 0.3, 0.32, M.black, -1.6), cyZ(0.25, 0.25, 0.3, 0.32, M.black, 1.6)); break;
    case 'j_soft': add(g, bx(5, 2, 1.2, M.alu, 0, 0, 0), bx(5.02, 0.7, 0.5, M.dark, 0, 0.66, 0.36)); break;
    case 'j_par': for (let i = 0; i < 4; i++) g.add(bx(6, 0.9 + i * 0.3, 0.25, M.steel, 0, (0.9 + i * 0.3) / 2, i * 0.45)); break;
    case 'j_step': add(g, bx(5, 0.8, 1.6, M.steel, 0, 0.4, 0), bx(5, 0.8, 1.0, M.steel, 0, 1.2, -0.3)); break;
    case 'j_stop': add(g, bx(2, 0.5, 2, M.vise, 0, 0.25, 0), cy(0.2, 0.2, 2.2, 0.5, M.steel), bx(2.4, 0.3, 0.3, M.steel, 1.0, 2.0, 0), xz(cy(0.12, 0.12, 2.0, 1.2, M.accent), 2.1, 0)); break;
    case 'j_v': {
      const sh = new THREE.Shape(); sh.moveTo(-2, 0); sh.lineTo(2, 0); sh.lineTo(2, 2); sh.lineTo(0.9, 2); sh.lineTo(0, 1.0); sh.lineTo(-0.9, 2); sh.lineTo(-2, 2); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }); geo.translate(0, 0, -1.5); g.add(mesh(geo, M.steel)); g.add(cyZ(0.75, 0.75, -2.2, 2.2, M.alu, 0, 1.75)); break;
    }
    case 'j_none': add(g, bx(7, 0.5, 4, M.steel, 0, 0.25, 0), bx(3, 1.4, 2, M.alu, 0, 1.2, 0)); break;
    case 'lj_hard':
      add(g, bx(1.2, 0.8, 3.2, M.steel, 0, 0.4, 0), bx(1.2, 0.8, 1.8, M.steel, 0, 1.2, -0.7), bx(1.2, 0.8, 0.8, M.steel, 0, 2.0, -1.2));
      for (let i = 0; i < 6; i++) g.add(bx(1.22, 0.04, 0.05, M.dark, 0, 0.8 + i * 0.05, 1.55)); break;
    case 'lj_soft': {
      add(g, bx(1.4, 2.0, 3.2, M.alu, 0, 1.0, 0));
      const cut = mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 32, 1, false, PI * 0.75, PI * 0.5), M.dark); cut.rotation.x = PI / 2; cut.position.set(0, 2.6, 1.0); g.add(cut); break;
    }
    case 'lj_pie':
      for (let i = 0; i < 3; i++) { const p = mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.4, 32, 1, false, i * TAU / 3 + 0.05, TAU / 3 - 0.1), M.alu); p.rotation.x = PI / 2; g.add(p); }
      g.add(cyZ(0.8, 0.8, -0.71, 0.71, M.dark)); break;
    case 'lj_in': add(g, bx(1.2, 0.8, 1.0, M.steel, 0, 0.4, -1.1), bx(1.2, 0.8, 1.8, M.steel, 0, 1.2, -0.7), bx(1.2, 0.8, 3.2, M.steel, 0, 2.0, 0)); break;
    default: g.add(bx(2, 2, 2, M.steel));
  }
  return g;
}

/* ---------- SIFIRLAMA / KOORDİNAT ---------- */
function edgeFinder(): THREE.Group { const g = G(); add(g, cy(0.5, 0.5, 0, -4, M.steel), cy(0.5, 0.5, -4.05, -5.2, M.steel), sp(0.08, M.dark, 0, -4.02, 0)); cocuk(g, 1).position.x = 0.12; return g; }
function dial(): THREE.Group {
  const g = G();
  add(g, cyZ(1.6, 1.6, -0.5, 0, M.steel, 0, 0, 40), cyZ(1.45, 1.45, 0, 0.03, M.white, 0, 0, 40), tor(1.55, 0.1, M.steel, 0, 0, 0.05), bx(0.06, 1.2, 0.02, M.red, 0, 0.5, 0.06), xz(cy(0.2, 0.2, -1.6, -3.4, M.steel), 0, -0.25), sp(0.15, M.ruby, 0, -3.5, -0.25));
  return g;
}
function touchOff(): THREE.Group {
  const g = endmill({ id: '', name: '', d: 10, z: 4, tm: 'K', coat: 'altin', kind: 'endmill', s: 10 });
  g.add(bx(2.5, 0.03, 2, M.white, 0, -7.1, 0)); g.add(bx(4, 1.2, 3, M.alu, 0, -7.75, 0)); return g;
}
function zeroPin(): THREE.Group { const g = G(); add(g, bx(6, 0.6, 4, M.alu, 0, 0.3, 0), xz(cy(0.5, 0.5, 2.0, 0.6, M.steel), -1.5, 0), xz(cy(0.7, 0.7, 0.8, 0.6, M.dark), -1.5, 0), sp(0.15, M.accent, -1.5, 2.05, 0)); return g; }
function toolArm(): THREE.Group { const g = G(); add(g, bx(0.8, 5, 0.8, M.paintDark, 0, 2.5, 0), bx(4, 0.8, 0.8, M.paintDark, 2, 5, 0), bx(0.6, 1.4, 0.6, M.steel, 4, 4.0, 0), bx(1.0, 0.4, 1.0, M.carb, 4, 3.1, 0), sp(0.2, M.green, 0.5, 4.8, 0.45)); return g; }
function optical(): THREE.Group { const g = G(); add(g, bx(4, 2.4, 2.4, M.paintDark, 0, 1.2, 0), cyZ(0.8, 0.8, 1.2, 1.7, M.black, -0.8, 1.4), cyZ(0.6, 0.6, 1.7, 1.75, M.glass, -0.8, 1.4), bx(1.0, 0.7, 0.05, M.screen, 1.0, 1.6, 1.22)); return g; }
function axes(): THREE.Group {
  const g = G(); g.add(bx(4, 2, 3, M.glass, 2, -1, -1.5));
  for (const [m, eksen] of [[M.red, 'x'], [M.green, 'y'], [M.blue, 'z']] as const) {
    const s = G(); add(s, cy(0.09, 0.09, 3.2, 0, m), at(mesh(new THREE.ConeGeometry(0.25, 0.7, 16), m), 0, 3.5, 0));
    if (eksen === 'x') s.rotation.z = -PI / 2;
    if (eksen === 'z') s.rotation.x = PI / 2;
    g.add(s);
  }
  g.add(sp(0.3, M.accent, 0, 0, 0)); return g;
}

/* ---------- SOĞUTMA / MALZEME ---------- */
// Veri kaleminin kendi rengi (sayı) veridir; yoksa tasarım değişkenindeki varsayılan.
// Kalem verisindeki renk de prototipteki gibi doğrusal okunur (renkler.ts sahneRengi3).
const dogrusal = (v: number | string): THREE.Color => (typeof v === 'number' ? new THREE.Color().setHex(v, THREE.LinearSRGBColorSpace) : new THREE.Color().setStyle(v, THREE.LinearSRGBColorSpace));
const veriRengi = (v: unknown, yedek: string): THREE.Color => (typeof v === 'number' && v ? dogrusal(v) : r3(yedek));
function drop(color: THREE.ColorRepresentation, op: number): THREE.Group {
  const mat = sm(color, 0.1, 0.1, { transparent: true, opacity: op || 0.85 }), g = G();
  add(g, sp(1, mat, 0, 1, 0), at(mesh(new THREE.ConeGeometry(0.98, 1.7, 24, 1, true), mat), 0, 2.1, 0)); return g;
}
function hose(g: THREE.Group): void {
  for (let i = 0; i < 8; i++) { const a = i * 0.18; g.add(sp(0.26, M.orangeRub, -2.6 + Math.sin(a) * 2.2, 4.4 - i * 0.32, 0)); }
  g.add(cy(0.12, 0.06, 2.3, 1.9, M.orangeRub)); son(g).position.x = -0.6;
}
function coolant(it: Kalem): THREE.Group {
  const g = G(), c = veriRengi(it.color, 'sogutma');
  if (it.mode === 'mql') {
    for (let i = 0; i < 9; i++) g.add(sp(0.15 + (i % 3) * 0.08, sm(c, 0.1, 0.1, { transparent: true, opacity: 0.8 }), Math.sin(i * 2.1) * 1.3, 0.6 + i * 0.3, Math.cos(i * 1.7) * 0.8));
    g.add(cy(0.2, 0.2, 4.4, 3.4, M.steel)); son(g).position.x = -1.2; return g;
  }
  if (it.mode === 'air') {
    for (let k = 0; k < 4; k++) { const t = tor(0.6 + k * 0.35, 0.05, M.glass, 0, 0.8 + k * 0.6, 0, PI * 1.5); t.rotation.x = PI / 2; t.rotation.z = k; g.add(t); }
    g.add(cy(0.25, 0.25, 4.6, 3.6, M.steel)); return g;
  }
  if (it.mode === 'tsc') {
    g.add(drill({ id: '', name: '', kind: 'drill', d: 12, z: 2, tm: 'K', coat: 'altin', s: 12 }));
    g.add(cy(0.06, 0.06, -0.5, -9.4, M.cyan));
    for (let j = 0; j < 5; j++) g.add(sp(0.18, M.cyan, (j - 2) * 0.3, -10.4 - (j % 2) * 0.3, 0));
    return g;
  }
  g.add(drop(c, n(it.op))); hose(g); return g;
}
function block(it: Kalem): THREE.Group {
  const g = G(), metal = typeof it['metal'] === 'number' ? it['metal'] : 0.85, rough = n(it['rough']) || 0.32;
  const iso = typeof it['isoCol'] === 'string' && it['isoCol'] ? dogrusal(it['isoCol']) : r3('iso');
  add(g, bx(4, 2.4, 3, sm(veriRengi(it.color, 'malzeme'), metal, rough), 0, 1.2, 0), bx(4.02, 0.4, 3.02, sm(iso, 0.2, 0.5), 0, 0.3, 0));
  return g;
}

/* ---------- ÖLÇÜM ---------- */
function gauge(kind: string | undefined): THREE.Group {
  const g = G();
  switch (kind) {
    case 'g_cal': add(g, bx(9, 0.8, 0.15, M.steel, 0, 0, 0), bx(0.6, 3, 0.15, M.steel, -4.2, -1.1, 0), bx(1.8, 1.4, 0.4, M.steel, -1.6, 0, 0.1), bx(0.6, 2.7, 0.15, M.steel, -2.2, -0.95, 0), bx(1.3, 0.6, 0.05, M.screen, -1.5, 0.15, 0.32)); break;
    case 'g_mic': {
      const f = tor(2.0, 0.35, M.paint, 0, 0, 0, PI * 1.2); f.rotation.z = PI * 0.9; g.add(f);
      add(g, cyX(0.25, 0.25, -2.2, -1.4, M.carb, 0.25, 0), cyX(0.25, 0.25, -0.9, 0.6, M.steel, 0.25, 0), cyX(0.45, 0.45, 0.6, 2.6, M.steel, 0.25, 0), cyX(0.55, 0.55, 2.6, 3.8, M.steel, 0.25, 0));
      for (let i = 0; i < 10; i++) g.add(bx(0.02, 0.1, 0.02, M.dark, 1.1 + i * 0.15, 0.72, 0));
      break;
    }
    case 'g_bore':
      add(g, cy(0.35, 0.35, 5, 0, M.steel), cy(0.6, 0.6, 6.2, 5, M.paintDark), cy(0.9, 0.9, 0, -1.0, M.steel));
      for (let i = 0; i < 3; i++) { const a = i * TAU / 3, pn = bx(1.2, 0.16, 0.16, M.carb, Math.cos(a) * 0.6, -0.5, Math.sin(a) * 0.6); pn.rotation.y = -a; g.add(pn); }
      break;
    case 'g_dial': {
      g.add(bx(2.4, 1.6, 1.6, M.paintDark, 0, 0.8, 0)); g.add(xz(cy(0.12, 0.12, 5, 1.6, M.steel), -0.6, 0)); g.add(cyX(0.08, 0.08, -0.6, 1.6, M.steel, 4.6, 0));
      const d = dial(); d.scale.setScalar(0.5); d.position.set(1.9, 3.8, 0); g.add(d); break;
    }
    case 'g_height': add(g, bx(3, 0.8, 2, M.steel, 0, 0.4, 0), bx(0.5, 7, 0.4, M.steel, -0.6, 4.3, 0), bx(1.4, 1.2, 0.8, M.steel, -0.2, 4, 0), bx(1.2, 0.6, 0.05, M.screen, -0.2, 4.2, 0.45), bx(2.4, 0.15, 0.3, M.carb, 1.4, 3.6, 0)); break;
    case 'g_plug':
      add(g, cyX(0.45, 0.45, -1.8, 1.8, M.paintDark), cyX(0.55, 0.55, 1.8, 3.4, M.steel), cyX(0.56, 0.56, -3.0, -1.8, M.steel), tor(0.46, 0.05, M.green, 1.9, 0, 0), tor(0.46, 0.05, M.red, -1.9, 0, 0));
      cocuk(g, 3).rotation.y = PI / 2; cocuk(g, 4).rotation.y = PI / 2; break;
    case 'g_thread':
      add(g, cyX(0.45, 0.45, -1.8, 1.8, M.paintDark));
      for (let i = 0; i < 10; i++) { const t1 = tor(0.48, 0.07, M.steel, 1.9 + i * 0.13, 0, 0); t1.rotation.y = PI / 2; g.add(t1); }
      for (let i = 0; i < 6; i++) { const t2 = tor(0.48, 0.07, M.steel, -1.9 - i * 0.13, 0, 0); t2.rotation.y = PI / 2; g.add(t2); }
      break;
    case 'g_rough': add(g, bx(3, 1.4, 2, M.paint, 0, 0.7, 0), bx(1.6, 0.8, 0.05, M.screen, 0, 1.0, 1.02), bx(2.4, 0.3, 0.3, M.paintDark, -2.4, 0.6, 0), cy(0.05, 0.05, 0.45, 0.1, M.ruby)); cocuk(g, 3).position.x = -3.5; break;
    default: g.add(bx(2, 2, 2, M.steel));
  }
  return g;
}

/* ---------- SARF ---------- */
function consumable(it: Kalem): THREE.Group {
  const g = G(), c = sm(veriRengi(it.color, 'sarf'), 0.1, 0.5);
  switch (it.mode) {
    case 'bottle': add(g, bx(2.6, 3.6, 1.8, c, 0, 1.8, 0), cy(0.45, 0.45, 4.1, 3.6, M.dark), bx(2.62, 1.2, 1.82, M.white, 0, 1.8, 0), bx(1.0, 0.25, 1.0, c, 0, 3.75, 0)); break;
    case 'spray': add(g, cy(0.8, 0.8, 4, 0, c), cy(0.8, 0.5, 4.4, 4, M.steel), cy(0.35, 0.35, 4.9, 4.4, M.white), cy(0.82, 0.82, 2.6, 1.4, M.white)); break;
    case 'rag': for (let i = 0; i < 3; i++) { const r = bx(4 - i * 0.4, 0.25, 3 - i * 0.3, M.cloth, i * 0.15, 0.13 + i * 0.25, i * 0.1); r.rotation.y = i * 0.25; g.add(r); } break;
    case 'deburr': add(g, cy(0.35, 0.35, 0, -3.5, M.blue), cy(0.12, 0.12, 0.8, 0, M.steel), tor(0.4, 0.06, M.steel, 0.4, 0.9, 0, PI)); break;
    case 'file': add(g, bx(0.9, 6, 0.25, M.dark, 0, 0, 0), cy(0.4, 0.3, -3, -5.4, M.red)); break;
    case 'paper': for (let i = 0; i < 3; i++) { const p = bx(3, 0.04, 2.2, M.paper, i * 0.3, i * 0.06, -i * 0.2); p.rotation.y = i * 0.2; g.add(p); } break;
    case 'glove':
      add(g, bx(2.2, 2.6, 0.7, M.orangeRub, 0, 0, 0), bx(2.2, 1.0, 0.75, M.dark, 0, -1.6, 0));
      for (let i = 0; i < 4; i++) g.add(xz(cy(0.24, 0.24, 1.9, 1.3, M.orangeRub), -0.75 + i * 0.5, 0));
      g.add(xz(cy(0.25, 0.25, 0.8, 0, M.orangeRub), 1.4, 0)); son(g).rotation.z = -0.8; break;
    case 'glasses':
      add(g, cyZ(1.0, 1.0, -0.05, 0.05, M.glass, -1.1, 0), cyZ(1.0, 1.0, -0.05, 0.05, M.glass, 1.1, 0), tor(1.0, 0.07, M.dark, -1.1, 0, 0), tor(1.0, 0.07, M.dark, 1.1, 0, 0),
        bx(0.4, 0.12, 0.12, M.dark, 0, 0.3, 0), bx(0.1, 0.1, 3, M.dark, -2.1, 0.3, -1.5), bx(0.1, 0.1, 3, M.dark, 2.1, 0.3, -1.5)); break;
    case 'marker': add(g, cyX(0.3, 0.3, -2.5, 1.5, M.white), cyX(0.32, 0.32, 1.5, 2.8, c), cyX(0.1, 0.02, -2.9, -2.5, c)); break;
    default: g.add(bx(2, 2, 2, c));
  }
  return g;
}

/* ---------- EK MODELLER: genel takım kütüphanesi ---------- */
function longneck(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = Math.max(r, (n(t.s) || 6) / 20), L = 4.2 + (n(t.ln) || 30) / 10, fl = Math.max(r * 3, 0.45), cm = coat(t);
  add(g, cy(rs, rs, 0, -3.2, M.carb), cy(rs, r * 0.8, -3.2, -3.7, M.carb), cy(r * 0.78, r * 0.78, -3.7, -L + fl, M.carb), cy(r * 0.6, r * 0.6, -L + fl, -L, M.dark), cy(r * 0.97, r * 0.97, -L + 0.04, -L, cm));
  lands(g, r, -L + fl, -L, n(t.z) || 2, 35, cm); return govde(g, 3.2);
}
function taperball(t: Kalem): THREE.Group {
  const g = G(), rs = (n(t.s) || 6) / 20, rt = Math.max(0.04, n(t.d) / 20), L = 6.4, rtop = Math.min(rs, rt + 0.35), cm = coat(t);
  add(g, cy(rs, rs, 0, -3.2, M.carb), cy(rs, rtop, -3.2, -3.5, M.carb), cy(rtop, rt, -3.5, -L, cm));
  for (let i = 0; i < 2; i++) { const f = bx(0.03, L - 3.6, rtop * 1.6, M.dark, 0, -(3.5 + L) / 2, 0); f.rotation.y = i * PI / 2 + 0.3; f.rotation.z = 0.04; g.add(f); }
  const s = mesh(new THREE.SphereGeometry(rt, 18, 9, 0, TAU, PI / 2, PI / 2), cm); s.position.y = -L; g.add(s); return govde(g, 3.2);
}
function lollipop(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = (n(t.s) || n(t.d)) / 20, cm = coat(t);
  add(g, cy(rs, rs, 0, -3.2, M.carb), cy(rs, r * 0.4, -3.2, -3.6, M.carb), cy(r * 0.38, r * 0.38, -3.6, -5.6, M.carb), sp(r, cm, 0, -5.6 - r * 0.8, 0)); return govde(g, 3.2);
}
function engrave(t: Kalem): THREE.Group {
  const g = G(), rs = (n(t.s) || 6) / 20, h = rs * 1.9, cm = coat(t);
  add(g, cy(rs, rs, 0, -3.4, M.carb), cy(rs, 0.015, -3.4, -3.4 - h, cm), bx(0.02, h, rs * 1.6, M.dark, rs * 0.25, -3.4 - h / 2, 0)); return govde(g, 3.4);
}
function barrel(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = (n(t.s) || n(t.d)) / 20, cm = coat(t), pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const a = -0.6 + 1.2 * i / 12; pts.push(new THREE.Vector2(r * 0.55 + r * 0.45 * Math.cos(a * 1.4), -a * r * 2)); }
  add(g, cy(rs, rs, 0, -3.2, M.carb), cy(rs, r * 0.5, -3.2, -3.8, M.carb));
  const m = mesh(new THREE.LatheGeometry(pts, 28), cm); m.position.y = -3.8 - r * 1.25; g.add(m); return govde(g, 3.2);
}
function backchamfer(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = (n(t.s) || 6) / 20, cm = coat(t);
  add(g, cy(rs, rs, 0, -3.2, M.carb), cy(rs, r * 0.35, -3.2, -3.5, M.carb), cy(r * 0.33, r * 0.33, -3.5, -5.2, M.carb), cy(r * 0.33, r, -5.2, -5.2 - r * 0.7, cm), cy(r, r * 0.85, -5.2 - r * 0.7, -5.4 - r * 0.7, cm));
  return govde(g, 3.2);
}
function centerdrill(t: Kalem): THREE.Group {
  const g = G(), R = (n(t.s) || 8) / 20, r = n(t.d) / 20, cm = coat(t), y1 = -3.2 - (R - r * 1.9) * 1.7;
  add(g, cy(R, R, 0, -3.2, M.steel), cy(R, r * 1.9, -3.2, y1, cm), cy(r, r, y1, y1 - r * 2.2, cm));
  const c = mesh(new THREE.ConeGeometry(r, r * 0.7, 18), cm); c.rotation.x = PI; c.position.y = y1 - r * 2.55; g.add(c); return govde(g, 2.6);
}
function csink(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = (n(t.s) || 10) / 20, cm = coat(t);
  add(g, cy(rs, rs, 0, -3.2, M.steel), cy(rs, r, -3.2, -3.4, M.steel), cy(r, 0.03, -3.4, -3.4 - r, cm));
  for (let i = 0; i < 3; i++) { const f = bx(0.05, r * 0.95, r * 1.6, M.dark, 0, -3.4 - r * 0.45, 0); f.rotation.y = i * TAU / 6; g.add(f); }
  return govde(g, 3.2);
}
function stepdrill(t: Kalem): THREE.Group {
  const d = n(t.d), D2 = (n(t.d2) || d * 1.2) / 10, r = d / 20, r2 = D2 / 2, rs = (n(t.s) || d * 1.2) / 20, cm = coat(t), sh = 3, f2 = r2 * 3, f1 = r * 5, g = G();
  add(g, cy(rs, rs, 0, -sh, M.carb), cy(r2 * 0.45, r2 * 0.45, -sh, -sh - f2, M.dark)); lands(g, r2, -sh, -sh - f2, 2, 30, cm);
  g.add(cy(r2, r, -sh - f2, -sh - f2 - 0.1, cm)); g.add(cy(r * 0.45, r * 0.45, -sh - f2 - 0.1, -sh - f2 - f1, M.dark)); lands(g, r, -sh - f2 - 0.1, -sh - f2 - f1, 2, 30, cm);
  const c = mesh(new THREE.ConeGeometry(r * 0.98, r * 0.6, 20), cm); c.rotation.x = PI; c.position.y = -sh - f2 - f1 - r * 0.3; g.add(c); return govde(g, sh);
}
function idrill(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = Math.max(r * 1.3, 1.0), L = r * 2 * (n(t.ld) || 3), y0 = -2.6;
  add(g, cy(rs, rs, 0, -2.2, M.steel), cy(rs * 1.25, rs * 1.25, -2.2, -2.6, M.oxide), cy(r * 0.92, r * 0.92, y0, y0 - L, M.oxide));
  for (const s of [1, -1]) add(g, bx(r * 0.55, L * 0.95, r * 0.5, M.dark, s * r * 0.55, y0 - L / 2, s * r * 0.35));
  add(g, bx(r * 0.5, 0.18, r * 0.35, M.tin, r * 0.4, y0 - L - 0.05, 0), bx(r * 0.5, 0.18, r * 0.35, M.tin, -r * 0.35, y0 - L - 0.03, 0.1));
  return govde(g, 2.0);
}
function indexBody(g: THREE.Group, r: number, y0: number, h: number, mat?: THREE.Material): void { add(g, cy(r, r, y0, y0 - h, mat || M.oxide)); }
function shoulder(t: Kalem): THREE.Group {
  const d = n(t.d), g = G(), r = d / 20, h = Math.max(r * 1.1, 1.6), shank = d <= 32;
  let y0: number;
  if (shank) { const rs = (n(t.s) || d) / 20; add(g, cy(rs, rs, 0, -3, M.steel)); y0 = -3; } else { add(g, cy(r * 0.5, r * 0.5, 0, -0.4, M.oxide)); y0 = -0.4; }
  indexBody(g, r * 0.9, y0, h);
  const adet = n(t.z) || 3;
  for (let i = 0; i < adet; i++) {
    const a = i / adet * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const pk = bx(r * 0.5, h * 0.55, r * 0.45, M.black, ca * r * 0.72, y0 - h + h * 0.27, sa * r * 0.72); pk.rotation.y = -a; g.add(pk);
    const ins = bx(0.08, Math.min(0.9, h * 0.45), r * 0.42, M.tin, ca * r * 0.98, y0 - h + h * 0.24, sa * r * 0.98); ins.rotation.y = -a - 0.2; ins.rotation.z = 0.12; g.add(ins);
  }
  return govde(g, shank ? 3 : 0);
}
function hfmi(t: Kalem): THREE.Group {
  const d = n(t.d), g = G(), r = d / 20, shank = d <= 42, h = Math.max(r * 0.7, 1.0);
  let y0: number;
  if (shank) { const rs = (n(t.s) || Math.min(32, d)) / 20; add(g, cy(rs, rs, 0, -3, M.steel)); y0 = -3; } else { add(g, cy(r * 0.5, r * 0.5, 0, -0.4, M.oxide)); y0 = -0.4; }
  add(g, cy(r * 0.75, r * 0.92, y0, y0 - h, M.oxide));
  const adet = n(t.z) || 3;
  for (let i = 0; i < adet; i++) { const a = i / adet * TAU, ins = bx(r * 0.45, 0.12, r * 0.4, M.tin, Math.cos(a) * r * 0.72, y0 - h - 0.02, Math.sin(a) * r * 0.72); ins.rotation.y = -a; ins.rotation.x = 0.15; g.add(ins); }
  return govde(g, shank ? 3 : 0);
}
function roundins(t: Kalem): THREE.Group {
  const d = n(t.d), g = G(), r = d / 20, rs = (n(t.s) || Math.min(32, d)) / 20, h = Math.max(r * 0.9, 1.2), ri = (n(t.ic) || 10) / 20, adet = n(t.z) || 3;
  add(g, cy(rs, rs, 0, -3, M.steel), cy(r - ri * 0.6, r - ri * 0.3, -3, -3 - h, M.oxide));
  for (let i = 0; i < adet; i++) { const a = i / adet * TAU, c = cyZ(ri, ri, -0.08, 0.08, M.tin, 0, 0, 24); c.position.set(Math.cos(a) * (r - ri), -3 - h + ri * 0.7, Math.sin(a) * (r - ri)); c.rotation.y = -a + PI / 2; g.add(c); }
  return govde(g, 3);
}
function disc(t: Kalem): THREE.Group {
  const g = G(), R = n(t.d) / 20, w = Math.max((n(t.w) || 8) / 10, 0.12), adet = n(t.z) || 10;
  add(g, cy(0.9, 0.9, 0, -2.2, M.steel), cy(1.1, 1.1, -2.2, -2.5, M.oxide), cy(R, R, -2.5, -2.5 - w, M.oxide, 48));
  for (let i = 0; i < adet; i++) { const a = i / adet * TAU, ins = bx(0.32, w * 1.1, 0.18, M.tin, Math.cos(a) * R, -2.5 - w / 2, Math.sin(a) * R); ins.rotation.y = -a; g.add(ins); }
  return govde(g, 0);
}
function longedge(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20, rs = (n(t.s) || n(t.d)) / 20, L = (n(t.lc) || 50) / 10, adet = n(t.z) || 3;
  add(g, cy(rs, rs, 0, -3, M.steel), cy(r * 0.85, r * 0.85, -3, -3 - L, M.oxide));
  for (let i = 0; i < adet; i++) for (let k = 0; k < Math.floor(L / 0.7); k++) { const a = i / adet * TAU + k * 0.35, ins = bx(0.07, 0.6, r * 0.4, M.tin, Math.cos(a) * r * 0.95, -3.3 - k * 0.7, Math.sin(a) * r * 0.95); ins.rotation.y = -a - 0.25; g.add(ins); }
  return govde(g, 3);
}
function boring2(t: Kalem): THREE.Group {
  const g = G(), r = n(t.d) / 20;
  add(g, cy(1.5, 1.5, 0, -1.6, M.steel), cy(1.2, 1.0, -1.6, -3.2, M.oxide));
  for (const s of [1, -1]) add(g, bx(r * 0.8, 0.5, 0.5, M.oxide, s * r * 0.55, -3.4, 0), bx(0.25, 0.3, 0.25, M.tin, s * (r - 0.1), -3.6, 0));
  return govde(g, 0);
}

/* ---------- torna ek ---------- */
function ltIGroove(t: Kalem): THREE.Group {
  const g = G(), r = (n(t.bar) || 2) / 2;
  add(g, cyX(r, r, -12, 1.0, M.oxide), bx(0.35, r * 1.6, 0.6, M.oxide, 1.1, r * 0.4, 0.15), bx(0.3, 0.25, 0.25, M.tin, 1.1, r * 1.3, 0.15)); return g;
}
function ltFaceGroove(): THREE.Group {
  const g = G(), S = 2.5;
  add(g, bx(11, S, S, M.oxide, -6.6, 0, 0), bx(2.6, S, S + 0.4, M.oxide, 0, 0, 0.2), bx(0.32, 1.6, 2.4, M.oxide, 1.1, 0.4, 1.2), bx(0.34, 0.35, 0.5, M.tin, 1.1, 1.3, 2.4)); return g;
}
function ltKnurl(): THREE.Group {
  const g = G(), S = 2.5;
  add(g, bx(10, S, S, M.oxide, -6.5, 0, 0), bx(3, S * 1.3, S * 1.6, M.oxide, -0.3, 0, 0));
  for (const z of [0.8, -0.8]) {
    const w = cyZ(0.7, 0.7, -0.22, 0.22, M.steel, 1.3, 0.4, 24); w.position.z = z; g.add(w);
    for (let k = 0; k < 10; k++) { const b = bx(0.05, 0.05, 0.46, M.dark, 1.3 + Math.cos(k * 0.63) * 0.7, 0.4 + Math.sin(k * 0.63) * 0.7, z); b.rotation.z = k * 0.63; g.add(b); }
  }
  return g;
}

/* ---------- kesici uç (sarf) ---------- */
function insertItem(it: Kalem): THREE.Group {
  const g = G(), ty = it.shape || 'C', ic = n(it.ic) || 1.27, th = n(it['th']) || 0.48;
  const mat = it.coat === 'black' ? M.black : it.coat === 'bright' ? M.bright : it.coat === 'cer' ? M.white : M.tin;
  if (ty === 'G') { add(g, bx(0.3, th, 2.0, mat, 0, th / 2, 0), bx(0.32, th * 1.1, 0.3, M.dark, 0, th / 2, 0.9)); return g; }
  const m = mesh(new THREE.ExtrudeGeometry(insShape(ty === 'A' ? 'C' : ty, ic), { depth: th, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }), mat);
  m.geometry.rotateX(-PI / 2); g.add(m);
  if (ty === 'A') m.scale.set(1.5, 1, 0.75);
  g.add(cy(ic * 0.2, ic * 0.2, th + 0.04, th + 0.035, M.black)); return g;
}

/* ---------- tutucu ek ---------- */
function lholder(it: Kalem): THREE.Group {
  const g = G(), v = it.v || 'vdi_rad';
  const vdiShank = (): void => {
    add(g, cy(0.75, 0.75, 0, -2.6, M.steel));
    for (let i = 0; i < 6; i++) g.add(tor(0.76, 0.04, M.dark, 0, -0.5 - i * 0.3, 0));
    g.children.forEach((c) => { if (c instanceof THREE.Mesh && c.geometry instanceof THREE.TorusGeometry) c.rotation.x = PI / 2; });
  };
  if (v === 'bmt') {
    add(g, bx(3.2, 0.5, 3.2, M.oxide, 0, 0.25, 0), bx(2.4, 2.4, 2.6, M.oxide, 0, 1.7, 0), bx(1.2, 1.2, 2.7, M.dark, 0.5, 2.2, 0));
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) g.add(xz(cy(0.15, 0.15, 0.55, 0.45, M.steel), x * 1.3, z * 1.3));
    return g;
  }
  if (v === 'sleeve') { add(g, cyX(1.2, 1.2, -0.3, 0, M.steel), cyX(0.9, 0.9, 0, 4, M.steel), cyX(0.55, 0.55, -0.31, 4.01, M.dark), bx(4, 0.06, 0.1, M.dark, 2, 0.9, 0)); return g; }
  vdiShank();
  add(g, bx(2.6, 2.2, 2.2, M.oxide, 0, 1.1, 0), bx(2.7, 0.3, 2.3, M.steel, 0, 0.05, 0));
  if (v === 'vdi_rad') add(g, bx(2.8, 0.9, 0.9, M.dark, 0.1, 1.4, 0.7), bx(2.0, 0.7, 0.7, M.black, 1.5, 1.4, 0.7));
  else if (v === 'vdi_ax') add(g, cyZ(0.8, 0.8, 1.1, 1.6, M.steel, 0, 1.1), cyZ(0.6, 0.5, 1.6, 2.1, M.steel, 0, 1.1));
  else if (v === 'vdi_bore' || v === 'udrillh') add(g, cyZ(v === 'udrillh' ? 0.9 : 0.75, v === 'udrillh' ? 0.9 : 0.75, 1.1, 1.3, M.steel, 0, 1.1), cyZ(0.5, 0.5, 1.3, 1.31, M.black, 0, 1.1));
  else if (v === 'live_ax' || v === 'live_rad') { add(g, cy(0.7, 0.7, 2.2, 3.0, M.steel)); g.add(v === 'live_ax' ? cyZ(0.7, 0.55, 1.1, 1.9, M.steel, 0, 1.1) : cyX(0.7, 0.55, 1.3, 2.1, M.steel, 1.1, 0)); }
  return g;
}

/* ---------- bağlama ek ---------- */
function cvise(): THREE.Group {
  const g = G();
  add(g, bx(3, 2.6, 3, M.steel, 0, 1.3, 0), bx(6, 1.0, 2.4, M.vise, 0, 3.1, 0), bx(1.0, 1.0, 2.2, M.oxide, -1.4, 4.1, 0), bx(1.0, 1.0, 2.2, M.oxide, 1.4, 4.1, 0), bx(1.6, 1.2, 1.6, M.alu, 0, 4.2, 0), cyX(0.2, 0.2, 3, 3.6, M.steel, 3.1, 0));
  for (let i = 0; i < 5; i++) g.add(bx(0.05, 0.9, 2.1, M.dark, -0.92, 4.1, 0));
  return g;
}
function tomb(): THREE.Group {
  const g = G(); add(g, bx(6, 0.6, 6, M.steel, 0, 0.3, 0), bx(3, 7, 3, M.oxide, 0, 4.1, 0));
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) add(g, bx(2.4, 1.2, 0.9, M.vise, 0, 1.8 + k * 2.2, s * 1.95), bx(1.2, 0.8, 0.6, M.alu, 0, 1.8 + k * 2.2, s * 2.6));
  return g;
}
function anglePlate(): THREE.Group {
  const g = G(); add(g, bx(5, 0.6, 4, M.oxide, 0, 0.3, 0), bx(5, 4.5, 0.6, M.oxide, 0, 2.55, -1.7), bx(0.5, 4, 3.4, M.oxide, -2.25, 2.3, 0), bx(0.5, 4, 3.4, M.oxide, 2.25, 2.3, 0));
  for (let i = -1; i <= 1; i++) g.add(bx(0.3, 3.4, 0.62, M.dark, i * 1.4, 2.8, -1.7));
  return g;
}
function vblock(): THREE.Group {
  const g = G();
  for (const x of [-1.8, 1.8]) { const j = jaw('j_v'); j.position.x = x; j.rotation.y = PI / 2; g.add(j); }
  g.add(cyX(0.75, 0.75, -3.5, 3.5, M.alu, 1.75, 0)); return g;
}
function mandrel(): THREE.Group {
  const g = G(); add(g, cyZ(2, 2, -1.5, 0, M.steel), cyZ(0.9, 0.7, 0, 3.2, M.steel), cyZ(0.95, 0.95, 0.5, 2.6, M.oxide));
  for (let i = 0; i < 6; i++) g.add(bx(0.06, 0.06, 2.1, M.dark, Math.cos(i) * 0.96, Math.sin(i) * 0.96, 1.55));
  return g;
}
function faceDriver(): THREE.Group {
  const g = G(); add(g, cyZ(2, 2, -1.5, 0, M.steel), cyZ(1.0, 1.0, 0, 1.2, M.oxide), cyZ(0.25, 0.05, 1.2, 1.9, M.carb));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.add(bx(0.15, 0.15, 0.35, M.carb, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 1.3)); }
  return g;
}

/* ---------- ölçüm ek ---------- */
function gauge2(k: string | undefined): THREE.Group {
  const g = G();
  switch (k) {
    case 'g_ring': add(g, cyZ(2, 2, -0.6, 0.6, M.steel, 0, 0, 40), cyZ(1.1, 1.1, -0.61, 0.61, M.black, 0, 0, 40)); g.add(tor(2.0, 0.08, M.dark, 0, 0, 0.6)); return g;
    case 'g_tring':
      add(g, cyZ(2, 2, -0.6, 0.6, M.steel, 0, 0, 40), cyZ(1.1, 1.1, -0.61, 0.61, M.black, 0, 0, 40));
      for (let i = 0; i < 6; i++) g.add(tor(1.12, 0.05, M.steel, 0, 0, -0.5 + i * 0.2));
      g.add(bx(0.5, 0.25, 1.3, M.red, 0, 2.05, 0)); return g;
    case 'g_block': add(g, bx(7, 0.8, 4, M.black, 0, 0.4, 0)); for (let i = 0; i < 12; i++) g.add(bx(0.4, 0.3 + i * 0.12, 1.2, M.bright, -3 + i * 0.52, 0.8 + (0.3 + i * 0.12) / 2, 0.6)); return g;
    case 'g_pin': add(g, bx(7, 0.6, 4, M.black, 0, 0.3, 0)); for (let i = 0; i < 14; i++) g.add(xz(cy(0.08 + i * 0.012, 0.08 + i * 0.012, 2.6, 0.6, M.bright), -3 + i * 0.46, (i % 2) * 0.8 - 0.4)); return g;
    case 'g_depth':
      add(g, bx(5, 0.6, 1.0, M.steel, 0, 0.3, 0), cy(0.4, 0.4, 3.6, 0.6, M.steel), cy(0.5, 0.5, 4.6, 3.6, M.steel), cy(0.12, 0.12, 0, -2.4, M.carb));
      for (let i = 0; i < 8; i++) g.add(bx(0.02, 0.15, 0.02, M.dark, 0.41, 1.2 + i * 0.28, 0));
      return g;
    case 'g_radius': add(g, bx(0.5, 3.5, 0.6, M.black, 0, 0, 0)); for (let i = 0; i < 9; i++) { const gg = G(); gg.add(bx(0.04, 3.2, 1.0, M.bright, 0, 1.6, 0)); gg.rotation.z = -0.6 + i * 0.15; g.add(gg); } return g;
    case 'g_feeler': add(g, bx(0.5, 1.2, 1.0, M.black, 0, 0, 0)); for (let i = 0; i < 12; i++) { const g2 = G(); g2.add(bx(0.02, 5, 0.6, M.bright, 0, 2.5, 0)); g2.rotation.z = -0.5 + i * 0.09; g.add(g2); } return g;
    case 'g_prot': {
      const hd = mesh(new THREE.CylinderGeometry(2, 2, 0.12, 40, 1, false, 0, PI), M.steel); hd.rotation.x = PI / 2; g.add(hd);
      g.add(bx(8, 0.5, 0.1, M.bright, 0, 0, 0.15)); g.add(cyZ(0.3, 0.3, 0, 0.3, M.dark));
      for (let i = 0; i < 18; i++) { const tk = bx(0.03, 0.3, 0.02, M.dark, Math.cos(i * PI / 18) * 1.8, Math.sin(i * PI / 18) * 1.8, 0.08); tk.rotation.z = i * PI / 18 - PI / 2; g.add(tk); }
      return g;
    }
    case 'g_hard':
      add(g, bx(3, 1, 2.6, M.paint, 0, 0.5, 0), bx(1.1, 5.5, 1.6, M.paint, -0.8, 3.7, 0), bx(3, 1.2, 1.6, M.paint, 0.1, 6.4, 0), cy(0.2, 0.06, 5.8, 4.4, M.carb), cy(0.8, 0.8, 1.6, 1.0, M.steel), bx(1.0, 0.7, 0.05, M.screen, 0.3, 6.4, 0.81));
      cocuk(g, 4).position.x = 0.6; cocuk(g, 5).position.x = 0.6; return g;
    case 'z_laser': {
      add(g, bx(6, 0.6, 1.2, M.paintDark, 0, 0.3, 0), bx(0.8, 2.0, 1.0, M.paintDark, -2.6, 1.6, 0), bx(0.8, 2.0, 1.0, M.paintDark, 2.6, 1.6, 0), bx(4.4, 0.04, 0.04, M.red, 0, 2.0, 0), sp(0.12, M.green, -2.6, 2.75, 0.4));
      const isin = cocuk(g, 3);
      if (isin instanceof THREE.Mesh) isin.material = isikli('lazer', 0, 0.3, 'lazer', 1);
      return g;
    }
    case 'z_tset': add(g, cy(1.3, 1.5, 2.2, 0, M.paintDark), cy(0.3, 0.3, 3.0, 2.2, M.steel), bx(1.0, 0.25, 1.0, M.carb, 0, 3.1, 0), sp(0.12, M.green, 1.0, 1.6, 0.8)); return g;
  }
  return gauge(k);
}
function consumable2(it: Kalem): THREE.Group {
  const g = G(), c = sm(veriRengi(it.color, 'sarf'), 0.1, 0.6);
  switch (it.mode) {
    case 'filter':
      add(g, cy(1.2, 1.2, 4, 0, c), cy(1.25, 1.25, 4.2, 4, M.dark), cy(1.25, 1.25, 0.2, 0, M.dark), cy(0.5, 0.5, 4.21, 4.2, M.black));
      for (let i = 0; i < 24; i++) { const r = bx(0.08, 3.7, 0.15, sm(r3('filtre'), 0, 0.9), Math.cos(i / 24 * TAU) * 1.22, 2.05, Math.sin(i / 24 * TAU) * 1.22); r.rotation.y = -i / 24 * TAU; g.add(r); }
      return g;
    case 'ped': for (let i = 0; i < 6; i++) { const p = bx(4, 0.18, 3, sm(r3(i % 2 ? 'ped-1' : 'ped-2'), 0, 1), 0, 0.1 + i * 0.19, 0); p.rotation.y = (i % 3) * 0.04; g.add(p); } return g;
    case 'brush': add(g, bx(0.6, 0.4, 5, sm(r3('firca'), 0, 0.8), 0, 0.6, 0), bx(0.5, 0.6, 2.2, M.steel, 0, 0.1, -1.2)); return g;
    case 'plugs': add(g, cy(0.35, 0.45, 1.2, 0, M.orangeRub), cy(0.35, 0.45, 1.2, 0, M.orangeRub), tor(1.0, 0.04, M.blue, 0, 1.2, 0, PI)); cocuk(g, 0).position.x = -1; cocuk(g, 1).position.x = 1; return g;
    case 'can': add(g, cy(1.0, 1.0, 3.5, 0, c), cy(1.0, 0.5, 3.9, 3.5, M.steel), cy(0.18, 0.12, 5.0, 3.9, M.steel), cy(1.02, 1.02, 2.4, 1.2, M.white)); return g;
    case 'cart': add(g, cy(0.9, 0.9, 5, 0, c), cy(0.92, 0.92, 0.3, 0, M.dark), cy(0.2, 0.2, 5.6, 5, M.white)); return g;
  }
  return consumable(it);
}

/* ---------- TEZGÂHLAR: gerçekçi oranlar (birim: metre) ---------- */
function rboxGeo(w: number, h: number, d: number, r0: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape(), x = -w / 2, z = -d / 2, r = Math.min(r0, w / 2 - 0.001, d / 2 - 0.001);
  s.moveTo(x + r, z); s.lineTo(x + w - r, z); s.quadraticCurveTo(x + w, z, x + w, z + r); s.lineTo(x + w, z + d - r); s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  s.lineTo(x + r, z + d); s.quadraticCurveTo(x, z + d, x, z + d - r); s.lineTo(x, z + r); s.quadraticCurveTo(x, z, x + r, z);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 }); geo.rotateX(-PI / 2); return geo;
}
function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, x?: number, y?: number, z?: number): THREE.Mesh {
  const m = mesh(rboxGeo(w, h, d, r), mat); m.position.set(x || 0, y || 0, z || 0); return m;
}
interface Pencere { x0: number; x1: number; y0: number; y1: number }
interface Kabin { W: number; H: number; D: number; base?: number; slope?: number; slopeWin?: boolean; win: Pencere; floor?: number; doors?: [number, number, number?][] }
function enclosure(o: Kabin): THREE.Group {
  const g = G(), W = o.W, H = o.H, D = o.D, t = 0.035, b = o.base || 0.22, s = o.slope || 0, win = o.win, fz = D / 2 - t / 2, top = H - s;
  g.add(rbox(W - 0.06, b, D - 0.06, 0.06, M.anth, 0, 0, 0));
  add(g, bx(W, H - b, t, M.cab2, 0, b + (H - b) / 2, -D / 2 + t / 2), bx(t, H - b, D, M.cab, -W / 2 + t / 2, b + (H - b) / 2, 0), bx(t, H - b, D, M.cab, W / 2 - t / 2, b + (H - b) / 2, 0));
  add(g, bx(W, t, D - s, M.cab2, 0, H - t / 2, -s / 2));
  if (s) {
    const sl = bx(W, Math.SQRT2 * s, t, M.cab, 0, top + s / 2, D / 2 - s / 2); sl.rotation.x = -PI / 4; g.add(sl);
    if (o.slopeWin) { const sg = bx(win.x1 - win.x0, Math.SQRT2 * s * 0.8, 0.012, M.win, (win.x0 + win.x1) / 2, top + s / 2, D / 2 - s / 2 + 0.015); sg.rotation.x = -PI / 4; g.add(sg); }
  }
  add(g, bx(W, win.y0 - b, t, M.cab, 0, b + (win.y0 - b) / 2, fz), bx(W, top - win.y1, t, M.cab, 0, win.y1 + (top - win.y1) / 2, fz));
  add(g, bx(win.x0 + W / 2, win.y1 - win.y0, t, M.cab, (-W / 2 + win.x0) / 2, (win.y0 + win.y1) / 2, fz), bx(W / 2 - win.x1, win.y1 - win.y0, t, M.cab, (W / 2 + win.x1) / 2, (win.y0 + win.y1) / 2, fz));
  const ww = win.x1 - win.x0, wh = win.y1 - win.y0, wx = (win.x0 + win.x1) / 2, wy = (win.y0 + win.y1) / 2;
  g.add(bx(ww, wh, 0.012, M.win, wx, wy, D / 2 - 0.005));
  add(g, bx(ww + 0.06, 0.03, 0.03, M.frameD, wx, win.y1 + 0.015, D / 2 + 0.005), bx(ww + 0.06, 0.03, 0.03, M.frameD, wx, win.y0 - 0.015, D / 2 + 0.005), bx(0.03, wh, 0.03, M.frameD, win.x0 - 0.015, wy, D / 2 + 0.005), bx(0.03, wh, 0.03, M.frameD, win.x1 + 0.015, wy, D / 2 + 0.005));
  for (const d of o.doors || []) {
    add(g, bx(0.012, top - b - 0.12, 0.012, M.frameD, d[0], b + (top - b) / 2, D / 2 + 0.003), bx(0.012, top - b - 0.12, 0.012, M.frameD, d[1], b + (top - b) / 2, D / 2 + 0.003));
    const hx = d[2] ?? d[1] - 0.07;
    add(g, cy(0.016, 0.016, wy + 0.25, wy - 0.25, M.steel)); son(g).position.set(hx, wy, D / 2 + 0.05);
    add(g, bx(0.03, 0.03, 0.05, M.steel, hx, wy + 0.25, D / 2 + 0.025), bx(0.03, 0.03, 0.05, M.steel, hx, wy - 0.25, D / 2 + 0.025));
  }
  add(g, bx(W + 0.002, 0.05, D + 0.002, M.anth, 0, b + 0.025, 0));
  if (!s) g.add(bx(W + 0.004, 0.08, 0.02, M.anth, 0, H - 0.04, D / 2 + 0.002));
  g.add(bx(W * 0.7, 0.02, 0.05, sm(r3('beyaz'), 0, 0.5, { emissive: r3('lamba-isik'), emissiveIntensity: 1.2 }), 0, top - 0.05, D / 2 - 0.3));
  const fy = o.floor || 0.8;
  add(g, bx(W - 0.1, 0.02, D - 0.1, M.inner, 0, fy, 0), bx(W - 0.08, fy - b, 0.02, M.inner, 0, b + (fy - b) / 2, -D / 2 + 0.06));
  g.add(bx(W - 0.1, H - fy - 0.1, 0.02, M.inner, 0, fy + (H - fy) / 2, -D / 2 + 0.06));
  const ih = top - fy - 0.04;
  add(g, bx(0.012, ih, D - 0.12, M.inner, -W / 2 + t + 0.008, fy + ih / 2, -s / 2), bx(0.012, ih, D - 0.12, M.inner, W / 2 - t - 0.008, fy + ih / 2, -s / 2), bx(W - 0.1, 0.012, D - s - 0.1, M.inner, 0, H - t - 0.008, -s / 2));
  return g;
}
function ctrlPanel(rot?: number): THREE.Group {
  const g = G(), pod = G();
  add(pod, rbox(0.52, 0.84, 0.09, 0.02, M.frameD, 0, -0.42, 0), bx(0.44, 0.56, 0.01, M.scr2, 0, 0.13, 0.046), bx(0.44, 0.2, 0.01, sm(r3('pano-alt'), 0.3, 0.5), 0, -0.27, 0.046));
  add(pod, bx(0.44, 0.04, 0.004, M.scrA, 0, 0.39, 0.052), bx(0.12, 0.2, 0.004, M.scr2, -0.15, 0.21, 0.052), bx(0.26, 0.2, 0.004, isikli('pano-ekran', 0.2, 0.5, 'pano-ekran-isik', 0.8), 0.07, 0.21, 0.052));
  for (let k = 0; k < 4; k++) pod.add(bx(0.09, 0.018, 0.004, k === 1 ? M.scrB : k === 3 ? M.scrC : M.scrA, -0.16, 0.29 - k * 0.045, 0.054));
  for (let k = 0; k < 3; k++) pod.add(bx(0.09, 0.07, 0.004, isikli('pano-tus', 0.2, 0.5, 'pano-tus-isik', 0.7), -0.13 + k * 0.13, -0.03, 0.052));
  pod.add(bx(0.2, 0.006, 0.004, M.scrB, 0.07, 0.24, 0.056)); pod.add(bx(0.14, 0.006, 0.004, M.scrC, 0.04, 0.18, 0.056));
  for (let i = 0; i < 12; i++) pod.add(bx(0.05, 0.03, 0.006, M.paint, -0.17 + (i % 6) * 0.068, -0.23 - Math.floor(i / 6) * 0.06, 0.052));
  add(pod, cyZ(0.032, 0.032, 0.045, 0.07, M.red, 0.19, -0.37, 24), cyZ(0.04, 0.04, 0.045, 0.055, M.yellow, 0.19, -0.37, 24));
  const kb = bx(0.5, 0.025, 0.2, M.frameD, 0, -0.47, 0.12); kb.rotation.x = 0.25; pod.add(kb);
  pod.add(bx(0.46, 0.006, 0.17, sm(r3('klavye'), 0.2, 0.6), 0, -0.455, 0.125)); son(pod).rotation.x = 0.25;
  pod.position.y = 1.62; g.add(pod);
  add(g, bx(0.06, 0.06, 0.35, M.anth, -0.2, 1.4, -0.2));
  g.rotation.y = rot || 0; return g;
}
function stackLight(): THREE.Group {
  const g = G();
  add(g, cy(0.012, 0.012, 0.28, 0, M.steel), cy(0.035, 0.035, 0.36, 0.29, isikli('isik-yesil', 0.1, 0.3, 'isik-yesil-yanar', 0.9)), cy(0.035, 0.035, 0.43, 0.36, isikli('isik-sari', 0.1, 0.3, 'isik-sari-yanar', 0.3)),
    cy(0.035, 0.035, 0.5, 0.43, isikli('isik-kirmizi', 0.1, 0.3, 'isik-kirmizi-yanar', 0.3)), cy(0.03, 0.035, 0.52, 0.5, M.frameD));
  return g;
}
function chipConveyor(len: number, side: number): THREE.Group {
  const g = G(), ang = 0.6, rmp = G();
  add(rmp, bx(len, 0.22, 0.42, M.anth, len / 2, 0, 0), bx(len, 0.03, 0.44, M.cab2, len / 2, 0.12, 0)); rmp.rotation.z = ang; g.add(rmp);
  const tx = Math.cos(ang) * len, ty = Math.sin(ang) * len;
  add(g, bx(0.3, 0.3, 0.44, M.anth, tx + 0.1, ty, 0), bx(0.62, 0.5, 0.55, M.blue, tx + 0.25, 0.25, 0), cy(0.025, 0.025, 0.08, 0, M.dark));
  const heap = mesh(new THREE.SphereGeometry(0.24, 14, 8), M.chips); heap.scale.set(1.1, 0.35, 0.9); heap.position.set(tx + 0.25, 0.5, 0); g.add(heap);
  if (side < 0) g.scale.x = -1;
  return g;
}
function magCabinet(w: number, h: number, d: number): THREE.Group {
  const g = G();
  add(g, rbox(w, h, d, 0.05, M.cab, 0, 0, 0), bx(w * 0.6, h * 0.25, 0.012, M.win, 0, h * 0.62, d / 2 + 0.002), bx(w * 0.62, h * 0.27, 0.01, M.frameD, 0, h * 0.62, d / 2 - 0.002), bx(w + 0.004, 0.05, d + 0.004, M.anth, 0, 0.025, 0));
  for (let i = 0; i < 6; i++) { add(g, cy(0.03, 0.03, h * 0.7, h * 0.56, M.steel)); son(g).position.set(-w * 0.24 + i * w * 0.096, 0, d / 2 - 0.1); }
  return g;
}
function spindleAsm(len: number, r0?: number): THREE.Group {
  const g = G(), r = r0 || 0.09;
  add(g, cy(r, r * 0.9, 0, -len, M.anth), cy(r * 0.75, r * 0.75, -len, -len - 0.03, M.steel), cy(0.04, 0.03, -len - 0.03, -len - 0.11, M.steel), cy(0.012, 0.012, -len - 0.11, -len - 0.2, M.carb));
  return g;
}
function tslotTable(w: number, d: number): THREE.Group {
  const g = G(); g.add(bx(w, 0.08, d, M.steel, 0, 0.04, 0));
  for (let i = 1; i < 5; i++) g.add(bx(w + 0.002, 0.012, 0.018, M.dark, 0, 0.076, -d / 2 + i * d / 5));
  return g;
}
function bellows(w: number, d: number, adet: number): THREE.Group {
  const g = G();
  for (let i = 0; i < adet; i++) g.add(bx(w, 0.02, d / adet * 0.85, M.bellows, 0, 0.01 + (i % 2) * 0.004, -d / 2 + (i + 0.5) * d / adet));
  return g;
}
function partBlock(w: number, h: number, d: number): THREE.Group { const g = G(); add(g, bx(w, h, d, M.alu, 0, h / 2, 0), bx(w * 0.4, 0.004, d * 0.4, M.dark, 0, h + 0.002, 0)); return g; }
function lathePart(r: number, L: number): THREE.Mesh { return cyX(r, r, 0, L, M.alu, 0, 0, 28); }
function chuck3(R: number, len: number): THREE.Group {
  const g = G(); add(g, cyX(R, R, 0, len, M.steel, 0, 0, 36), cyX(R * 0.3, R * 0.3, len, len + 0.002, M.black, 0, 0));
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + PI / 2, j = bx(len * 0.8, R * 0.42, R * 0.3, M.steel, len + len * 0.4, Math.sin(a) * R * 0.62, Math.cos(a) * R * 0.62); j.rotation.x = PI / 2 - a; g.add(j); }
  return g;
}
function turretDisc(R: number, adet: number, w: number): THREE.Group {
  const g = G(); add(g, cyX(R, R, -w / 2, w / 2, M.steel, 0, 0, adet * 2), cyX(R * 0.6, R * 0.6, -w / 2 - 0.05, -w / 2, M.anth, 0, 0));
  for (let i = 0; i < adet; i++) {
    const a = i / adet * TAU, b2 = bx(w * 1.05, 0.06, 0.06, M.oxide, 0, Math.cos(a) * R, Math.sin(a) * R); b2.rotation.x = a; g.add(b2);
    if (i % 2 === 0) { const tl = bx(0.03, 0.09, 0.025, M.carb, 0, Math.cos(a) * (R + 0.06), Math.sin(a) * (R + 0.06)); tl.rotation.x = a; g.add(tl); }
  }
  return g;
}
function yerlestir<T extends Nesne>(g: THREE.Group, o: T, x: number, y: number, z: number): T { o.position.set(x, y, z); g.add(o); return o; }

function machVMC(): THREE.Group {
  const W = 2.4, H = 2.55, D = 2.25, fl = 0.86, g = enclosure({ W, H, D, floor: fl, win: { x0: -0.95, x1: 0.35, y0: 1.0, y1: 2.0 }, doors: [[-1.05, 0.45]] });
  yerlestir(g, tslotTable(1.0, 0.5), -0.3, fl + 0.12, 0.15); g.add(bx(0.9, 0.12, 0.7, M.anth, -0.3, fl + 0.06, 0.1)); yerlestir(g, bellows(1.8, 0.5, 9), -0.3, fl + 0.005, 0.15);
  g.add(bx(0.32, 0.1, 0.16, M.vise, -0.3, fl + 0.25, 0.15)); yerlestir(g, partBlock(0.14, 0.06, 0.1), -0.3, fl + 0.3, 0.15);
  add(g, bx(0.7, H - fl - 0.15, 0.55, M.cab2, -0.3, fl + (H - fl - 0.15) / 2, -0.75), bx(0.4, 0.75, 0.42, M.anth, -0.3, 2.0, -0.38));
  yerlestir(g, spindleAsm(0.32), -0.3, 1.62, -0.3);
  const umb = cy(0.32, 0.32, 2.05, 1.98, M.anth); umb.position.set(-0.95, 0, -0.55); g.add(umb);
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.25, 0, D / 2 + 0.3);
  yerlestir(g, stackLight(), W / 2 - 0.25, H, -D / 2 + 0.3);
  yerlestir(g, chipConveyor(1.0, 1), W / 2 - 0.1, 0.4, -D / 2 + 0.45);
  g.add(rbox(0.8, 1.9, 0.5, 0.03, M.cab2, -0.6, 0, -D / 2 - 0.25));
  return g;
}
function machTrunnion(): THREE.Group {
  const W = 2.5, H = 2.65, D = 2.3, fl = 0.86, g = enclosure({ W, H, D, floor: fl, win: { x0: -0.95, x1: 0.42, y0: 1.0, y1: 2.08 }, doors: [[-1.08, 0.55]] });
  add(g, bx(0.28, 0.42, 0.62, M.anth, -0.78, fl + 0.21, 0.05), bx(0.2, 0.32, 0.5, M.anth, 0.32, fl + 0.16, 0.05), cyX(0.17, 0.17, -0.66, -0.62, M.steel, fl + 0.36, 0.05), cyX(0.14, 0.14, 0.22, 0.26, M.steel, fl + 0.36, 0.05), bellows(1.4, 0.6, 8));
  son(g).position.set(-0.24, fl + 0.005, 0.05);
  const cr = G(); add(cr, bx(1.0, 0.08, 0.58, M.anth, -0.24, -0.1, 0), bx(0.1, 0.2, 0.58, M.anth, -0.72, 0, 0), bx(0.1, 0.2, 0.58, M.anth, 0.24, 0, 0), cy(0.3, 0.3, -0.06, -0.12, M.steel, 40)); cocuk(cr, 3).position.x = -0.24;
  yerlestir(cr, partBlock(0.2, 0.12, 0.16), -0.24, -0.06, 0);
  cr.position.set(0, fl + 0.36, 0.05); cr.rotation.x = -0.45; g.add(cr);
  add(g, bx(0.75, H - fl - 0.15, 0.5, M.cab2, -0.24, fl + (H - fl - 0.15) / 2, -0.82), bx(0.42, 0.85, 0.45, M.anth, -0.24, 2.05, -0.45));
  yerlestir(g, spindleAsm(0.34, 0.1), -0.24, 1.62, -0.36);
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.22, 0, D / 2 + 0.3);
  yerlestir(g, magCabinet(0.7, 2.1, 1.5), -W / 2 - 0.36, 0, -0.2);
  yerlestir(g, stackLight(), W / 2 - 0.25, H, -D / 2 + 0.3);
  yerlestir(g, chipConveyor(1.15, 1), W / 2 - 0.1, 0.42, -D / 2 + 0.5);
  g.add(rbox(0.9, 2.0, 0.55, 0.03, M.cab2, -0.3, 0, -D / 2 - 0.28));
  return g;
}
function swivelHead(len?: number): THREE.Group {
  const g = G(); add(g, bx(0.46, 0.6, 0.5, M.anth, 0, 0.3, 0));
  const j = cy(0.24, 0.24, 0.05, -0.05, M.cab2); j.rotation.z = PI / 4; g.add(j);
  const lw = G(); add(lw, bx(0.3, 0.25, 0.34, M.anth, 0, -0.1, 0));
  const s = spindleAsm(len || 0.3, 0.1); s.position.y = -0.2; lw.add(s); lw.rotation.z = 0.5; lw.position.set(0.05, -0.08, 0); g.add(lw);
  return g;
}
function machSwivel(): THREE.Group {
  const W = 3.0, H = 2.95, D = 2.6, fl = 0.9, g = enclosure({ W, H, D, floor: fl, win: { x0: -1.15, x1: 0.55, y0: 1.02, y1: 2.3 }, doors: [[-1.28, 0.7]] });
  add(g, bx(1.1, 0.2, 0.9, M.anth, -0.3, fl + 0.1, 0.15), xz(cy(0.45, 0.45, fl + 0.32, fl + 0.2, M.steel, 48), -0.3, 0.15));
  yerlestir(g, partBlock(0.3, 0.18, 0.24), -0.3, fl + 0.32, 0.15);
  add(g, bx(0.9, H - fl - 0.15, 0.55, M.cab2, -0.3, fl + (H - fl - 0.15) / 2, -1.0));
  yerlestir(g, swivelHead(0.3), -0.3, 1.9, -0.45);
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.25, 0, D / 2 + 0.32);
  yerlestir(g, magCabinet(0.85, 2.35, 1.8), -W / 2 - 0.44, 0, -0.25);
  yerlestir(g, stackLight(), W / 2 - 0.25, H, -D / 2 + 0.3);
  yerlestir(g, chipConveyor(1.3, 1), W / 2 - 0.1, 0.45, -D / 2 + 0.55);
  g.add(rbox(1.1, 2.1, 0.6, 0.03, M.cab2, -0.3, 0, -D / 2 - 0.3));
  return g;
}
function machGKnew(): THREE.Group {
  const W = 5.4, H = 2.9, D = 2.6, fl = 0.84, g = enclosure({ W, H, D, floor: fl, win: { x0: -2.35, x1: 1.75, y0: 1.05, y1: 2.25 }, doors: [[-2.5, -0.2, -0.3], [-0.2, 1.9, -0.1]] });
  add(g, bx(0.006, 1.25, 0.02, M.frameD, -0.2, 1.65, D / 2 + 0.01));
  yerlestir(g, tslotTable(4.2, 0.85), -0.2, fl + 0.18, 0.25); g.add(bx(4.3, 0.18, 0.8, M.anth, -0.2, fl + 0.09, 0.22));
  g.add(bx(0.02, 1.2, 0.9, sm(r3('gk-cam'), 0.1, 0.1, { transparent: true, opacity: 0.25 }), -0.2, fl + 0.85, 0.25));
  add(g, bx(4.8, 0.1, 0.12, M.steel, -0.2, fl + 0.05, -0.7), bx(4.8, 0.1, 0.12, M.steel, -0.2, fl + 0.05, -1.05));
  add(g, bx(0.9, 1.65, 0.75, M.cab2, -1.2, fl + 0.92, -0.85), bx(0.95, 0.1, 0.8, M.anth, -1.2, fl + 0.1, -0.85));
  yerlestir(g, swivelHead(0.32), -1.2, 1.95, -0.25);
  yerlestir(g, partBlock(0.9, 0.16, 0.4), -1.25, fl + 0.36, 0.25);
  yerlestir(g, partBlock(0.5, 0.2, 0.35), 0.9, fl + 0.36, 0.25);
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.3, 0, D / 2 + 0.35);
  yerlestir(g, magCabinet(0.9, 2.4, 1.9), -W / 2 - 0.46, 0, -0.2);
  yerlestir(g, stackLight(), W / 2 - 0.3, H, -D / 2 + 0.3);
  yerlestir(g, chipConveyor(1.3, 1), W / 2 - 0.1, 0.45, -D / 2 + 0.6);
  g.add(rbox(1.4, 2.1, 0.6, 0.03, M.cab2, 0.6, 0, -D / 2 - 0.3));
  return g;
}
function machLatheNew(): THREE.Group {
  const W = 3.2, H = 2.15, D = 1.95, fl = 0.75, g = enclosure({ W, H, D, floor: fl, slope: 0.4, slopeWin: true, win: { x0: -1.1, x1: 0.55, y0: 0.95, y1: 1.62 }, doors: [[-1.25, 0.7]] });
  const bed = bx(2.7, 0.08, 1.2, M.inner, -0.05, fl + 0.55, -0.45); bed.rotation.x = -PI / 4 - 0.15; g.add(bed);
  add(g, bx(0.62, 0.95, 0.85, M.cab2, -1.15, fl + 0.48, -0.35));
  yerlestir(g, chuck3(0.13, 0.11), -0.84, 1.3, -0.15);
  yerlestir(g, lathePart(0.05, 0.78), -0.6, 1.3, -0.15);
  add(g, bx(0.42, 0.5, 0.4, M.anth, 0.15, 1.5, -0.62)); yerlestir(g, turretDisc(0.24, 12, 0.14), -0.12, 1.55, -0.45);
  add(g, bx(0.4, 0.42, 0.38, M.cab2, 0.55, fl + 0.45, -0.3), bx(0.4, 0.12, 0.5, M.anth, 0.55, fl + 0.2, -0.3), cyX(0.05, 0.05, 0.25, 0.35, M.steel, 1.3, -0.15), cyX(0.005, 0.05, 0.18, 0.25, M.steel, 1.3, -0.15));
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.25, 0, D / 2 + 0.3);
  yerlestir(g, stackLight(), W / 2 - 0.3, H, -D / 2 + 0.25);
  yerlestir(g, chipConveyor(1.1, 1), W / 2 - 0.1, 0.35, -D / 2 + 0.4);
  g.add(rbox(0.9, 1.8, 0.5, 0.03, M.cab2, -0.6, 0, -D / 2 - 0.25));
  add(g, bx(0.5, 0.75, 0.6, M.cab2, -W / 2 - 0.26, 0.375, 0));
  return g;
}
// Yatay işleme merkezi: yatay iş mili, B döner tabla + bağlama kulesi, önde palet değiştirici.
function machHMC(): THREE.Group {
  const W = 3.1, H = 2.75, D = 2.9, fl = 0.9, g = enclosure({ W, H, D, floor: fl, win: { x0: -1.1, x1: 0.55, y0: 1.0, y1: 2.1 }, doors: [[-1.25, 0.65]] });
  add(g, bx(2.2, 0.12, 1.9, M.anth, -0.2, fl + 0.06, -0.1));
  const tb = cy(0.42, 0.42, fl + 0.3, fl + 0.12, M.steel, 40); tb.position.set(-0.25, 0, 0.25); g.add(tb);
  g.add(bx(0.82, 0.06, 0.82, M.anth, -0.25, fl + 0.33, 0.25));
  g.add(bx(0.32, 0.78, 0.32, M.oxide, -0.25, fl + 0.75, 0.25));
  for (const [qx, qz] of [[0, 0.2], [0, -0.2], [0.2, 0], [-0.2, 0]] as const) yerlestir(g, partBlock(0.1, 0.16, 0.08), -0.25 + qx, fl + 0.75, 0.25 + qz);
  add(g, bx(1.0, H - fl - 0.1, 0.6, M.cab2, -0.25, fl + (H - fl - 0.1) / 2, -1.05), bx(0.62, 0.62, 0.55, M.anth, -0.25, fl + 0.85, -0.62));
  const s = spindleAsm(0.42); s.rotation.x = -PI / 2; yerlestir(g, s, -0.25, fl + 0.85, -0.38);
  const apc = G(); add(apc, bx(1.05, 0.5, 0.9, M.cab2, 0, 0.25, 0), cy(0.12, 0.12, 0.75, 0.5, M.steel), bx(0.82, 0.05, 0.82, M.anth, -0.2, 0.78, 0), bx(0.82, 0.05, 0.82, M.anth, 0.22, 0.83, 0));
  yerlestir(g, apc, -0.25, 0, D / 2 + 0.6);
  yerlestir(g, magCabinet(0.9, 2.5, 1.9), W / 2 + 0.46, 0, -0.2);
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.25, 0, D / 2 + 0.3);
  yerlestir(g, stackLight(), W / 2 - 0.3, H, -D / 2 + 0.3);
  yerlestir(g, chipConveyor(1.2, -1), -W / 2 + 0.1, 0.4, -D / 2 + 0.5);
  return g;
}
// Üniversal (konvansiyonel) torna: açık tezgâh, fener mili, araba, dörtlü kalemlik, gezer punta.
function machULathe(): THREE.Group {
  const g = G(), by = 0.95, L = 2.3;
  add(g, bx(0.45, 0.82, 0.5, M.cab2, -0.85, 0.41, 0), bx(0.4, 0.82, 0.5, M.cab2, 0.95, 0.41, 0), bx(L - 0.2, 0.06, 0.62, M.anth, 0.05, 0.84, 0.02));
  add(g, bx(L, 0.2, 0.38, M.anth, 0.05, by, -0.02), bx(L, 0.03, 0.06, M.steel, 0.05, by + 0.115, 0.1), bx(L, 0.03, 0.06, M.steel, 0.05, by + 0.115, -0.12));
  add(g, bx(0.6, 0.55, 0.5, M.cab2, -0.92, by + 0.37, 0), bx(0.6, 0.06, 0.5, M.anth, -0.92, by + 0.66, 0));
  for (const [qx, qz] of [[-1.05, 0.2], [-0.92, 0.2], [-0.79, 0.2]] as const) {
    add(g, cy(0.03, 0.03, by + 0.52, by + 0.44, M.black)); const d = son(g); d.position.set(qx, 0, qz + 0.06); d.rotation.x = PI / 2;
  }
  yerlestir(g, chuck3(0.13, 0.08), -0.62, by + 0.33, 0);
  add(g, cyX(0.04, 0.04, -0.5, -0.1, M.alu, by + 0.33, 0, 24));
  const car = G(); add(car, bx(0.36, 0.06, 0.46, M.anth, 0, 0.14, 0), bx(0.3, 0.28, 0.06, M.cab2, 0, -0.02, 0.24), bx(0.16, 0.06, 0.26, M.steel, 0, 0.2, -0.02), bx(0.1, 0.1, 0.1, M.steel, 0, 0.28, 0.02), bx(0.03, 0.03, 0.12, M.black, 0, 0.29, -0.06));
  const hw = cy(0.07, 0.07, 0.02, -0.02, M.steel, 24); hw.rotation.x = PI / 2; yerlestir(car, hw, -0.08, 0.02, 0.29); yerlestir(g, car, 0.05, by, 0);
  add(g, bx(0.3, 0.3, 0.36, M.cab2, 0.95, by + 0.25, -0.02), cyX(0.035, 0.035, 0.62, 0.8, M.steel, by + 0.33, 0, 20), cyX(0.01, 0.035, 0.55, 0.62, M.steel, by + 0.33, 0, 20));
  add(g, cyX(0.012, 0.012, -0.6, 1.05, M.steel, by - 0.05, 0.2, 12), cyX(0.01, 0.01, -0.6, 1.05, M.steel, by - 0.12, 0.2, 12));
  add(g, bx(L, 0.6, 0.02, M.cab, 0.05, by + 0.35, -0.3));
  return g;
}
function machTFnew(): THREE.Group {
  const W = 3.9, H = 2.75, D = 2.5, fl = 0.8, g = enclosure({ W, H, D, floor: fl, slope: 0.35, slopeWin: true, win: { x0: -1.35, x1: 0.95, y0: 1.0, y1: 2.0 }, doors: [[-1.5, 1.1]] });
  const bed = bx(3.2, 0.08, 1.3, M.inner, 0, fl + 0.6, -0.5); bed.rotation.x = -PI / 4 - 0.1; g.add(bed);
  add(g, bx(0.7, 1.05, 0.9, M.cab2, -1.45, fl + 0.53, -0.35));
  yerlestir(g, chuck3(0.16, 0.12), -1.1, 1.38, -0.15);
  yerlestir(g, lathePart(0.07, 0.75), -0.84, 1.38, -0.15);
  add(g, bx(0.5, 0.6, 0.6, M.cab2, 1.35, fl + 0.6, -0.3)); const ch2 = chuck3(0.1, 0.08); ch2.rotation.y = PI; yerlestir(g, ch2, 1.1, 1.38, -0.15);
  add(g, bx(0.6, 1.2, 0.6, M.cab2, -0.1, 2.15, -0.75));
  const hd = G(); add(hd, bx(0.5, 0.5, 0.5, M.anth, 0, 0, 0)); const s = spindleAsm(0.35, 0.11); s.rotation.z = 0.55; s.position.y = -0.15; hd.add(s); yerlestir(g, hd, -0.1, 1.95, -0.3);
  yerlestir(g, turretDisc(0.2, 12, 0.12), 0.25, 1.05, 0.15);
  yerlestir(g, ctrlPanel(-0.35), W / 2 - 0.25, 0, D / 2 + 0.3);
  yerlestir(g, magCabinet(0.9, 2.55, 2.0), -W / 2 - 0.46, 0, -0.1);
  yerlestir(g, stackLight(), W / 2 - 0.3, H, -D / 2 + 0.3);
  yerlestir(g, chipConveyor(1.25, 1), W / 2 - 0.1, 0.4, -D / 2 + 0.5);
  g.add(rbox(1.2, 2.1, 0.55, 0.03, M.cab2, 0.3, 0, -D / 2 - 0.28));
  return g;
}

function emptyPocket(): THREE.Group {
  const g = G(), geo = new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.2, 1.2, 5, 16, 1));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: sahneRengi3('bos-cep') })));
  return g;
}

/* ---------- ANA FABRİKA ---------- */
type Kurucu = (t: Kalem) => THREE.Group;
const TOOL: Record<string, Kurucu> = {
  endmill, rougher: endmill, ball: endmill, bullnose: endmill, drill, spot, tap, reamer, chamfer, threadmill, tslot, keyseat: tslot, facemill, facemill45: facemill,
  boring, probe, longneck, taperball, lollipop, engrave, barrel, backchamfer, center: centerdrill, csink, stepdrill, idrill, shoulder, hfmi, roundins, disc, longedge, boring2,
};
const LATHE: Record<string, Kurucu> = {
  lt_ext: ltExt, lt_thread: ltExt, lt_bore: ltBore, lt_ithread: ltBore, lt_groove: ltGroove, lt_part: ltPart, lt_udrill: ltUdrill, lt_igroove: ltIGroove,
  lt_facegroove: ltFaceGroove, lt_knurl: ltKnurl,
};

export function build(it: Kalem): THREE.Object3D {
  const k = it.kind;
  if (k === 'empty') return emptyPocket();
  const takim = TOOL[k] ?? LATHE[k];
  if (takim) return takim(it);
  switch (k) {
    case 'm_vmc': return machVMC(); case 'm_5ax': return machTrunnion(); case 'm_5axh': return machSwivel(); case 'm_gk': return machGKnew();
    case 'm_lathe': return machLatheNew(); case 'm_tf': return machTFnew(); case 'm_hmc': return machHMC(); case 'm_ulathe': return machULathe();
    case 'insert': return insertItem(it); case 'lholder': return lholder(it);
    case 'f_cvise': return cvise(); case 'f_tomb': return tomb(); case 'f_angle': return anglePlate(); case 'f_vblock': return vblock(); case 'f_ch6': return chuck(6);
    case 'f_mandrel': return mandrel(); case 'f_drive': return faceDriver();
    case 'z_laser': case 'z_tset': return gauge2(k);
    case 'f_vise': return vise(); case 'f_hvise': return vise({ hyd: true }); case 'f_dvise': return dvise();
    case 'f_zp': return zeroPoint(); case 'f_zpr': return zeroPoint({ riser: true });
    case 'f_mag': return magTable(); case 'f_vac': return vacTable(); case 'f_clamp': return clampSet();
    case 'f_custom': return customFix(); case 'f_rot4': return rot4();
    case 'f_ch3': return chuck(3); case 'f_ch4': return chuck(4); case 'f_collet': return colletChuck();
    case 'f_chtail': return chuckTail(); case 'f_steady': return chuckTail({ steady: true }); case 'f_face': return facePlate();
    case 'z_probe': return probe(); case 'z_edge': return edgeFinder(); case 'z_dial': return dial(); case 'z_touch': return touchOff();
    case 'z_pin': return zeroPin(); case 'z_arm': return toolArm(); case 'z_optic': return optical();
    case 'wcs': return axes(); case 'cool': return coolant(it); case 'mat': return block(it);
    case 'gauge': return gauge2(it.g); case 'cons': return consumable2(it);
    case 'holder':
      if (it.ht === 'lathe') { const lg = G(); add(lg, cy(2.6, 2.0, 3.2, 0, M.steel, 3), cy(3.15, 3.15, 0, -1.0, M.steel), bx(2.5, 4, 2.5, M.oxide, 0, -3, 0)); return lg; }
      return holder(it.taper, it.ht, (n(it.dia) || 10) / 20).g;
  }
  if (k === 'j_grip') return jaw('j_hard');
  if (k.startsWith('j_') || k.startsWith('lj_')) return jaw(k);
  return G();
}

const sapBoyu = (o: Nesne): number => (typeof o.userData['shank'] === 'number' ? o.userData['shank'] : 0);

// Takım + tutucu montajı (önizleme, magazin).
export function assembly(t: Kalem, mach: Tezgah): THREE.Object3D {
  const g = G(), freze = TOOL[t.kind], torna = LATHE[t.kind];
  if (freze && (mach.type === 'mill' || mach.type === 'millturn' || t.live)) {
    const tool = freze(t), taper = t.live ? 'HSK-A63' : mach.taper;
    if (t.live) {
      const lb = G(); add(lb, bx(5, 3, 4, M.oxide, 0, 2.6, 0), cy(1.6, 1.6, 1.1, -0.4, M.steel), cy(1.2, 1.2, -0.4, -1.4, M.steel)); g.add(lb);
      tool.position.y = -1.4 + Math.min(2, sapBoyu(tool) * 0.6); g.add(tool); return g;
    }
    const hd = holder(taper, htype(t), n(t.d) / 20);
    g.add(hd.g); tool.position.y = hd.bot + Math.min(hd.ins, sapBoyu(tool) * 0.7); g.add(tool); return g;
  }
  if (torna) {
    const lt = torna(t);
    if (mach.type === 'millturn') { const cap = G(); add(cap, cyX(2.6, 2.0, -15.5, -12.3, M.steel, 0, 0, 3), cyX(3.15, 3.15, -12.3, -11.3, M.steel)); g.add(cap); }
    else { g.add(bx(4, 4, 4.6, M.oxide, -9.5, 0, 0)); g.add(cyX(1.9, 1.9, -15, -11.5, M.steel)); }
    g.add(lt); return g;
  }
  if (freze) {
    // Tornada eksenel takım.
    const tl = freze(t), hb = G(); add(hb, bx(4.6, 4, 4, M.oxide, 0, 2.2, 0), cy(1.9, 1.9, 7.8, 4.2, M.steel)); g.add(hb);
    tl.position.y = 0.2 + Math.min(2, sapBoyu(tl) * 0.6); g.add(tl); return g;
  }
  return build(t);
}

export function fit(obj: THREE.Object3D, size: number): THREE.Object3D {
  const o = G(); o.add(obj); o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), mx = Math.max(s.x, s.y, s.z) || 1;
  obj.scale.multiplyScalar(size / mx); o.updateMatrixWorld(true); b.setFromObject(o);
  obj.position.sub(b.getCenter(new THREE.Vector3())); o.updateMatrixWorld(true); return o;
}

// Geometriler bırakılır; malzeme yalnız `own` işaretliyse (ortak malzemeler kalır).
export function dispose(o: THREE.Object3D): void {
  o.traverse((d) => {
    if (d instanceof THREE.Sprite) return;
    if (d instanceof THREE.Mesh || d instanceof THREE.LineSegments || d instanceof THREE.Points) {
      const geo: unknown = d.geometry;
      if (geo instanceof THREE.BufferGeometry) geo.dispose();
      const mats: unknown = d.material;
      for (const m of Array.isArray(mats) ? mats : [mats]) if (m instanceof THREE.Material && m.userData['own']) m.dispose();
    }
  });
}

export { htype, isLatheTool, isMillTool };

export const CNC3D = { build, assembly, fit, dispose, isLatheTool, isMillTool, htype, M };
