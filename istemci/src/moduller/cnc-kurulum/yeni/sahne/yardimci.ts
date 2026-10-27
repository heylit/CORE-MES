import * as THREE from 'three';

// Geçici karşılık (Soru 318 a): dilim 2b'nin yardimci.ts'i aynı adlarla yerine geçer.
export function textSprite(_text: string, _color?: string, _bg?: string): THREE.Sprite { return new THREE.Sprite(); }
export function sizeSprite(_s: THREE.Sprite, _h: number): void { /* sahne çizilmiyor */ }

// Yörünge kamera: alan dinlenmez, kamera yerinde kalır.
export type OrbitGorunusu = 'iso' | 'top' | 'front' | 'side' | null | undefined;
export class Orbit {
  el: HTMLElement;
  cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  tTarget = new THREE.Vector3();
  th = -0.75;
  ph = 1.0;
  dist = 300;
  tTh = -0.75;
  tPh = 1.0;
  tDist = 300;
  moved = 0;
  onTap: ((e: PointerEvent) => void) | null = null;
  enabled = true;
  constructor(el: HTMLElement, cam: THREE.PerspectiveCamera) { this.el = el; this.cam = cam; }
  birak(): void { /* dinleyici yok */ }
  pan(_dx: number, _dy: number): void { /* sahne çizilmiyor */ }
  fit(_box: THREE.Box3, _v?: OrbitGorunusu | string): void { /* sahne çizilmiyor */ }
  snap(): void { /* sahne çizilmiyor */ }
  update(_k: number, _aspect: number): void { /* sahne çizilmiyor */ }
}

// 2B grafik de bu dilimdedir; karşılıkta tuval boş kalır.
export interface GrafikSerisi { pts: [number, number][]; color: string; w?: number; dash?: number[]; fill?: string }
export interface GrafikCubugu { x0: number; x1: number; y: number; color: string }
export interface GrafikDikeyi { x: number; color: string; label?: string; dy?: number }
export interface GrafikYatayi { y: number; color: string; label?: string }
export interface GrafikSecenegi {
  xmin: number; xmax: number; ymin?: number; ymax: number;
  title?: string; xlabel?: string;
  xfmt?: (v: number) => string; yfmt?: (v: number) => string;
  bars?: GrafikCubugu[]; series?: GrafikSerisi[]; vlines?: GrafikDikeyi[]; hlines?: GrafikYatayi[];
}
// Seçenek burada okunmaz; parçaların kendi seçenek tipi gerçek dilimle birlikte eşlenir.
export function drawChart(_cv: HTMLCanvasElement, _o: GrafikSecenegi | object): void { /* grafik çizilmiyor */ }
export function disposeObj(_o: THREE.Object3D): void { /* sahne çizilmiyor */ }
