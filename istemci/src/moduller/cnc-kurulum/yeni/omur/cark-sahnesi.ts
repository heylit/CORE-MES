import {
  AdditiveBlending, ConeGeometry, CylinderGeometry, Fog, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  Raycaster, Scene, type Material, type Object3D, type WebGLRenderer,
} from 'three';
import {
  ALPHA, BETA, CH, clamp, CR, CW, envTex, FOV, GEO, gearG, gearMat, glowTex, lights, pawlMat, R, SP, spokeG, sstep,
} from './cekirdek.ts';
import { lwLabelTex, lwTex } from './dokular.ts';
import { sahneRengi, type OmurPaleti } from './renk.ts';
import { satirKotu, type CarkSatiri } from './takip.ts';
import type { CarkKarti } from './tipler.ts';

// Takım ömrü çarkı (prototipin LW'si): satırlar tezgâh ve depo grupları, satırdaki kartlar takımlar. Tekerlek ve dikey sürükleme
// satır, yatay sürükleme ve ◀ ▶ kart seçer; dokunuş kartı seçer. Kart dokuları satırın sürümü değişince yeniden çizilir.

interface KartVerisi { fm: MeshStandardMaterial; faceM: MeshBasicMaterial; glowM: MeshBasicMaterial; sc: number; gl: number; row: number; k: number }
interface Satir { pivot: Group; car: Group; cards: Group[]; lm: MeshBasicMaterial; label: Mesh; lfrac: number; mats: Material[]; d: CarkSatiri; ver: number }
export interface CarkSecimi { sel: number; cur: number }
export interface Dikdortgen { left: number; top: number; width: number; height: number }

const PI = Math.PI;

export class OmurCarki {
  readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(FOV, 1, 0.1, 100);
  readonly drum = new Group();
  rows: (Satir | null)[] = [];
  defs: CarkSatiri[] = [];
  active = 0;
  cur = 0;
  anim: Record<string, CarkSecimi> = {};
  ver = 1;
  rect: Dikdortgen | null = null;
  px = 50;
  thMax = 1.1;
  pick: Object3D[] = [];
  dragR: number | null = null;
  dragK: number | null = null;
  mx = 0;
  my = 0;
  dist = 10.2;
  half = 4;
  private lastW = 0;
  private lastH = 0;
  private readonly gears = [new Mesh(gearG, gearMat), new Mesh(gearG, gearMat)];
  private readonly pawls: Mesh[];
  private readonly ray = new Raycaster();
  private surukle: { x: number; y: number; axis: 'x' | 'y' | null; r0: number; k0: number } | null = null;
  private tekerX = 0;
  private tekerY = 0;
  private tekerSon = 0;

  // `degisti`: seçili satır ya da kart değişti (yan panel yeniden çizilir).
  private palet: OmurPaleti;
  private readonly degisti: () => void;

  constructor(palet: OmurPaleti, degisti: () => void) {
    this.palet = palet;
    this.degisti = degisti;
    this.scene.environment = envTex;
    this.scene.fog = new Fog(sahneRengi(palet.arka), 13, 27);
    lights(this.scene, 1);
    this.scene.add(this.drum);
    this.gears.forEach((g) => {
      this.drum.add(g);
      for (let s = 0; s < 3; s++) { const sp = new Mesh(spokeG, gearMat); sp.rotation.x = s * PI / 3; g.add(sp); }
    });
    const axle = new Mesh(new CylinderGeometry(0.35, 0.35, 30, 24), gearMat);
    axle.rotation.z = PI / 2;
    this.drum.add(axle);
    this.pawls = [0, 1].map(() => { const m = new Mesh(new ConeGeometry(0.22, 0.55, 3), pawlMat); m.rotation.x = -PI / 2; this.scene.add(m); return m; });
  }

  paletDegisti(p: OmurPaleti): void { this.palet = p; (this.scene.fog as Fog).color = sahneRengi(p.arka); this.ver++; }

