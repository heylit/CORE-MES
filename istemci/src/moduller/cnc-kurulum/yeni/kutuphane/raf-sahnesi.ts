// 3B raf (prototip 17883-18304): her süzgeç sonucu bir raf satırı, raftaki her kalem bir kaide. Satır yalnız kameraya
// yaklaşınca kurulur (prototipteki gibi); dokular ve geometriler raf yeniden kurulurken bırakılır.
import * as THREE from 'three';
import { CNC3D } from '../sahne/cnc3d.ts';
import { draw, glAl, lights, rr } from '../sahne/gl.ts';
import type { Dikdortgen } from '../sahne/Sahne.tsx';
import { clamp, upTR } from '../bicim.ts';
import { invKey, stockOf } from '../secici.ts';
import { rafRengi, type Kalem, type Raf } from './raf.ts';

const { build, dispose, fit, isLatheTool } = CNC3D;

const PI = Math.PI;
export const LSP = 2.3;
export const LSH = 3.3;

// Tasarım değişkeni okunur; tuval ve 3B malzeme CSS değişkeni bilmez.
export function renk(ad: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
}
const yazi = (): string => renk('--font-ana') || 'sans-serif';
const mono = (): string => renk('--font-mono') || 'monospace';

const ETIKET_TONU: Record<string, [string, string]> = { none: ['--idle', '--ink'], ok: ['--run', '--ink'], low: ['--hazard', '--on-hazard'], short: ['--stop', '--ink'] };

function doku(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = glAl()?.maxAniso ?? 1;
  return t;
}

function etiketDokusu(it: Kalem): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 168;
  const x = c.getContext('2d')!;
  const s = stockOf(invKey(it));
  x.fillStyle = renk('--panel-solid'); rr(x, 2, 2, 508, 164, 16); x.fill(); x.strokeStyle = renk('--edge2'); x.lineWidth = 3; x.stroke();
  x.textBaseline = 'alphabetic'; x.fillStyle = renk('--ink'); x.font = '700 30px ' + yazi(); draw(x, it.name, 18, 44, 476, 1, 34);
  x.fillStyle = renk('--muted'); x.font = '500 21px ' + mono(); draw(x, it.code ?? '', 18, 76, 476, 1, 24);
  const P = ETIKET_TONU[s.st]!;
  const txt = s.st === 'none' ? 'Stok girilmedi' : String(s.qty) + ' adet · depoda ' + String(s.avail);
  x.font = '700 24px ' + yazi();
  const w = x.measureText(txt).width + 32;
  x.fillStyle = renk(P[0]); rr(x, 18, 100, w, 46, 23); x.fill(); x.fillStyle = renk(P[1]); x.fillText(txt, 34, 131);
  if (s.used) { x.fillStyle = renk('--sahne3b-vurgu'); x.font = '700 23px ' + yazi(); x.textAlign = 'right'; x.fillText(String(s.used) + ' aktif', 494, 131); x.textAlign = 'left'; }
  return doku(c);
}

function levhaDokusu(row: Raf): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const x = c.getContext('2d')!;
  x.fillStyle = renk('--panel-solid'); rr(x, 2, 2, 508, 196, 18); x.fill(); x.fillStyle = renk(rafRengi(row.key)); rr(x, 2, 2, 12, 196, 6); x.fill();
  x.fillStyle = renk('--ink'); x.font = '800 40px ' + yazi(); draw(x, upTR(row.title), 36, 72, 450, 2, 46);
  x.fillStyle = renk('--muted'); x.font = '600 26px ' + yazi(); x.fillText(String(row.items.length) + ' kalem', 36, 172);
  return doku(c);
}

interface Yuva { it: Kalem; x: number; g: THREE.Group; lm: THREE.MeshBasicMaterial; hit: THREE.Mesh; model: THREE.Object3D }
interface Satir extends Raf { g: THREE.Group; built: boolean; slots: Yuva[]; mats: THREE.Material[] }

export class RafSahnesi {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private readonly root = new THREE.Group();
  private readonly hi: THREE.Mesh;
  private readonly shelfMat: THREE.MeshStandardMaterial;
  private readonly backMat: THREE.MeshStandardMaterial;
  private readonly pedMat: THREE.MeshStandardMaterial;
  private readonly hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private readonly LG = {
    ped: new THREE.CylinderGeometry(0.78, 0.82, 0.06, 40), label: new THREE.PlaneGeometry(2.1, 0.69), hit: new THREE.BoxGeometry(2.1, 2.2, 1.6),
    up: new THREE.BoxGeometry(0.12, LSH, 0.12), sign: new THREE.PlaneGeometry(3.0, 1.17),
  };
  private readonly ray = new THREE.Raycaster();
  rows: Satir[] = [];
  cx = 0;
  cy = 0;
  px = 60;
  mx = 0;
  my = 0;
  private pick: THREE.Object3D[] = [];

