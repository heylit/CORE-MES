import {
  Box3, BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Sprite, SpriteMaterial,
  TorusGeometry, type Object3D, type WebGLRenderer,
} from 'three';
import { byId, CNC3D, envTex, lights, numTex, pad2, pawlMat, plat, toolLib, toolsOf } from './cekirdek.ts';
import { durumRengi, sahneRengi, type OmurPaleti } from './renk.ts';
import type { CarkSatiri } from './takip.ts';
import type { CarkKarti, OmurDurumu, Tezgah } from './tipler.ts';
import type { Dikdortgen } from './cark-sahnesi.ts';

// Yan paneldeki tezgâh / magazin önizlemesi (prototipin LP'si): tezgâh sekmesinde model döner, magazin sekmesinde cepler ömür
// rengindeki halkalarla görünür ve seçili cep öne döner. Depo satırında seçili kalemin modeli gösterilir.

const PI = Math.PI, TAU = PI * 2;
export type OnizlemeSekmesi = 'model' | 'mag';
interface MagazinBilgisi { lathe: boolean; N: number; R: number; ring: Group }

export class OmurOnizlemesi {
  readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(35, 1, 0.1, 400);
  private readonly model = new Group();
  private readonly mag = new Group();
  private readonly plat: Mesh;
  private key = '';
  yaw = 0.6;
  auto = 0;
  drag: number | null = null;
  private info: MagazinBilgisi | null = null;
  private sel: number | null = null;
  private readonly ringG = new TorusGeometry(0.7, 0.1, 10, 36);
  private readonly ringL = new TorusGeometry(0.42, 0.07, 10, 32);
  private mats: Partial<Record<OmurDurumu, MeshBasicMaterial>> = {};

  private palet: OmurPaleti;

  constructor(palet: OmurPaleti) {
    this.palet = palet;
    this.scene.environment = envTex;
    lights(this.scene, 1.05);
    this.plat = new Mesh(plat.geometry, plat.material);
    this.scene.add(this.plat, this.model, this.mag);
  }

  paletDegisti(p: OmurPaleti): void {
    this.palet = p;
    Object.values(this.mats).forEach((m) => m.dispose());
    this.mats = {}; this.key = '';
  }

  private mat(st: OmurDurumu): MeshBasicMaterial {
    return this.mats[st] || (this.mats[st] = new MeshBasicMaterial({ color: new Color(sahneRengi(durumRengi(this.palet, st))), toneMapped: false }));
  }

  private clear(g: Group): void {
    while (g.children.length) { const c = g.children[0]!; g.remove(c); CNC3D.dispose(c); }
  }

  private numara(n: number, olcek: number): Sprite {
    const nm = new Sprite(new SpriteMaterial({ map: numTex(n), depthWrite: false }));
    nm.material.userData['own'] = true; nm.scale.setScalar(olcek);
    return nm;
  }

  private buildMag(m: Tezgah, d: CarkSatiri): void {
    const arr = toolsOf(m), N = m.pockets, ring = new Group(), Mt = CNC3D.M, stOf: Record<number, OmurDurumu> = {};
    if (!d.depot) d.cards.forEach((c) => { stOf[c.p] = c.st; });
    this.mag.add(ring);
    if (m.type === 'lathe') {
      const Rt = Math.max(2.6, N * 1.25 / TAU);
      const disc = new Mesh(new CylinderGeometry(Rt, Rt, 1.2, N * 2), Mt.steel); disc.rotation.x = PI / 2; ring.add(disc);
      const hub = new Mesh(new CylinderGeometry(Rt * 0.4, Rt * 0.4, 1.4, 24), Mt.dark); hub.rotation.x = PI / 2; ring.add(hub);
      for (let p = 0; p < N; p++) {
        const a = p / N * TAU, sx = Math.sin(a), sy = Math.cos(a);
        const st = new Mesh(new BoxGeometry(0.9, 0.5, 1.3), Mt.oxide); st.position.set(sx * Rt, sy * Rt, 0); st.rotation.z = -a; ring.add(st);
        const nm = this.numara(p + 1, 0.5); nm.position.set(sx * Rt * 0.72, sy * Rt * 0.72, 0.75); ring.add(nm);
        const s = stOf[p];
        if (s) { const rg = new Mesh(this.ringL, this.mat(s)); rg.position.set(sx * Rt * 0.72, sy * Rt * 0.72, 0.68); ring.add(rg); }
        const t = byId(toolLib(m), arr[p]!);
        if (!t || t.kind === 'empty') continue;
        const obj = CNC3D.build(t), lathe = CNC3D.isLatheTool(t), o = CNC3D.fit(obj, 2.5), bb = new Box3().setFromObject(o);
        if (lathe) o.position.x -= bb.min.x; else o.position.y -= bb.max.y;
        const holder = new Group(); holder.add(o); holder.position.set(sx * (Rt + 0.15), sy * (Rt + 0.15), 0); holder.rotation.z = lathe ? (PI / 2 - a) : (PI - a); ring.add(holder);
      }
      this.info = { lathe: true, N, R: Rt, ring };
    } else {
      const Rm = Math.max(4.2, N * 1.3 / TAU), top = 2.9;
      const plate = new Mesh(new CylinderGeometry(Rm + 0.9, Rm + 0.9, 0.3, 64), Mt.dark); plate.position.y = top + 0.2; ring.add(plate);
      const hub2 = new Mesh(new CylinderGeometry(1.2, 1.2, 0.8, 32), Mt.steel); hub2.position.y = top + 0.6; ring.add(hub2);
      for (let q = 0; q < N; q++) {
        const b2 = q / N * TAU, cx = Math.sin(b2) * Rm, cz = Math.cos(b2) * Rm;
        const sl = new Mesh(new CylinderGeometry(0.55, 0.55, 0.5, 20), Mt.steel); sl.position.set(cx, top, cz); ring.add(sl);
        const s = stOf[q];
        if (s) { const rg2 = new Mesh(this.ringG, this.mat(s)); rg2.rotation.x = PI / 2; rg2.position.set(cx, top + 0.38, cz); ring.add(rg2); }
        const nm2 = this.numara(q + 1, 0.55); nm2.position.set(Math.sin(b2) * (Rm + 1.35), top + 0.45, Math.cos(b2) * (Rm + 1.35)); ring.add(nm2);
        const tq = byId(toolLib(m), arr[q]!);
        if (!tq || tq.kind === 'empty') continue;
        const asm = CNC3D.assembly(tq, m);
        if (CNC3D.isLatheTool(tq)) asm.rotation.z = -PI / 2;
        const o2 = CNC3D.fit(asm, 2.7), bb2 = new Box3().setFromObject(o2);
        o2.position.y -= bb2.max.y; o2.position.y += top; o2.position.x += cx; o2.position.z += cz; ring.add(o2);
      }
      this.info = { lathe: false, N, R: Rm, ring };
    }
    const hl = new Mesh(new TorusGeometry(0.75, 0.07, 10, 40), pawlMat);
    if (this.info.lathe) hl.position.set(0, this.info.R + 2.95, 0.9); else { hl.rotation.x = PI / 2; hl.position.set(0, -0.15, this.info.R); }
    this.mag.add(hl);
  }

