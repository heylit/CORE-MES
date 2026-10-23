import * as THREE from 'three';
import { machine, toolById, tools } from '../secici.ts';
import { CNC3D } from '../sahne/cnc3d.ts';
import { envTex, lights, numTex } from '../sahne/gl.ts';
import type { Cizim } from '../sahne/Sahne.tsx';
import type { Kalem } from '../veri/tipler.ts';
import { renk, renkKaynagi, temizle as alaniTemizle } from './renk.ts';
import { K, type CarkAdimi } from './satirlar.ts';

// Kurulum kartının önizlemesi: seçili kartın modeli ya da magazin / taret (prototip 17596-17662, kare 24508-24530).

const PI = Math.PI, TAU = PI * 2;

interface Onizleme {
  scene: THREE.Scene; cam: THREE.PerspectiveCamera; plat: THREE.Mesh; model: THREE.Group; mag: THREE.Group; pawlMat: THREE.MeshStandardMaterial;
  yaw: number; autoT: number; surukle: number | null;
  magInfo: { lathe: boolean; N: number; R: number; ring: THREE.Group } | null; magRotTarget: number;
}
let P: Onizleme | null = null;

function platDokusu(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  if (x) {
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128), m = renk('acik-mavi');
    g.addColorStop(0, `color-mix(in srgb, ${m} 35%, transparent)`); g.addColorStop(0.6, `color-mix(in srgb, ${m} 8%, transparent)`); g.addColorStop(1, 'transparent');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = `color-mix(in srgb, ${m} 35%, transparent)`; x.lineWidth = 2; x.beginPath(); x.arc(128, 128, 96, 0, TAU); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function kur(): Onizleme {
  const scene = new THREE.Scene(); scene.environment = envTex; lights(scene, 1.05);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
  const plat = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: platDokusu(), transparent: true, depthWrite: false, toneMapped: false }));
  plat.rotation.x = -PI / 2; scene.add(plat);
  const model = new THREE.Group(), mag = new THREE.Group(); scene.add(model); scene.add(mag);
  const acc = new THREE.Color(renk('vurgu'));
  const pawlMat = new THREE.MeshStandardMaterial({ color: acc, metalness: 0.3, roughness: 0.4, emissive: acc, emissiveIntensity: 0.35 });
  return { scene, cam, plat, model, mag, pawlMat, yaw: 0.6, autoT: 0, surukle: null, magInfo: null, magRotTarget: 0 };
}

function temizle(g: THREE.Group): void { while (g.children.length) { const c = g.children[0]; if (!c) break; g.remove(c); CNC3D.dispose(c); } }

function setPreview(p: Onizleme, def: CarkAdimi, opt: Kalem): void {
  const m = machine(), key = `${opt.id}|${m.id}|${def.isTool ? 'T' : 'X'}`;
  if (key === K.pKey) return; K.pKey = key;
  temizle(p.model);
  const obj = def.isTool && opt.kind !== 'empty' ? CNC3D.assembly(opt, m) : CNC3D.build(opt);
  if (def.isTool && CNC3D.isLatheTool(opt)) obj.rotation.y = -0.35;
  const o = CNC3D.fit(obj, 3.6), b = new THREE.Box3().setFromObject(o); o.position.y = -b.min.y + 0.02; p.model.add(o);
}