  constructor() {
    this.scene.environment = glAl()?.envTex ?? null;
    this.scene.fog = new THREE.Fog(new THREE.Color(renk('--bg')), 9, 21);
    lights(this.scene, 1);
    this.scene.add(this.root);
    const vurgu = new THREE.Color(renk('--sahne3b-vurgu'));
    this.hi = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 10, 48), new THREE.MeshStandardMaterial({ color: vurgu, metalness: 0.3, roughness: 0.4, emissive: vurgu, emissiveIntensity: 0.35 }));
    this.hi.rotation.x = PI / 2;
    this.scene.add(this.hi);
    this.shelfMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk('--sahne3b-raf')), metalness: 0.75, roughness: 0.45 });
    this.backMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk('--sahne3b-koyu')), metalness: 0.3, roughness: 0.8 });
    this.pedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk('--sahne3b-celik-koyu')), metalness: 0.6, roughness: 0.4 });
  }

  private paylasilan(g: THREE.BufferGeometry): boolean {
    return Object.values(this.LG).includes(g as never);
  }

  private birak(row: Satir): void {
    this.root.remove(row.g);
    if (!row.built) return;
    row.g.traverse((n) => { const m = n as THREE.Mesh; if (m.geometry && !this.paylasilan(m.geometry) && !(n as THREE.Sprite).isSprite) m.geometry.dispose(); });
    row.mats.forEach((m) => { const b = m as THREE.MeshBasicMaterial; if (b.map) b.map.dispose(); m.dispose(); });
  }

  // Satırlar süzgeç değişince yeniden kurulur; önceki satırın yeri anahtarla korunur.
  kur(raflar: Raf[], oncekiAnahtar: string | undefined, r: number): number {
    this.rows.forEach((row) => { this.birak(row); });
    this.rows = raflar.map((s) => ({ ...s, g: new THREE.Group(), built: false, slots: [], mats: [] }));
    let yeniR = r;
    this.rows.forEach((row, ri) => { row.g.position.y = -ri * LSH; this.root.add(row.g); if (row.key === oncekiAnahtar) yeniR = ri; });
    return clamp(yeniR, 0, Math.max(0, this.rows.length - 1));
  }

  private satirKur(row: Satir, ri: number): void {
    row.built = true;
    const n = row.items.length, g = row.g;
    const col = new THREE.Color(renk(rafRengi(row.key)));
    const x0 = -LSP * 0.75, x1 = (n - 1) * LSP + LSP * 0.75, len = x1 - x0, cx = (x0 + x1) / 2;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 1.8), this.shelfMat); plank.position.set(cx, -0.07, 0); g.add(plank);
    const em = new THREE.MeshBasicMaterial({ color: col, toneMapped: false }); row.mats.push(em);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.025, 0.03), em); edge.position.set(cx, -0.03, 0.92); g.add(edge);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, LSH - 0.3, 0.06), this.backMat); back.position.set(cx, (LSH - 0.3) / 2 - 0.14, -0.92); g.add(back);
    for (let x = x0; x <= x1 + 0.01; x += LSP * 4) { const ub = new THREE.Mesh(this.LG.up, this.shelfMat); ub.position.set(x, LSH / 2 - 0.2, -0.86); g.add(ub); }
    [x0, x1].forEach((xe) => { [0.86, -0.86].forEach((z) => { const u = new THREE.Mesh(this.LG.up, this.shelfMat); u.position.set(xe, LSH / 2 - 0.2, z); g.add(u); }); });
    const sm = new THREE.MeshBasicMaterial({ map: levhaDokusu(row), transparent: true, toneMapped: false }); row.mats.push(sm);
    const sign = new THREE.Mesh(this.LG.sign, sm); sign.position.set(x0 - 1.75, 0.75, 0.3); sign.rotation.y = 0.25; g.add(sign);
    row.items.forEach((it, k) => {
      const sg = new THREE.Group(); sg.position.x = k * LSP; g.add(sg);
      const ped = new THREE.Mesh(this.LG.ped, this.pedMat); ped.position.y = 0.03; sg.add(ped);
      const lm = new THREE.MeshBasicMaterial({ map: etiketDokusu(it), transparent: true, toneMapped: false }); row.mats.push(lm);
      const lab = new THREE.Mesh(this.LG.label, lm); lab.position.set(0, -0.52, 0.96); lab.rotation.x = -0.12; sg.add(lab);
      const hit = new THREE.Mesh(this.LG.hit, this.hitMat); hit.position.y = 0.8; hit.userData = { row: ri, k }; sg.add(hit);
      const m = build(it); if (isLatheTool(it)) m.rotation.y = -0.35;
      const o = fit(m, 1.55), b = new THREE.Box3().setFromObject(o); o.position.y = -b.min.y + 0.07; o.rotation.y = -0.5; sg.add(o);
      row.slots.push({ it, x: k * LSP, g: sg, lm, hit, model: o });
    });
  }

  // Stok değişince yalnız etiket dokusu yenilenir (raf yeniden kurulmaz).
  etiketleriYenile(keys: string[] | null): void {
    this.rows.forEach((row) => row.slots.forEach((s) => {
      if (keys && !keys.includes(invKey(s.it))) return;
      s.lm.map?.dispose(); s.lm.map = etiketDokusu(s.it); s.lm.needsUpdate = true;
    }));
  }

  // Bir kare: kamera seçili kaleme yumuşak gider (kk sürüklemede k2), yakın satırlar kurulur.
  kare(o: { renderer: THREE.WebGLRenderer; rect: Dikdortgen; dt: number; r: number; k: number; dragR: number | null; dragK: number | null }): void {
    const { rect, dt } = o;
    // GL bağlamı ilk 3B çizimde kurulur; sahne ondan önce yaratılmış olabilir.
    this.scene.environment ??= glAl()?.envTex ?? null;
    if (rect.width <= 10 || !this.rows.length) return;
    const kk = 1 - Math.pow(0.0008, dt), k2 = 1 - Math.pow(0.0002, dt);
    const asp = rect.width / Math.max(1, rect.height), t = Math.tan(20 * PI / 180);
    const dist = Math.max(asp < 1 ? 7.5 : 9.8, (asp < 1 ? 1.9 : 3.6) / (t * asp));
    this.px = rect.height / (2 * dist * t);
    const tr = o.dragR ?? o.r, tk = o.dragK ?? o.k, kx = o.dragK != null || o.dragR != null ? k2 : kk;
    this.cy += (-tr * LSH - this.cy) * kx; this.cx += (tk * LSP - this.cx) * kx;
    const half = dist * t * asp + LSP;
    this.pick.length = 0;
    this.rows.forEach((row, ri) => {
      const dy = Math.abs(-ri * LSH - this.cy) / LSH;
      if (dy <= 1.6 && !row.built) this.satirKur(row, ri);
      row.g.visible = row.built && dy <= 2.2;
      if (row.g.visible) row.slots.forEach((s) => { const vis = Math.abs(s.x - this.cx) < half + 1; s.g.visible = vis; if (vis && (ri === o.r || dy < 1.2)) this.pick.push(s.hit); });
    });
    const row = this.rows[o.r], s = row?.built ? row.slots[o.k] : undefined;
    if (s) { this.hi.visible = true; this.hi.position.set(s.x, -o.r * LSH + 0.08, 0); s.model.rotation.y += dt * 0.9; } else this.hi.visible = false;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist - 0.5; fog.far = dist + 12;
    this.cam.aspect = asp; this.cam.fov = 40; this.cam.updateProjectionMatrix();
    this.cam.position.set(this.cx + this.mx * 0.7, this.cy + 2.2 - this.my * 0.5, dist); this.cam.lookAt(this.cx, this.cy + 0.35, 0);
    o.renderer.render(this.scene, this.cam);
  }

  sec(rect: Dikdortgen, cx: number, cy: number): { row: number; k: number } | null {
    const nx = ((cx - rect.left) / rect.width) * 2 - 1, ny = -((cy - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.cam);
    const hit = this.ray.intersectObjects(this.pick, false)[0];
    return hit ? hit.object.userData as { row: number; k: number } : null;
  }

  birakHepsi(): void {
    this.rows.forEach((row) => { this.birak(row); });
    this.rows = [];
    Object.values(this.LG).forEach((g) => { g.dispose(); });
  }
}
