import {
  AxesHelper, Box3, BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, EdgesGeometry, GridHelper, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, type WebGLRenderer,
} from 'three';
import { fmtN } from '../bicim.ts';
import { S, parcaSurumu } from '../parca-durumu.ts';
import type { Dikdortgen } from './Sahne.tsx';
import { envTex, lights } from './gl.ts';
import { sahneRengi, sahneRengi3 } from './renkler.ts';
import { disposeObj, Orbit, sizeSprite, textSprite, type OrbitGorunusu } from './yardimci.ts';

// Ham Malzeme sahnesi (prototipin S.scene, sSetMesh'teki S.mesh ve sVisual'ı): parça, hammadde gövdesi ve ölçü yazıları.
// Kök X ekseni çevresinde -90° döner (parça Z'si yukarı). Parça ya da hesap değişince (parcaDegisti) karede yeniden kurulur.

function temizle(g: Group): void { while (g.children.length) { const c = g.children[0]!; g.remove(c); disposeObj(c); } }

export class HamSahnesi {
  readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(40, 1, 0.1, 100000);
  readonly root = new Group();
  readonly part = new Group();
  readonly deco = new Group();
  readonly orbit: Orbit;
  private kurulan = -1;
  private agi: { P: Float32Array; I: Uint32Array } | null = null;
  private sigacak: Mesh | null = null;

  constructor(el: HTMLElement) {
    this.scene.environment = envTex; lights(this.scene, 1.15);
    this.root.rotation.x = -Math.PI / 2; this.scene.add(this.root);
    this.root.add(this.part, this.deco);
    this.orbit = new Orbit(el, this.cam);
  }

