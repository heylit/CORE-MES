import {
  CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type Box3, type Material, type Object3D, type PerspectiveCamera,
  type Texture,
} from 'three';
import { clamp, FONT, fmtN } from '../bicim.ts';
import { glAl, rr } from './gl.ts';
import { sahneRengi } from './renkler.ts';

// Prototipin ortak sahne yardımcıları (yörünge kamera, metin sprite, 2B grafik). Çizim döngüsü (renderRect, clearAll) Sahne'nindir.

interface Isaretci { x: number; y: number; b: number; sh: boolean }
export type OrbitGorunusu = 'iso' | 'top' | 'front' | 'side' | null | undefined;

const kameraYasak = (e: Event, secici: string): boolean => e.target instanceof Element && e.target.closest(secici) !== null;

export class Orbit {
  el: HTMLElement;
  cam: PerspectiveCamera;
  target = new Vector3();
  tTarget = new Vector3();
  th = -0.75;
  ph = 1.0;
  dist = 300;
  tTh = -0.75;
  tPh = 1.0;
  tDist = 300;
  ptrs: Record<number, Isaretci> = {};
  moved = 0;
  onTap: ((e: PointerEvent) => void) | null = null;
  enabled = true;
  private readonly birakicilar: (() => void)[] = [];

  constructor(el: HTMLElement, cam: PerspectiveCamera) {
    this.el = el; this.cam = cam;
    const dinle = <K extends keyof HTMLElementEventMap>(tur: K, f: (e: HTMLElementEventMap[K]) => void, secenek?: AddEventListenerOptions): void => {
      el.addEventListener(tur, f, secenek);
      this.birakicilar.push(() => { el.removeEventListener(tur, f, secenek); });
    };
    dinle('contextmenu', (e) => { e.preventDefault(); });
    dinle('pointerdown', (e) => {
      if (!this.enabled || kameraYasak(e, 'button,input,select,textarea,label,.nocam')) return;
      this.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey || e.ctrlKey };
      this.moved = 0;
      el.classList.add('grab');
      try { el.setPointerCapture(e.pointerId); } catch { /* yakalama desteklenmiyorsa sürükleme yine çalışır */ }
    });
    dinle('pointermove', (e) => {
      const p = this.ptrs[e.pointerId];
      if (!p) return;
      const ids = Object.keys(this.ptrs), dx = e.clientX - p.x, dy = e.clientY - p.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (ids.length >= 2) {
        const a = this.ptrs[Number(ids[0])], b = this.ptrs[Number(ids[1])];
        if (!a || !b) return;
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0 && d1 > 0) this.tDist *= d0 / d1;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (p.b === 2 || p.b === 1 || p.sh) this.pan(dx, dy);
      else { this.tTh -= dx * 0.008; this.tPh = clamp(this.tPh - dy * 0.008, 0.06, Math.PI - 0.06); }
    });
    const up = (e: PointerEvent): void => {
      const p = this.ptrs[e.pointerId];
      delete this.ptrs[e.pointerId];
      if (!Object.keys(this.ptrs).length) el.classList.remove('grab');
      if (p && this.moved < 6 && this.onTap && e.type === 'pointerup') this.onTap(e);
    };
    dinle('pointerup', up);
    dinle('pointercancel', up);
    dinle('wheel', (e) => {
      if (!this.enabled || kameraYasak(e, '.nocam')) return;
      e.preventDefault();
      this.tDist *= Math.pow(1.0015, e.deltaY * (e.deltaMode === 1 ? 33 : 1));
    }, { passive: false });
  }

  // Bileşen sökülünce öğedeki dinleyiciler kalkar (prototipte sayfa hiç sökülmez).
  birak(): void { for (const b of this.birakicilar.splice(0)) b(); }

  pan(dx: number, dy: number): void {
    const c = this.cam, s = this.dist * Math.tan(c.fov * Math.PI / 360) * 2 / Math.max(1, this.el.clientHeight);
    const r = new Vector3().setFromMatrixColumn(c.matrix, 0), u = new Vector3().setFromMatrixColumn(c.matrix, 1);
    this.tTarget.addScaledVector(r, -dx * s).addScaledVector(u, dy * s);
  }

  fit(box: Box3, v?: OrbitGorunusu | string): void {
    if (box.isEmpty()) return;
    const c = box.getCenter(new Vector3()), r = Math.max(1, box.getSize(new Vector3()).length() / 2);
    const asp = this.el.clientWidth / Math.max(1, this.el.clientHeight) || 1;
    this.tTarget.copy(c);
    this.tDist = r / Math.sin(this.cam.fov * Math.PI / 360) * 1.08 * Math.max(1, 1 / asp);
    if (v === 'top') { this.tTh = 0; this.tPh = 0.06; }
    else if (v === 'front') { this.tTh = 0; this.tPh = Math.PI / 2 - 0.02; }
    else if (v === 'side') { this.tTh = Math.PI / 2; this.tPh = Math.PI / 2 - 0.02; }
    else if (v === 'iso') { this.tTh = -0.75; this.tPh = 0.95; }
  }

  snap(): void { this.th = this.tTh; this.ph = this.tPh; this.dist = this.tDist; this.target.copy(this.tTarget); }

  update(k: number, aspect: number): void {
    this.th += (this.tTh - this.th) * k; this.ph += (this.tPh - this.ph) * k; this.dist += (this.tDist - this.dist) * k; this.target.lerp(this.tTarget, k);
    const c = this.cam, sp = Math.sin(this.ph);
    c.aspect = aspect;
    c.position.set(this.target.x + this.dist * sp * Math.sin(this.th), this.target.y + this.dist * Math.cos(this.ph), this.target.z + this.dist * sp * Math.cos(this.th));
    c.near = Math.max(0.01, this.dist / 200); c.far = this.dist * 60;
    c.updateProjectionMatrix(); c.lookAt(this.target); c.updateMatrixWorld();
  }
}

