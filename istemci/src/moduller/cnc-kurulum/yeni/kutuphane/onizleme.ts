// Malzeme kartının 3B önizlemesi (prototipte Kurulum'un önizleme sahnesi paylaşılıyordu; görünüm aynı, sahne bu parçada).
import * as THREE from 'three';
import { CNC3D } from '../sahne/cnc3d.ts';
import { glAl, lights } from '../sahne/gl.ts';
import type { Dikdortgen } from '../sahne/Sahne.tsx';
import { renk } from './raf-sahnesi.ts';
import type { Kalem } from './raf.ts';

const { build, dispose, fit, isLatheTool } = CNC3D;

const PI = Math.PI;

function zeminDokusu(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const temel = new THREE.Color(renk('--sahne3b-mavi'));
  const rgba = (a: number): string => `rgba(${String(Math.round(temel.r * 255))},${String(Math.round(temel.g * 255))},${String(Math.round(temel.b * 255))},${String(a)})`;
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, rgba(0.35)); g.addColorStop(0.6, rgba(0.08)); g.addColorStop(1, rgba(0));
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = rgba(0.35); x.lineWidth = 2; x.beginPath(); x.arc(128, 128, 96, 0, PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Onizleme {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
  private readonly model = new THREE.Group();
  private readonly plat: THREE.Mesh;
  private key = '';
  yaw = 0.6;
  autoT = 0;
  surukle: number | null = null;

  constructor() {
    this.scene.environment = glAl()?.envTex ?? null;
    lights(this.scene, 1.05);
    this.plat = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: zeminDokusu(), transparent: true, depthWrite: false, toneMapped: false }));
    this.plat.rotation.x = -PI / 2;
    this.scene.add(this.plat, this.model);
  }

  goster(it: Kalem): void {
    const key = 'L|' + it.id + '|' + String(it.d ?? '') + '|' + String(it.z ?? '');
    if (key === this.key) return;
    this.key = key;
    while (this.model.children.length) { const c = this.model.children[0]!; this.model.remove(c); dispose(c); }
    const obj = build(it); if (isLatheTool(it)) obj.rotation.y = -0.35;
    const o = fit(obj, 3.6), b = new THREE.Box3().setFromObject(o); o.position.y = -b.min.y + 0.02; this.model.add(o);
  }

  // Kalem düzenlenince aynı anahtarla yeniden kurulsun.
  unut(): void { this.key = ''; }

  kare(renderer: THREE.WebGLRenderer, rect: Dikdortgen, dt: number): void {
    // GL bağlamı ilk 3B çizimde kurulur; sahne ondan önce yaratılmış olabilir.
    this.scene.environment ??= glAl()?.envTex ?? null;
    this.autoT -= dt;
    if (this.autoT <= 0 && this.surukle == null) this.yaw += dt * 0.45;
    this.model.rotation.y = this.yaw;
    if (rect.width <= 10 || rect.height <= 10) return;
    this.cam.aspect = rect.width / rect.height; this.cam.position.set(0, 2.6, 9.4); this.cam.lookAt(0, 1.75, 0); this.cam.updateProjectionMatrix();
    renderer.render(this.scene, this.cam);
  }

  birak(): void {
    while (this.model.children.length) { const c = this.model.children[0]!; this.model.remove(c); dispose(c); }
    const m = this.plat.material as THREE.MeshBasicMaterial;
    m.map?.dispose(); m.dispose(); this.plat.geometry.dispose();
  }
}
