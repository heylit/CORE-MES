import {
  ArrowHelper, AxesHelper, Box3, BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, EdgesGeometry, Group,
  LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3,
  type Object3D, type WebGLRenderer,
} from 'three';
import { gParse } from '../hesap/gkod.ts';
import { S } from '../parca-durumu.ts';
import type { Dikdortgen } from '../sahne/Sahne.tsx';
import { envTex, lights } from '../sahne/gl.ts';
import { disposeObj, Orbit, sizeSprite, textSprite, type OrbitGorunusu } from '../sahne/yardimci.ts';
import { camToGlobal } from './cekirdek.ts';
import { camKaydi } from './durum.ts';
import { CS, type CamGeo } from './is.ts';
import { islemRengi3, sahneRengi, sahneRengi3 } from './renk.ts';
import type { Baglama, BaglamaSonucu, Ulasilamaz } from './tipler.ts';
import type { TornaIslemi, TornaSonucu } from './torna.ts';

// Oto-CAM sahnesi (prototipin CS.scene, csObj ve camScene* işlevleri): parça, ham çerçevesi, takım yolları, bağlama okları ve
// ulaşılamaz bölgeler. Kök X ekseni çevresinde -90° döner (CAM Z'si yukarı). Makine simülasyonu aynı sahnede ayrı köktedir
// (makine-sahnesi.ts).

function temizle(g: Group): void { while (g.children.length) { const c = g.children[0]!; g.remove(c); disposeObj(c); } }

// Hızlı hareket kesikli ve soluk, kesme işlem renginde.
export function cizgiler(pts: number[], renk: ReturnType<typeof sahneRengi3> | null): LineSegments {
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  if (!renk) {
    const l = new LineSegments(g, new LineDashedMaterial({ color: sahneRengi3('cam-hizli'), dashSize: 2, gapSize: 2, transparent: true, opacity: 0.6 }));
    l.computeLineDistances(); return l;
  }
  return new LineSegments(g, new LineBasicMaterial({ color: renk }));
}