  private parca(): void {
    if (S.P === this.agi?.P && S.I === this.agi.I) return;
    temizle(this.part);
    this.agi = S.P && S.I ? { P: S.P, I: S.I } : null;
    if (!this.agi) return;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.agi.P, 3)); geo.setIndex(new BufferAttribute(this.agi.I, 1)); geo.computeVertexNormals();
    this.part.add(new Mesh(geo, new MeshStandardMaterial({ color: sahneRengi3('cam-parca'), metalness: 0.45, roughness: 0.42, side: DoubleSide })));
  }

  // Prototipin sVisual'ı: hammadde yarı saydam gövde ve kenar çizgisi, ölçü yazıları, ızgara ve eksenler.
  private gorsel(): void {
    temizle(this.deco); this.sigacak = null;
    this.part.quaternion.copy(S.q);
    const r = S.res; if (!r) return;
    const c = r.ctr, sz = Math.max(r.dim[0]!, r.dim[1]!, r.dim[2]!, 10), lh = sz * 0.1;
    const dolgu = new MeshStandardMaterial({ color: sahneRengi3('vurgu'), transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide, metalness: 0, roughness: 1 });
    const cizgi = new LineBasicMaterial({ color: sahneRengi3('vurgu'), transparent: true, opacity: 0.9 });
    if (!S.P) {
      const pb = new Mesh(new BoxGeometry(r.dim[0], r.dim[1], r.dim[2]), new MeshStandardMaterial({ color: sahneRengi3('cam-parca'), metalness: 0.45, roughness: 0.42, side: DoubleSide }));
      pb.position.set(c[0]!, c[1]!, c[2]!); this.deco.add(pb);
    }
    let alt: number;
    if (r.type === 'bar' && r.D != null && r.L != null) {
      const ai = r.ai ?? 0, g = new CylinderGeometry(r.D / 2, r.D / 2, r.L, 64, 1, false);
      if (ai === 0) g.rotateZ(Math.PI / 2); else if (ai === 2) g.rotateX(Math.PI / 2);
      const govde = new Mesh(g, dolgu); govde.position.set(c[0]!, c[1]!, c[2]!); this.deco.add(govde); this.sigacak = govde;
      const kenar = new LineSegments(new EdgesGeometry(g, 30), cizgi); kenar.position.copy(govde.position); this.deco.add(kenar);
      if (r.ID && r.ID > 0) {
        const gi = new CylinderGeometry(r.ID / 2, r.ID / 2, r.L, 48, 1, true);
        if (ai === 0) gi.rotateZ(Math.PI / 2); else if (ai === 2) gi.rotateX(Math.PI / 2);
        const ic = new LineSegments(new EdgesGeometry(gi, 30), cizgi); gi.dispose(); ic.position.copy(govde.position); this.deco.add(ic);
      }
      const s1 = textSprite('Ø ' + fmtN(r.D, r.D % 1 ? 1 : 0), sahneRengi('vurgu')), s2 = textSprite('L ' + fmtN(r.L, r.L % 1 ? 1 : 0), sahneRengi('vurgu'));
      sizeSprite(s1, lh); sizeSprite(s2, lh);
      const p1 = c.slice(), p2 = c.slice(); p1[(ai + 2) % 3]! += r.D / 2 + lh; p2[(ai + 1) % 3]! += r.D / 2 + lh;
      s1.position.set(p1[0]!, p1[1]!, p1[2]!); s2.position.set(p2[0]!, p2[1]!, p2[2]!); this.deco.add(s1, s2);
      alt = ai !== 2 ? r.D / 2 : r.L / 2;
    } else {
      const SS = r.S ?? r.dim, g = new BoxGeometry(SS[0], SS[1], SS[2]);
      const govde = new Mesh(g, dolgu); govde.position.set(c[0]!, c[1]!, c[2]!); this.deco.add(govde); this.sigacak = govde;
      const kenar = new LineSegments(new EdgesGeometry(g), cizgi); kenar.position.copy(govde.position); this.deco.add(kenar);
      const h0 = [SS[0]! / 2, SS[1]! / 2, SS[2]! / 2], renk = ['hata', 'ok', 'acik-mavi'], ad = ['X', 'Y', 'Z'];
      const yer = [[c[0]!, c[1]! - h0[1]! - lh, c[2]! - h0[2]!], [c[0]! + h0[0]! + lh * 1.6, c[1]!, c[2]! - h0[2]!], [c[0]! + h0[0]! + lh * 0.6, c[1]! - h0[1]! - lh * 0.6, c[2]!]];
      for (let i = 0; i < 3; i++) {
        const v = SS[i]!, sp = textSprite(ad[i]! + ' ' + fmtN(v, v % 1 ? 1 : 0), sahneRengi(renk[i]!)); sizeSprite(sp, lh);
        sp.position.set(yer[i]![0]!, yer[i]![1]!, yer[i]![2]!); this.deco.add(sp);
      }
      alt = SS[2]! / 2;
    }
    const izgara = new GridHelper(sz * 1.8, 18, sahneRengi3('izgara-1'), sahneRengi3('izgara-2'));
    izgara.rotation.x = Math.PI / 2; izgara.position.set(c[0]!, c[1]!, c[2]! - alt - 0.5); this.deco.add(izgara);
    const eksen = new AxesHelper(sz * 0.25); eksen.position.set(c[0]! - sz * 0.9, c[1]! - sz * 0.9, izgara.position.z); this.deco.add(eksen);
    if (S.fitPending) { S.fitPending = false; this.sigdir('iso'); }
  }

  sigdir(v?: OrbitGorunusu | string): void {
    this.root.updateMatrixWorld(true);
    const b = this.sigacak ? new Box3().setFromObject(this.sigacak) : new Box3().setFromObject(this.deco);
    if (b.isEmpty()) b.setFromObject(this.part);
    if (b.isEmpty()) b.set(new Vector3(-50, -50, -50), new Vector3(50, 50, 50));
    this.orbit.fit(b.expandByScalar(b.getSize(new Vector3()).length() * 0.08), v || 'iso');
  }

  frame(renderer: WebGLRenderer, r: Dikdortgen, kk: number): void {
    const s = parcaSurumu();
    if (s !== this.kurulan) { const ilk = this.kurulan < 0; this.kurulan = s; this.parca(); this.gorsel(); if (ilk) { this.sigdir('iso'); this.orbit.snap(); } }
    this.orbit.update(Math.min(1, kk * 1.4), r.width / r.height);
    renderer.setClearColor(sahneRengi('arka'), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.orbit.birak();
    temizle(this.part); temizle(this.deco);
    this.agi = null; this.kurulan = -1;
  }
}
