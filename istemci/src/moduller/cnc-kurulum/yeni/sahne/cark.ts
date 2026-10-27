import * as THREE from 'three';

// Geçici karşılık (Soru 318 a): dilim 2b'nin cark.ts'i aynı adlarla yerine geçer. Ölçüler prototipin çark sabitleridir;
// geometri, doku ve malzemeler boştur (sahne çizilmiyor).
const TAU = Math.PI * 2;
export const R = 8;
export const ALPHA = TAU / 18;
export const CR = 9;
export const CW = 2.4;
export const CH = 1.64;
export const SP = 2.72;
export const BETA = SP / CR;
export const FOV = 42;
export const GEO = {
  frame: new THREE.BufferGeometry(),
  face: new THREE.BufferGeometry(),
  glow: new THREE.BufferGeometry(),
  label: new THREE.BufferGeometry(),
};
export const glowTex = new THREE.Texture();
export const gearG = new THREE.BufferGeometry();
export const gearMat = new THREE.MeshStandardMaterial();
export const spokeG = new THREE.BufferGeometry();
export const pawlMat = new THREE.MeshStandardMaterial();
export const plat = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