  // Önizleme etiketi (prototipte #lwPrevLabel): kabuk metni React'te yazar.
  static etiket(d: CarkSatiri, c: CarkKarti | null, tab: OnizlemeSekmesi): string {
    if (d.depot) return c ? c.t.name + (c.t.code ? ' · ' + c.t.code : '') : 'Depo boş';
    if (tab === 'mag') {
      return (d.m.type === 'lathe' ? 'Taret · ' : 'Magazin · ') + d.m.pockets + ' cep'
        + (c && !c.depot ? ' · T' + pad2(c.p + 1) + ' ' + c.t.name : '') + '  —  halka rengi = ömür';
    }
    return d.m.name + ' · ' + (d.m.code || '');
  }

  sync(d: CarkSatiri, c: CarkKarti | null, sekme: OnizlemeSekmesi, ver: number): void {
    const tab = d.depot ? 'item' : sekme, key = tab + '|' + (d.depot ? (c ? c.t.id : '-') : d.m.id + (tab === 'mag' ? '|' + ver : ''));
    this.sel = !d.depot && c && !c.depot ? c.p : null;
    if (key === this.key) return;
    this.key = key;
    this.clear(this.model); this.clear(this.mag); this.info = null;
    if (!d.depot && tab === 'mag') { this.buildMag(d.m, d); return; }
    const opt: Object3D | null = d.depot ? (c ? CNC3D.build(c.t) : null) : CNC3D.build(d.m);
    if (!opt || (d.depot && c?.t.kind === 'empty')) return;
    if (d.depot && c && CNC3D.isLatheTool(c.t)) opt.rotation.y = -0.35;
    if (!d.depot) this.yaw = -0.45;
    const o = CNC3D.fit(opt, d.depot ? 3.2 : 4.4), b = new Box3().setFromObject(o);
    o.position.y = -b.min.y + 0.02; this.model.add(o);
  }

  frame(renderer: WebGLRenderer, r: Dikdortgen, dt: number, kk: number): void {
    const mag = !!this.info;
    this.model.visible = !mag; this.plat.visible = !mag; this.mag.visible = mag; this.cam.aspect = r.width / r.height;
    if (this.info) {
      const I = this.info;
      if (I.lathe) { this.cam.position.set(0, 0.6, (I.R + 3.0) / Math.tan(17.5 * PI / 180) / Math.min(1, this.cam.aspect) * 1.02); this.cam.lookAt(0, 0.6, 0); }
      else { this.cam.position.set(0, 8.8, I.R + 17.5 / Math.min(1.3, this.cam.aspect)); this.cam.lookAt(0, 1.2, I.R - 3.2); }
      if (this.sel != null) {
        const tg = this.sel / I.N * TAU;
        let cur = I.lathe ? I.ring.rotation.z : -I.ring.rotation.y;
        cur += Math.atan2(Math.sin(tg - cur), Math.cos(tg - cur)) * kk;
        if (I.lathe) I.ring.rotation.z = cur; else I.ring.rotation.y = -cur;
      }
    } else {
      this.auto -= dt;
      if (this.auto <= 0 && this.drag == null) this.yaw += dt * 0.45;
      this.model.rotation.y = this.yaw;
      this.cam.position.set(0, 3.0, 9.6); this.cam.lookAt(0, 2.05, 0);
    }
    this.cam.updateProjectionMatrix();
    renderer.setClearColor(sahneRengi(this.palet.zemin), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
  }

  surukle(x: number): void {
    if (this.drag == null) return;
    this.yaw += (x - this.drag) * 0.012; this.drag = x; this.auto = 2.5;
  }

  dispose(): void {
    this.clear(this.model); this.clear(this.mag);
    Object.values(this.mats).forEach((m) => m.dispose());
    this.ringG.dispose(); this.ringL.dispose();
  }
}