  // Satırlar yeniden okunur; seçili satır anahtarıyla korunur (`keep` false ise sıra korunur).
  refresh(defs: CarkSatiri[], keep = true): void {
    const prev = this.defs[this.active]?.key;
    this.defs = defs; this.ver++;
    if (keep && prev) defs.forEach((d, i) => { if (d.key === prev) this.active = i; });
    this.active = clamp(this.active, 0, defs.length - 1);
    defs.forEach((d) => {
      const a = this.anim[d.key] || (this.anim[d.key] = { sel: 0, cur: 0 });
      a.sel = clamp(a.sel, 0, Math.max(0, d.cards.length - 1)); a.cur = clamp(a.cur, 0, Math.max(0, d.cards.length - 1));
    });
  }

  selCard(): CarkKarti | null {
    const d = this.defs[this.active];
    if (!d) return null;
    return d.cards[this.anim[d.key]!.sel] ?? null;
  }

  goRow(i: number): void {
    i = clamp(Math.round(i), 0, this.defs.length - 1);
    if (i === this.active) return;
    this.active = i; this.degisti();
  }

  setSel(k: number): void {
    const d = this.defs[this.active];
    if (!d || !d.cards.length) return;
    const a = this.anim[d.key]!;
    k = clamp(Math.round(k), 0, d.cards.length - 1);
    if (k === a.sel) return;
    a.sel = k; this.degisti();
  }

  // Satır ve kart doğrudan seçilir (Ana Sayfa'dan gelen tezgâh/cep, çark satırları listesi, yenileme tablosu).
  // Kart koşulla ya da sırayla seçilir (sıra satırın kart sayısına kırpılır).
  sec(satirAnahtari: string, kart?: ((c: CarkKarti) => boolean) | number): boolean {
    const i = this.defs.findIndex((d) => d.key === satirAnahtari);
    if (i < 0) return false;
    this.active = i;
    const d = this.defs[i]!;
    if (typeof kart === 'number') this.anim[d.key]!.sel = Math.max(0, Math.min(kart, d.cards.length - 1));
    else if (kart) { const k = (d.cards as CarkKarti[]).findIndex(kart); if (k >= 0) this.anim[d.key]!.sel = k; }
    this.degisti();
    return true;
  }