function baglam2d(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try { return c.getContext('2d'); } catch { return null; }
}

// Tuval bağlamı yoksa (test ortamı, kapalı tuval) sprite boş dokuyla kurulur; sahne yine çizilir.
export function textSprite(text: string, color?: string, bg?: string): Sprite {
  const c = document.createElement('canvas');
  // WebGL yoksa sprite hiç çizilmez; yazı tuvali kurulmaz.
  const webgl = glAl() !== null;
  let x = webgl ? baglam2d(c) : null;
  let w = 36;
  if (x) { x.font = `700 40px ${FONT}`; w = Math.ceil(x.measureText(text).width) + 36; }
  c.width = w; c.height = 64;
  x = webgl ? baglam2d(c) : null;
  if (x) {
    x.font = `700 40px ${FONT}`;
    x.fillStyle = bg || sahneRengi('etiket-zemin'); rr(x, 1, 1, w - 2, 62, 14); x.fill();
    x.fillStyle = color || sahneRengi('beyaz'); x.textBaseline = 'middle'; x.fillText(text, 18, 34);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }));
  s.userData['aspect'] = w / 64;
  s.renderOrder = 10;
  s.material.userData['own'] = true;
  return s;
}
export function sizeSprite(s: Sprite, h: number): void {
  const oran = typeof s.userData['aspect'] === 'number' ? s.userData['aspect'] : 1;
  s.scale.set(h * oran, h, 1);
}

// Prototipin visibleRect'i: öğe görünür alandaysa dikdörtgeni (H: tuval yüksekliği).
export function visibleRect(el: Element, H: number): DOMRect | null {
  const r = el.getBoundingClientRect();
  return r.width > 10 && r.height > 10 && r.bottom > 0 && r.top < H ? r : null;
}

type Cizilebilir = Object3D & { geometry?: { dispose(): void }; material?: Material | Material[]; isSprite?: boolean };
export function disposeObj(o: Object3D): void {
  o.traverse((n) => {
    const d = n as Cizilebilir;
    if (d.geometry && !d.isSprite) d.geometry.dispose();
    if (d.material) {
      const ms = Array.isArray(d.material) ? d.material : [d.material];
      ms.forEach((m) => {
        if (m.userData['keep']) return;
        const map = (m as Material & { map?: Texture | null }).map;
        if (map) map.dispose();
        m.dispose();
      });
    }
  });
}

// ----- basit 2B grafik (prototipin drawChart'ı) -----
export interface GrafikSerisi { pts: [number, number][]; color: string; w?: number; dash?: number[]; fill?: string }
export interface GrafikCubugu { x0: number; x1: number; y: number; color: string }
// Çizgi kendi ekseninin değerini taşımıyorsa çizilmez (omur grafikleri iki ekseni tek tipte verir).
export interface GrafikDikeyi { x?: number; color: string; label?: string; dy?: number }
export interface GrafikYatayi { y?: number; color: string; label?: string }
export interface GrafikSecenegi {
  xmin: number; xmax: number; ymin?: number; ymax: number;
  title?: string; xlabel?: string;
  xfmt?: (v: number) => string; yfmt?: (v: number) => string;
  bars?: GrafikCubugu[]; series?: GrafikSerisi[]; vlines?: GrafikDikeyi[]; hlines?: GrafikYatayi[];
}

