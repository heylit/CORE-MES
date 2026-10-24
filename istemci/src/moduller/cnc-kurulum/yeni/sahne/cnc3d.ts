import * as THREE from 'three';
import type { Kalem, Tezgah } from '../veri/tipler.ts';

// Geçici karşılık (Soru 318 a): dilim 2b'nin CNC3D'si aynı adlarla yerine geçer. Modeller boş gruptur.
export const CNC3D = {
  build(_o: Kalem): THREE.Object3D { return new THREE.Group(); },
  assembly(_t: Kalem, _m: Tezgah): THREE.Object3D { return new THREE.Group(); },
  fit(o: THREE.Object3D, _s: number): THREE.Object3D { return o; },
  dispose(_o: THREE.Object3D): void { /* boş grup */ },
  isLatheTool(_t: Kalem): boolean { return false; },
  isMillTool(_t: Kalem): boolean { return false; },
  htype(_t: Kalem): string { return ''; },
  M: { steel: new THREE.MeshStandardMaterial(), dark: new THREE.MeshStandardMaterial(), oxide: new THREE.MeshStandardMaterial() } as Record<'steel' | 'dark' | 'oxide', THREE.Material>,
};