  tus(e: KeyboardEvent): void {
    const tg = (e.target as HTMLElement | null)?.tagName;
    if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
    const k = e.key, d = this.defs[this.active], a = d && this.anim[d.key];
    let h = true;
    if (k === 'ArrowDown' || k === 's' || k === 'S') this.goRow(this.active + 1);
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') this.goRow(this.active - 1);
    else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && a) this.setSel(a.sel + 1);
    else if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && a) this.setSel(a.sel - 1);
    else if (k === 'Home') this.setSel(0);
    else if (k === 'End') this.setSel(1e6);
    else h = false;
    if (h) e.preventDefault();
  }

  basla(e: PointerEvent, el: HTMLElement): void {
    if ((e.target as HTMLElement | null)?.closest?.('button,input,select,.nocam')) return;
    const d = this.defs[this.active];
    this.surukle = { x: e.clientX, y: e.clientY, axis: null, r0: this.active, k0: d ? this.anim[d.key]!.sel : 0 };
    try { el.setPointerCapture(e.pointerId); } catch { /* yakalama yoksa sürükleme yine çalışır */ }
  }

  tasi(e: PointerEvent): void {
    if (this.rect) { this.mx = (e.clientX - this.rect.left) / this.rect.width - 0.5; this.my = (e.clientY - this.rect.top) / this.rect.height - 0.5; }
    const g = this.surukle;
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, d = this.defs[this.active];
    if (!g.axis && Math.hypot(dx, dy) > 8) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'y') this.dragR = clamp(g.r0 - dy / (this.px * R * ALPHA), 0, this.defs.length - 1);
    if (g.axis === 'x' && d) this.dragK = clamp(g.k0 - dx / (this.px * SP), 0, Math.max(0, d.cards.length - 1));
  }

  bitir(e: PointerEvent): void {
    const g = this.surukle;
    if (!g) return;
    if (!g.axis && e.type === 'pointerup' && this.rect) {
      const nx = ((e.clientX - this.rect.left) / this.rect.width) * 2 - 1, ny = -((e.clientY - this.rect.top) / this.rect.height) * 2 + 1;
      this.ray.setFromCamera({ x: nx, y: ny } as never, this.cam);
      const hit = this.ray.intersectObjects(this.pick, false)[0];
      if (hit) {
        const u = hit.object.userData as KartVerisi;
        this.active = u.row;
        const d = this.defs[this.active];
        if (d && d.cards.length) this.anim[d.key]!.sel = u.k;
        this.degisti();
      }
    } else if (g.axis === 'y' && this.dragR != null) {
      const r = this.dragR; this.cur = r; this.dragR = null; this.goRow(r);
    } else if (g.axis === 'x' && this.dragK != null) {
      const k = this.dragK, d2 = this.defs[this.active];
      if (d2) this.anim[d2.key]!.cur = k;
      this.dragK = null; this.setSel(k);
    }
    this.surukle = null; this.dragR = null; this.dragK = null;
  }

  surukleniyor(): boolean { return this.surukle !== null; }

  teker(e: WheelEvent): void {
    e.preventDefault();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 33; dy *= 33; }
    if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) { dx = dy; dy = 0; }
    if (Math.abs(dx) > Math.abs(dy)) { this.tekerX += dx; this.tekerY = 0; } else { this.tekerY += dy; this.tekerX = 0; }
    const now = performance.now();
    if (now - this.tekerSon < 85) return;
    const d = this.defs[this.active];
    if (Math.abs(this.tekerY) >= 40) { this.goRow(this.active + (this.tekerY > 0 ? 1 : -1)); this.tekerY = 0; this.tekerSon = now; }
    else if (Math.abs(this.tekerX) >= 40 && d) { this.setSel(this.anim[d.key]!.sel + (this.tekerX > 0 ? 1 : -1)); this.tekerX = 0; this.tekerSon = now; }
  }

  private buildRow(i: number): Satir {
    const d = this.defs[i]!, pivot = new Group(), row = new Group(), car = new Group(), mats: Material[] = [];
    pivot.rotation.x = i * ALPHA; row.position.z = R; car.position.z = -CR; pivot.add(row); row.add(car);
    const list: (CarkKarti | null)[] = d.cards.length ? d.cards : [null];
    const cards = list.map((c, k) => {
      const g = new Group(), fm = new MeshStandardMaterial({ color: sahneRengi(this.palet.zemin), metalness: 0.6, roughness: 0.4, transparent: true });
      const tex = c ? lwTex(c, this.palet) : null;
      const faceM = new MeshBasicMaterial({ map: tex, color: c ? 0xffffff : sahneRengi(this.palet.zemin), transparent: true, toneMapped: false });
      const glowM = new MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: AdditiveBlending });
      const frame = new Mesh(GEO.frame, fm), face = new Mesh(GEO.face, faceM), glow = new Mesh(GEO.glow, glowM);
      face.position.z = 0.041; glow.position.z = -0.06; g.add(glow, frame, face); mats.push(fm, faceM, glowM);
      const a = k * BETA;
      g.position.set(CR * Math.sin(a), 0, CR * Math.cos(a)); g.rotation.y = a;
      const u: KartVerisi = { fm, faceM, glowM, sc: 1, gl: 0, row: i, k };
      g.userData = u; face.userData = u; frame.userData = u; car.add(g);
      return g;
    });
    const et = lwLabelTex(d, this.palet, satirKotu(d));
    const lm = new MeshBasicMaterial({ map: et.doku, transparent: true, toneMapped: false, depthWrite: false }), label = new Mesh(GEO.label, lm);
    label.position.set(0, CH / 2 + 0.33, 0.02); row.add(label); mats.push(lm); this.drum.add(pivot);
    return { pivot, car, cards, lm, label, lfrac: et.oran, mats, d, ver: this.ver };
  }

  private disposeRow(r: Satir): void {
    this.drum.remove(r.pivot);
    r.mats.forEach((m) => {
      const map = (m as MeshBasicMaterial).map;
      if (map && map !== glowTex) map.dispose();
      m.dispose();
    });
  }

  private layout(r: Dikdortgen): void {
    if (r.width === this.lastW && r.height === this.lastH) return;
    this.lastW = r.width; this.lastH = r.height;
    const asp = r.width / Math.max(1, r.height), t = Math.tan(FOV / 2 * PI / 180), dist = Math.max(10.2, (asp < 1 ? 1.95 : 4.0) / (t * asp));
    this.cam.aspect = asp; this.dist = dist; this.cam.updateProjectionMatrix();
    const fog = this.scene.fog as Fog;
    fog.near = dist + 0.6; fog.far = dist + 14;
    const half = dist * t * asp;
    this.half = half; this.px = r.height / (2 * dist * t);
    const showG = half > 4.6, gx = showG ? half - 0.3 : half + 2;
    this.gears[0]!.position.x = -gx; this.gears[1]!.position.x = gx; this.gears.forEach((g) => { g.visible = showG; });
    this.pawls[0]!.position.set(-gx, 0, R + 0.85); this.pawls[1]!.position.set(gx, 0, R + 0.85); this.pawls.forEach((p) => { p.visible = showG; });
    this.thMax = Math.asin(clamp(((showG ? gx - 0.5 : half - 0.2) - CW / 2) / CR, 0.05, 0.99));
  }

  // Bir kare: `kk` ve `k2` prototipin yumuşatma katsayılarıdır (sürüklerken daha sıkı izler).
  frame(renderer: WebGLRenderer, r: Dikdortgen, kk: number, k2: number): void {
    this.rect = r; this.layout(r);
    const tgtR = this.dragR != null ? this.dragR : this.active;
    this.cur += (tgtR - this.cur) * (this.dragR != null ? k2 : kk);
    this.drum.rotation.x = -this.cur * ALPHA;
    this.cam.position.set(this.mx * 0.8, 0.35 - this.my * 0.5, R + this.dist); this.cam.lookAt(0, -0.15, R);
    this.pick.length = 0;
    const lo = Math.floor(this.cur) - 3, hi = Math.ceil(this.cur) + 3;
    for (let j = 0; j < this.rows.length; j++) {
      const rj = this.rows[j];
      if (rj && (j < lo || j > hi || j >= this.defs.length)) { this.disposeRow(rj); this.rows[j] = null; }
    }
    for (let i = Math.max(0, lo); i <= Math.min(this.defs.length - 1, hi); i++) {
      let row = this.rows[i] ?? null;
      if (row && row.ver !== this.ver) { this.disposeRow(row); row = null; }
      if (!row) row = this.rows[i] = this.buildRow(i);
      const d = row.d, a = this.anim[d.key]!, isAct = i === this.active, tgt = isAct && this.dragK != null ? this.dragK : a.sel;
      a.cur += (tgt - a.cur) * (isAct && this.dragK != null ? k2 : kk);
      row.car.rotation.y = -a.cur * BETA;
      const rel = Math.abs(i - this.cur), rowOp = clamp(1.15 - rel * 0.3, 0, 1);
      row.lm.opacity = rowOp * (isAct ? 1 : 0.55);
      row.label.scale.setScalar(Math.min(1, (2 * this.half - 0.3) / (6.4 * row.lfrac)));
      const sel = Math.round(tgt);
      for (let c = 0; c < row.cards.length; c++) {
        const card = row.cards[c]!, u = card.userData as KartVerisi, ang = Math.abs((c - a.cur) * BETA);
        const fade = 1 - sstep(this.thMax * 0.55, this.thMax + 0.15, ang), op = fade * rowOp * (isAct ? 1 : (c === sel ? 0.95 : 0.4));
        if (op < 0.015) { card.visible = false; continue; }
        card.visible = true; u.fm.opacity = op; u.faceM.opacity = op;
        const foc = isAct && c === sel;
        u.sc += ((foc ? 1.08 : 1) - u.sc) * kk; card.scale.setScalar(u.sc);
        u.gl += ((foc ? 1 : 0) - u.gl) * kk; u.glowM.opacity = u.gl * op; u.glowM.visible = u.gl > 0.01;
        if (op > 0.2) this.pick.push(card.children[1]!, card.children[2]!);
      }
    }
    renderer.setClearColor(sahneRengi(this.palet.arka), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.rows.forEach((r) => { if (r) this.disposeRow(r); });
    this.rows = [];
  }
}