function buildMag(p: Onizleme): void {
  K.magDirty = false;
  temizle(p.mag);
  const m = machine(), arr = tools(), N = m.pockets, ring = new THREE.Group(), Mt = CNC3D.M;
  p.mag.add(ring);
  let info: Onizleme['magInfo'];
  if (m.type === 'lathe') {
    const Rt = Math.max(2.6, N * 1.25 / TAU);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(Rt, Rt, 1.2, N * 2), Mt.steel); disc.rotation.x = PI / 2; ring.add(disc);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(Rt * 0.4, Rt * 0.4, 1.4, 24), Mt.dark); hub.rotation.x = PI / 2; ring.add(hub);
    for (let q = 0; q < N; q++) {
      const a = q / N * TAU, sx = Math.sin(a), sy = Math.cos(a);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.3), Mt.oxide); st.position.set(sx * Rt, sy * Rt, 0); st.rotation.z = -a; ring.add(st);
      const nm = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(q + 1), depthWrite: false })); nm.material.userData['own'] = true; nm.scale.setScalar(0.5); nm.position.set(sx * Rt * 0.72, sy * Rt * 0.72, 0.75); ring.add(nm);
      const t = toolById(arr[q] ?? 'empty'); if (t.kind === 'empty') continue;
      const obj = CNC3D.build(t), lathe = CNC3D.isLatheTool(t), o = CNC3D.fit(obj, 2.5), bb = new THREE.Box3().setFromObject(o);
      if (lathe) o.position.x -= bb.min.x; else o.position.y -= bb.max.y;
      const holder = new THREE.Group(); holder.add(o);
      holder.position.set(sx * (Rt + 0.15), sy * (Rt + 0.15), 0); holder.rotation.z = lathe ? (PI / 2 - a) : (PI - a); ring.add(holder);
    }
    info = { lathe: true, N, R: Rt, ring };
  } else {
    const Rm = Math.max(4.2, N * 1.3 / TAU), top = 2.9;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(Rm + 0.9, Rm + 0.9, 0.3, 64), Mt.dark); plate.position.y = top + 0.2; ring.add(plate);
    const hub2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 32), Mt.steel); hub2.position.y = top + 0.6; ring.add(hub2);
    for (let q = 0; q < N; q++) {
      const b2 = q / N * TAU, cx = Math.sin(b2) * Rm, cz = Math.cos(b2) * Rm;
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 20), Mt.steel); sl.position.set(cx, top, cz); ring.add(sl);
      const nm2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(q + 1), depthWrite: false })); nm2.material.userData['own'] = true; nm2.scale.setScalar(0.55); nm2.position.set(Math.sin(b2) * (Rm + 1.35), top + 0.45, Math.cos(b2) * (Rm + 1.35)); ring.add(nm2);
      const tq = toolById(arr[q] ?? 'empty'); if (tq.kind === 'empty') continue;
      const asm = CNC3D.assembly(tq, m);
      if (CNC3D.isLatheTool(tq)) asm.rotation.z = -PI / 2;
      const o2 = CNC3D.fit(asm, 2.7), bb2 = new THREE.Box3().setFromObject(o2); o2.position.y -= bb2.max.y; o2.position.y += top;
      o2.position.x += cx; o2.position.z += cz; ring.add(o2);
    }
    info = { lathe: false, N, R: Rm, ring };
  }
  const hl = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 10, 40), p.pawlMat);
  if (info.lathe) hl.position.set(0, info.R + 2.95, 0.9); else { hl.rotation.x = PI / 2; hl.position.set(0, -0.15, info.R); }
  p.mag.add(hl); p.magInfo = info;
}

export function onizlemeSurukle(x: number | null): void {
  const p = P; if (!p) return;
  if (x === null || p.surukle === null) { p.surukle = x; return; }
  p.yaw += (x - p.surukle) * 0.012; p.surukle = x; p.autoT = 2.5;
}

export function onizlemeCiz(z: Cizim, def: CarkAdimi | undefined, opt: Kalem | undefined): void {
  renkKaynagi(z);
  const p = P ?? (P = kur()), dt = z.dt, kk = 1 - Math.pow(0.0008, dt), r = z.rect;
  if (def && opt) setPreview(p, def, opt);
  p.autoT -= dt; if (p.autoT <= 0 && p.surukle == null) p.yaw += dt * 0.45;
  p.model.rotation.y = p.yaw;
  if (p.magInfo) {
    const mt = def?.isTool ? def.pocket ?? null : null; if (mt != null) p.magRotTarget = mt;
    const I = p.magInfo, target = p.magRotTarget / I.N * TAU;
    let cur = I.lathe ? I.ring.rotation.z : -I.ring.rotation.y;
    const diff = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
    cur += diff * kk; if (I.lathe) I.ring.rotation.z = cur; else I.ring.rotation.y = -cur;
  }
  const cam = p.cam; cam.aspect = r.width / Math.max(1, r.height);
  if (K.pTab === 'mag') { if (K.magDirty) buildMag(p); p.model.visible = false; p.plat.visible = false; p.mag.visible = true; }
  else { p.model.visible = true; p.plat.visible = true; p.mag.visible = false; cam.position.set(0, 2.6, 9.4); cam.lookAt(0, 1.75, 0); }
  const I = p.magInfo;
  if (K.pTab === 'mag' && I) {
    if (I.lathe) { cam.position.set(0, 0.6, (I.R + 3.0) / Math.tan(17.5 * PI / 180) / Math.min(1, cam.aspect) * 1.02); cam.lookAt(0, 0.6, 0); }
    else { cam.position.set(0, 7.2, I.R + 14.5 / Math.min(1.3, cam.aspect)); cam.lookAt(0, 0.9, I.R - 2.6); }
  }
  cam.updateProjectionMatrix();
  alaniTemizle(z, 'onizleme-arka');
  z.renderer.render(p.scene, cam);
}

export function onizlemeBirak(): void {
  const p = P; if (!p) return;
  temizle(p.model); temizle(p.mag); P = null; K.pKey = ''; K.magDirty = true;
}
