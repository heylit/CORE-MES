import * as THREE from 'three';

// Geçici karşılık (Soru 318 a): dilim 2b'nin yardimci.ts'i aynı adlarla yerine geçer.
export function textSprite(_text: string, _color?: string): THREE.Sprite { return new THREE.Sprite(); }
export function disposeObj(_o: THREE.Object3D): void { /* sahne çizilmiyor */ }