export function drawChart(cv: HTMLCanvasElement, o: GrafikSecenegi): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const x = baglam2d(cv);
  if (!x) return;
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  const L0 = 46, R0 = 12, T0 = 26, B0 = 30, pw = W - L0 - R0, ph = H - T0 - B0;
  const xmin = o.xmin, xmax = o.xmax, ymin = o.ymin || 0, ymax = o.ymax;
  const X = (v: number): number => L0 + (v - xmin) / (xmax - xmin || 1) * pw;
  const Y = (v: number): number => T0 + ph - (v - ymin) / (ymax - ymin || 1) * ph;
  x.font = `600 12px ${FONT}`; x.fillStyle = sahneRengi('grafik-baslik'); x.fillText(o.title || '', L0, 16);
  x.strokeStyle = sahneRengi('grafik-izgara'); x.lineWidth = 1; x.fillStyle = sahneRengi('grafik-yazi'); x.font = `11px ${FONT}`;
  for (let i = 0; i <= 4; i++) {
    const yv = ymin + (ymax - ymin) * i / 4, yy = Y(yv);
    x.beginPath(); x.moveTo(L0, yy); x.lineTo(L0 + pw, yy); x.stroke();
    x.textAlign = 'right'; x.fillText(o.yfmt ? o.yfmt(yv) : fmtN(yv, ymax < 2 ? 2 : 0), L0 - 6, yy + 4);
  }
  for (let j = 0; j <= 4; j++) {
    const xv = xmin + (xmax - xmin) * j / 4, xx = X(xv);
    x.textAlign = 'center'; x.fillText(o.xfmt ? o.xfmt(xv) : fmtN(xv, 0), xx, T0 + ph + 16);
  }
  x.textAlign = 'right'; x.fillText(o.xlabel || '', L0 + pw, H - 2); x.textAlign = 'left';
  (o.bars || []).forEach((b) => { x.fillStyle = b.color; x.fillRect(X(b.x0) + 1, Y(b.y), Math.max(1, X(b.x1) - X(b.x0) - 2), Y(ymin) - Y(b.y)); });
  (o.series || []).forEach((s) => {
    const ilk = s.pts[0], son = s.pts[s.pts.length - 1];
    if (s.fill && ilk && son) {
      x.beginPath(); x.moveTo(X(ilk[0]), Y(ymin));
      s.pts.forEach((p) => { x.lineTo(X(p[0]), Y(Math.min(ymax, p[1]))); });
      x.lineTo(X(son[0]), Y(ymin)); x.closePath(); x.fillStyle = s.fill; x.fill();
    }
    x.beginPath();
    s.pts.forEach((p, k) => { const px = X(p[0]), py = Y(Math.min(ymax, p[1])); if (k) x.lineTo(px, py); else x.moveTo(px, py); });
    x.strokeStyle = s.color; x.lineWidth = s.w || 2; x.setLineDash(s.dash || []); x.stroke(); x.setLineDash([]);
  });
  (o.vlines || []).forEach((v) => {
    if (v.x === undefined || v.x < xmin || v.x > xmax) return;
    const xx = X(v.x);
    x.strokeStyle = v.color; x.lineWidth = 1.5; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(xx, T0); x.lineTo(xx, T0 + ph); x.stroke(); x.setLineDash([]);
    x.fillStyle = v.color; x.font = `600 11px ${FONT}`; x.textAlign = xx > L0 + pw * 0.7 ? 'right' : 'left';
    x.fillText(v.label || '', xx + (x.textAlign === 'right' ? -4 : 4), T0 + 10 + (v.dy || 0)); x.textAlign = 'left';
  });
  (o.hlines || []).forEach((v) => {
    if (v.y === undefined) return;
    const yy = Y(v.y);
    x.strokeStyle = v.color; x.lineWidth = 1.5; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(L0, yy); x.lineTo(L0 + pw, yy); x.stroke(); x.setLineDash([]);
    x.fillStyle = v.color; x.font = `600 11px ${FONT}`; x.fillText(v.label || '', L0 + 4, yy - 4);
  });
}