// Torna (1) ve freze (2) yüzeyleri Ham Malzeme'nin yüzey sınıfıyla boyanır; üçgen sırası S.I ile aynıdır.
function parcaAgi(V: ArrayLike<number>, T: ArrayLike<number>, op: number): Mesh {
  const geo = new BufferGeometry(), g = S.geo, cls = g && g.cls && g.cls.length * 3 === T.length ? (g.rot ? g.cls : new Uint8Array(g.cls.length).fill(2)) : null;
  if (!cls) {
    const pos = new Float32Array(V.length); pos.set(V); geo.setAttribute('position', new BufferAttribute(pos, 3)); geo.setIndex(new BufferAttribute(new Uint32Array(T), 1));
  } else {
    const renk = { 1: sahneRengi3('cam-torna-yuzey'), 2: sahneRengi3('cam-freze-yuzey') } as const, n = T.length, P = new Float32Array(n * 3), C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = T[i]! * 3, c = renk[cls[(i / 3) | 0] === 1 ? 1 : 2];
      P[i * 3] = V[v]!; P[i * 3 + 1] = V[v + 1]!; P[i * 3 + 2] = V[v + 2]!; C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new BufferAttribute(P, 3)); geo.setAttribute('color', new BufferAttribute(C, 3));
  }
  geo.computeVertexNormals();
  return new Mesh(geo, new MeshStandardMaterial({
    color: cls ? sahneRengi3('beyaz') : sahneRengi3('cam-parca'), vertexColors: !!cls, metalness: cls ? 0 : 0.5, roughness: cls ? 0.85 : 0.4, transparent: true,
    opacity: cls ? 0.93 : op, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
}

function tornaNoktalari(text: string, f: (a: number[]) => number[]): { cut: number[]; rap: number[] } | null {
  let p: ReturnType<typeof gParse>;
  try { p = gParse(text, { dialect: 'iso', lathe: true, rapid: 30000 }); } catch { return null; }
  const cut: number[] = [], rap: number[] = [];
  p.moves.forEach((mv) => { const a = f(mv.a), b = f(mv.b); (mv.t ? cut : rap).push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!); });
  return { cut, rap };
}

export class CamSahnesi {
  readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(40, 1, 0.1, 100000);
  readonly root = new Group();
  readonly part = new Group();
  readonly stock = new Group();
  readonly paths = new Group();
  readonly deco = new Group();
  // Makine simülasyonu kökü (sahne koordinatı, dönmez).
  readonly ms = new Group();
  readonly orbit: Orbit;
  private kurulan = -1;
  private yollanan = -1;
  private sigan = -1;

  constructor(el: HTMLElement) {
    this.scene.environment = envTex; lights(this.scene, 1.1);
    this.root.rotation.x = -Math.PI / 2; this.scene.add(this.root);
    this.root.add(this.part, this.stock, this.paths, this.deco);
    this.ms.visible = false; this.scene.add(this.ms);
    this.orbit = new Orbit(el, this.cam);
  }

  // Durumda istenen yeniden kurulumlar (is.ts sahneKur / yollariKur / sigdir) karede uygulanır.
  esitle(): void {
    if (this.kurulan !== CS.sahne) { this.kurulan = CS.sahne; this.taban(); }
    if (this.yollanan !== CS.yollar) { this.yollanan = CS.yollar; this.yollar(); }
    if (this.sigan !== CS.sigdir) { const ilk = this.sigan < 0; this.sigan = CS.sigdir; this.sigdir(); if (ilk) this.orbit.snap(); }
  }

  taban(): void {
    temizle(this.part); temizle(this.stock); temizle(this.deco); const G = CS.G; if (!G) return;
    if (CS.mt) { this.tabanMT(G); return; }
    const mesh = parcaAgi(G.dispV || G.V, G.T, 0.55);
    if (G.bar) mesh.rotation.y = Math.PI / 2;
    this.part.add(mesh);
    const lm = new LineBasicMaterial({ color: sahneRengi3('vurgu'), transparent: true, opacity: 0.6 });
    if (!G.bar) {
      const b = new BoxGeometry(G.stock.Lx, G.stock.Ly, G.stock.Lz), e = new LineSegments(new EdgesGeometry(b), lm); b.dispose();
      e.position.set(G.stock.Lx / 2, G.stock.Ly / 2, -G.stock.Lz / 2); this.stock.add(e);
    } else {
      [G.D0!, G.ID || 0].forEach((d) => {
        if (!(d > 0)) return;
        const cy = new CylinderGeometry(d / 2, d / 2, G.L0!, 48, 1, true), e2 = new LineSegments(new EdgesGeometry(cy, 20), lm); cy.dispose();
        e2.rotation.z = Math.PI / 2; e2.position.x = G.face! - G.L0! / 2; this.stock.add(e2);
      });
    }
    this.deco.add(new AxesHelper(Math.max(20, (G.bar ? G.L0! : Math.max(G.stock.Lx, G.stock.Ly)) * 0.18)));
    const zl = textSprite(G.bar ? 'Z0 · ön alın' : 'X0 Y0 Z0', sahneRengi('yazi')); sizeSprite(zl, 6); zl.position.set(0, 0, 8); this.deco.add(zl);
  }

  private tabanMT(G: CamGeo): void {
    const J = CS.mt!, R = G.R!, Lp = G.stock.Lx;
    this.part.add(parcaAgi(G.V, G.T, 0.6));
    const D0 = J.D0, face = J.face, L = Lp + face + 14, cy = new CylinderGeometry(D0 / 2, D0 / 2, L, 48, 1, true);
    const e = new LineSegments(new EdgesGeometry(cy, 20), new LineBasicMaterial({ color: sahneRengi3('vurgu'), transparent: true, opacity: 0.45 })); cy.dispose();
    e.rotation.z = Math.PI / 2; e.position.set(-face + L / 2, R, -R); this.stock.add(e);
    if (J.ID > 0) {
      const ci = new CylinderGeometry(J.ID / 2, J.ID / 2, L, 48, 1, true), ei = new LineSegments(new EdgesGeometry(ci, 20), e.material); ci.dispose();
      ei.rotation.z = Math.PI / 2; ei.position.copy(e.position); this.stock.add(ei);
    }
    const ch = new Mesh(new CylinderGeometry(D0 / 2 + 14, D0 / 2 + 14, 10, 40), new MeshStandardMaterial({ color: sahneRengi3('cam-ayna'), metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.5 }));
    ch.rotation.z = Math.PI / 2; ch.position.set(Lp + 14 + 5, R, -R); this.deco.add(ch);
    const cl = textSprite('Ayna (OP10)', sahneRengi('cam-alin')); sizeSprite(cl, 5); cl.position.set(Lp + 19, R, -R + D0 / 2 + 22); this.deco.add(cl);
    const zl = textSprite('Z0 · ön alın', sahneRengi('yazi')); sizeSprite(zl, 6); zl.position.set(-4, R, -R + D0 / 2 + 10); this.deco.add(zl);
    this.deco.add(new ArrowHelper(new Vector3(1, 0, 0), new Vector3(-face - 12, R, -R), Lp + face + 40, sahneRengi3('cam-hizli'), 4, 2));
  }

  private ulasilamaz(L: Ulasilamaz[], sariKenar: boolean): void {
    L.forEach((u) => {
      const b = u.box, g = new BoxGeometry(b[3]! - b[0]!, b[4]! - b[1]!, b[5]! - b[2]!);
      const m = new Mesh(g, new MeshBasicMaterial({ color: sahneRengi3(sariKenar && u.clamp ? 'uyari' : 'cam-ulasilamaz'), transparent: true, opacity: 0.35, depthWrite: false }));
      m.position.set((b[0]! + b[3]!) / 2, (b[1]! + b[4]!) / 2, (b[2]! + b[5]!) / 2); this.paths.add(m);
    });
  }

  // Freze işleminin yolu bağlamanın yerel çerçevesinden parça koordinatına çevrilir.
  private islemYolu(s: Baglama, R: BaglamaSonucu, op: BaglamaSonucu['ops'][number], safe: number, hizli: boolean): void {
    const M = s.M ?? R.M, cut: number[] = [], rap: number[] = [];
    let cur = [0, 0, safe + 30];
    if (op.cyc) {
      op.cyc.holes.forEach((h) => { const a = camToGlobal(M, s.dir, h.x, h.y, h.top + 3), b = camToGlobal(M, s.dir, h.x, h.y, h.top - h.depth); cut.push(a[0], a[1], a[2], b[0], b[1], b[2]); });
    } else {
      op.mv.forEach((m) => {
        const nx = [m.x != null ? m.x : cur[0]!, m.y != null ? m.y : cur[1]!, m.z != null ? m.z : cur[2]!];
        const a = camToGlobal(M, s.dir, cur[0]!, cur[1]!, cur[2]!), b = camToGlobal(M, s.dir, nx[0]!, nx[1]!, nx[2]!);
        (m.t ? cut : rap).push(a[0], a[1], a[2], b[0], b[1], b[2]); cur = nx;
      });
    }
    this.paths.add(cizgiler(cut, islemRengi3(op.kind)));
    if (hizli && rap.length) this.paths.add(cizgiler(rap, null));
  }

  yollar(): void {
    temizle(this.paths);
    if (CS.mt) { this.yollarMT(); return; }
    const c = camKaydi(), vis = c.vis;
    if (CS.lathe) { this.tornaYolu(CS.lathe); return; }
    const J = CS.job; if (!J) return;
    J.setups.forEach((s, si) => {
      if (c.sel != null && c.sel >= 0 && c.sel !== si) return;
      const R = J.res[si]; if (!R || !s.M) return;
      R.ops.forEach((op, oi) => { if (vis[si + ':' + oi] === false) return; this.islemYolu(s, R, op, J.prm.safe, vis['rapid'] !== false); });
      const st = J.G.stock, az = s.dir.az, m = [st.Lx / 2 + az[0] * (st.Lx / 2 + 18), st.Ly / 2 + az[1] * (st.Ly / 2 + 18), -st.Lz / 2 + az[2] * (st.Lz / 2 + 18)] as const;
      this.paths.add(new ArrowHelper(new Vector3(-az[0], -az[1], -az[2]), new Vector3(m[0], m[1], m[2]), 14, sahneRengi3('vurgu'), 5, 3));
      const lb = textSprite('OP' + ((si + 1) * 10) + ' · ' + s.dir.name, sahneRengi('vurgu')); sizeSprite(lb, 6);
      lb.position.set(m[0] + az[0] * 6, m[1] + az[1] * 6, m[2] + az[2] * 6 + 4); this.paths.add(lb);
    });
    this.ulasilamaz(J.AS!.unreach, true);
  }

  private tornaYolu(L: TornaSonucu): void {
    const prof: number[] = [], pr = L.prof;
    for (let i = 1; i < pr.length; i++) prof.push(pr[i - 1]!.z, pr[i - 1]!.r, 0, pr[i]!.z, pr[i]!.r, 0);
    this.paths.add(cizgiler(prof, sahneRengi3('ok')));
    const q = tornaNoktalari(L.text, (a) => [a[2]!, a[0]!, 0.2]);
    if (q) { this.paths.add(cizgiler(q.cut, islemRengi3('lathe'))); this.paths.add(cizgiler(q.rap, null)); }
  }

  private yollarMT(): void {
    const J = CS.mt!, R = J.R, Lp = J.Lp, c = camKaydi(), sel = c.selRow != null && c.selRow >= 0 ? J.rows[c.selRow] ?? null : null, hizli = c.vis['rapid'] !== false;
    const f1 = (a: number[]): number[] => [-a[2]!, R, a[0]! - R], f2 = (a: number[]): number[] => [Lp + a[2]!, R, -R - a[0]!];
    const torna = (L: TornaSonucu, f: (a: number[]) => number[], renk: string, lo: TornaIslemi | undefined): void => {
      const txt = lo ? L.lines.slice(0, L.hdr).concat(L.lines.slice(lo.i0, lo.i1)).join('\n') : L.text, q = tornaNoktalari(txt, f); if (!q) return;
      this.paths.add(cizgiler(q.cut, sahneRengi3(renk))); if (hizli && q.rap.length) this.paths.add(cizgiler(q.rap, null));
    };
    const pr: number[] = [], P = J.P.prof;
    for (let i = 1; i < P.length; i++) {
      pr.push(-P[i - 1]!.z, R, P[i - 1]!.r - R, -P[i]!.z, R, P[i]!.r - R);
      pr.push(-P[i - 1]!.z, R, -R - P[i - 1]!.r, -P[i]!.z, R, -R - P[i]!.r);
    }
    this.paths.add(cizgiler(pr, sahneRengi3('ok')));
    if (!sel || sel.proc === 'turn') {
      if (!sel || sel.L === J.L1) torna(J.L1, f1, 'vurgu', sel ? sel.lo : undefined);
      if (!sel || sel.L === J.L2) torna(J.L2, f2, 'cam-torna-arka', sel ? sel.lo : undefined);
    }
    J.AS.setups.forEach((s, si) => {
      const Rr = J.res[si]; if (!Rr || !s.M) return; let any = false;
      Rr.ops.forEach((op) => { if (sel && (sel.proc !== 'mill' || sel.mop !== op)) return; any = true; this.islemYolu(s, Rr, op, J.prm.safe, hizli); });
      if (!any && sel) return;
      const az = s.dir.az, m = s.dir.axial ? [s.dir.back ? Lp + 22 : -22, R, -R] : [s.cx!, R + az[1] * (R + 20), -R + az[2] * (R + 20)];
      this.paths.add(new ArrowHelper(new Vector3(-az[0], -az[1], -az[2]), new Vector3(m[0], m[1], m[2]), 14, sahneRengi3('acik-mavi'), 5, 3));
      const lb = textSprite('OP' + (s.opn || s.op) + ' · ' + (s.dir.axial ? s.dir.name.split(' ·')[0] : 'C' + s.dir.C + '°'), sahneRengi('acik-mavi')); sizeSprite(lb, 5.5);
      lb.position.set(m[0]! + az[0] * 6, m[1]! + az[1] * 6, m[2]! + az[2] * 6 + 4); this.paths.add(lb);
    });
    this.ulasilamaz(J.AS.unreach, false);
  }

  sigdir(v?: OrbitGorunusu | string): void {
    this.root.updateMatrixWorld(true);
    const b = new Box3().setFromObject(this.stock);
    if (b.isEmpty()) b.setFromObject(this.part);
    if (b.isEmpty()) b.set(new Vector3(-50, -50, -50), new Vector3(50, 50, 50));
    this.orbit.fit(b.expandByScalar(15), v || 'iso');
  }

  goster(o: 'part' | 'stock'): void { const g: Object3D = o === 'part' ? this.part : this.stock; g.visible = !g.visible; }

  frame(renderer: WebGLRenderer, r: Dikdortgen, kk: number): void {
    this.esitle();
    this.orbit.update(Math.min(1, kk * 1.4), r.width / r.height);
    renderer.setClearColor(sahneRengi('arka'), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.orbit.birak();
    [this.part, this.stock, this.paths, this.deco, this.ms].forEach(temizle);
    // Sahne yeniden kurulunca durumun bütün istekleri yeniden uygulanır.
    this.kurulan = -1; this.yollanan = -1; this.sigan = -1;
  }
}
