import * as THREE from 'three';
import type { Kalem } from '../veri/tipler.ts';

// Geçici karşılık (Soru 318 a): dilim 2b'nin gl.ts'i aynı adlarla yerine geçer. Sahne çizilmediği için dokular ve ışıklar boştur;
// küçük resim yoktur (çağıran boş resimle sürer).
export const envTex: THREE.Texture | null = null;
export function lights(_sc: THREE.Scene, _k: number): void { /* sahne çizilmiyor */ }
export const maxAniso = 1;
export function thumb(_opt: Kalem): HTMLCanvasElement | null { return null; }
export function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number): void {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
export function cardTex(_opt: Kalem, _def: { cat: string; col: string }): THREE.Texture { return new THREE.Texture(); }
export function numTex(_n: number, _on?: boolean): THREE.Texture { return new THREE.Texture(); }
export function onbellekSil(_id: string): void { /* önbellek yok */ }
