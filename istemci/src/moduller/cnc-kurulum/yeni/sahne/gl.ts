import * as THREE from 'three';
import type { Kalem } from '../veri/tipler.ts';

// Geçici karşılık (Soru 318 a): dilim 2b'nin gl.ts'i aynı adlarla yerine geçer. Sahne çizilmediği için dokular ve ışıklar boştur;
// küçük resim yoktur (çağıran boş resimle sürer). Tuval yazı yardımcıları (wrap, draw) 2b'deki saf hâlleridir.
export interface GlBaglami { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement; envTex: THREE.Texture; maxAniso: number }
// Bağlam hiç kurulmaz: çağıran "WebGL yok" dalına düşer.
export function glAl(): GlBaglami | null { return null; }
export const envTex: THREE.Texture | null = null;
export function lights(_sc: THREE.Scene, _k: number): void { /* sahne çizilmiyor */ }
export const maxAniso = 1;
export function thumb(_opt: Kalem): HTMLCanvasElement | null { return null; }
export function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number): void {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
export function wrap(x: CanvasRenderingContext2D, text: string | null | undefined, mx: number, maxL: number): string[] {
  const words = String(text || '').split(' ');
  let lines: string[] = [], cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (x.measureText(t).width > mx && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxL) {
    lines = lines.slice(0, maxL);
    let l = lines[maxL - 1] ?? '';
    while (x.measureText(`${l}…`).width > mx && l.length) l = l.slice(0, -1);
    lines[maxL - 1] = `${l}…`;
  }
  return lines;
}
export function draw(x: CanvasRenderingContext2D, text: string | null | undefined, px: number, py: number, mx: number, maxL: number, lh: number): number {
  const L = wrap(x, text, mx, maxL);
  L.forEach((s, i) => { x.fillText(s, px, py + i * lh); });
  return py + L.length * lh;
}
export function cardTex(_opt: Kalem, _def: { cat: string; col: string }): THREE.Texture { return new THREE.Texture(); }
export function numTex(_n: number, _on?: boolean): THREE.Texture { return new THREE.Texture(); }
export function onbellekSil(_id: string): void { /* önbellek yok */ }
