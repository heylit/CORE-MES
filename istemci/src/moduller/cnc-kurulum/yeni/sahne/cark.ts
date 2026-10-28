import { BoxGeometry, CanvasTexture, CircleGeometry, ExtrudeGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Path, PlaneGeometry, Shape, SRGBColorSpace } from 'three';
import { glAl, rr } from './gl.ts';
import { sahneRengi, sahneRengi3 } from './renkler.ts';

// Çarkın paylaşılan ölçüleri ve parçaları (prototip 17513-17534, 17598-17600). Takım Ömrü çarkı ve önizleme platformu bunları
// paylaşır; Kurulum çarkı kendi örneğini kurar (kurulum/cark.ts). Geometri ve dokular modül yüklenince bir kez kurulur.
export const TAU = Math.PI * 2;
export const R = 8;
export const ALPHA = TAU / 18;
export const CR = 9;
export const CW = 2.4;
export const CH = 1.64;
export const SP = 2.72;
export const BETA = SP / CR;
export const FOV = 42;

export function gearGeo(rO: number, n: number, depth: number): ExtrudeGeometry {
  const sh = new Shape(), step = TAU / n, rR = rO - 0.38;
  for (let i = 0; i < n; i++) {
    const a = i * step - step / 2;
    const pts: [number, number][] = [[rR, a], [rR, a + step * 0.22], [rO, a + step * 0.36], [rO, a + step * 0.64], [rR, a + step * 0.78], [rR, a + step]];
    pts.forEach(([r, aci], k) => {
      const X = Math.cos(aci) * r, Y = Math.sin(aci) * r;
      if (i === 0 && k === 0) sh.moveTo(X, Y); else sh.lineTo(X, Y);
    });
  }
  const h0 = new Path();
  h0.absarc(0, 0, rO - 1.05, 0, TAU, true);
  sh.holes.push(h0);
  const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 48 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// WebGL yoksa doku hiç gösterilmez; boş tuvalle kurulur.
function tuvalDokusu(w: number, h: number, ciz: (x: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = glAl() === null ? null : c.getContext('2d');
  if (x) ciz(x);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function makeGlowTex(): CanvasTexture {
  return tuvalDokusu(256, 200, (x) => {
    const acc = sahneRengi('vurgu');
    x.shadowColor = acc; x.shadowBlur = 22; x.strokeStyle = acc; x.lineWidth = 5;
    rr(x, 27, 28, 202, 144, 12); x.stroke(); x.stroke();
  });
}
function makeBadgeTex(): CanvasTexture {
  return tuvalDokusu(64, 64, (x) => {
    x.fillStyle = sahneRengi('onay'); x.beginPath(); x.arc(32, 32, 30, 0, TAU); x.fill();
    x.strokeStyle = sahneRengi('beyaz'); x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(18, 33); x.lineTo(28, 43); x.lineTo(46, 22); x.stroke();
  });
}
function makePlatTex(): CanvasTexture {
  return tuvalDokusu(256, 256, (x) => {
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, sahneRengi('platform-ic')); g.addColorStop(0.6, sahneRengi('platform-orta')); g.addColorStop(1, sahneRengi('platform-dis'));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = sahneRengi('platform-halka'); x.lineWidth = 2; x.beginPath(); x.arc(128, 128, 96, 0, TAU); x.stroke();
  });
}

export const GEO = {
  frame: new BoxGeometry(CW, CH, 0.08),
  face: new PlaneGeometry(CW - 0.06, CH - 0.06),
  glow: new PlaneGeometry(CW + 0.5, CH + 0.5),
  badge: new CircleGeometry(0.16, 28),
  label: new PlaneGeometry(6.4, 0.4),
};
export const glowTex = makeGlowTex();
export const badgeTex = makeBadgeTex();
export const gearG = gearGeo(R + 0.25, 18, 0.3);
export const gearMat = new MeshStandardMaterial({ color: sahneRengi3('disli'), metalness: 0.9, roughness: 0.38 });
export const spokeG = new BoxGeometry(0.22, 2 * (R - 1.0), 0.22);
const vurgu = sahneRengi3('vurgu');
export const pawlMat = new MeshStandardMaterial({ color: vurgu, metalness: 0.3, roughness: 0.4, emissive: vurgu, emissiveIntensity: 0.35 });
// Önizleme platformu; prototipte Takım Ömrü aynı geometri ve malzemeyle kendi örneğini kurar (new Mesh(plat.geometry, plat.material)).
export const plat = new Mesh(new PlaneGeometry(7, 7), new MeshBasicMaterial({ map: makePlatTex(), transparent: true, depthWrite: false, toneMapped: false }));
plat.rotation.x = -Math.PI / 2;
