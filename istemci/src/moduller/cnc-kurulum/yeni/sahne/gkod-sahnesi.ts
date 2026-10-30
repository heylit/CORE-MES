import {
  AxesHelper, Box3, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, FrontSide, GridHelper, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3,
  type Material, type WebGLRenderer,
} from 'three';
import { clamp } from '../bicim.ts';
import { gsimHazirla } from '../hesap/gkod.ts';
import { S } from '../parca-durumu.ts';
import { machine } from '../secici.ts';
import { haritaAgi, haritaYukle, yolTamponu, type HaritaAgi, type Rgb, type TalasRenkleri } from '../gkod/geometri.ts';
import { gPosAt } from '../gkod/oynatma.ts';
import { bilgi, GS } from '../gkod/simulasyon.ts';
import { TAKIM_RENKLERI } from '../gkod/takim.ts';
import type { YukseklikHaritasi } from '../gkod/talas.ts';
import type { Program, TakimNo } from '../gkod/tipler.ts';
import type { Kalem } from '../veri/tipler.ts';
import { assembly, isMillTool } from './cnc3d.ts';
import type { Dikdortgen } from './Sahne.tsx';
import { envTex, lights } from './gl.ts';
import { sahneRengi, sahneRengi3 } from './renkler.ts';
import { disposeObj, Orbit, sizeSprite, textSprite, type OrbitGorunusu } from './yardimci.ts';

// G-Kod Sim. sahnesi (prototipin GS.scene, gBuildPath, gBuildStock, gHMUpload, gSetTool ve PAGES.gcode karesi): takım yolu, talaş
// yüzeyi, parça gölgesi ve takım. Veri gkod/ altındadır (geometri.ts tamponları, talas.ts haritası); burada yalnız three nesnesi
// kurulur. Program, ham ya da harita değişince (gRefresh yeni nesne verir) karede yeniden kurulur.

function temizle(g: Group): void { while (g.children.length) { const c = g.children[0]!; g.remove(c); disposeObj(c); } }

// Takım renkleri arayüzle aynı tasarım değişkenleridir (takim.ts); sahne değişkeni okuyup rengi çözer.
const takimRengiOnbellegi = new Map<number, Color>();
function takimRengi(sira: number): Color {
  const v = takimRengiOnbellegi.get(sira);
  if (v) return v;
  let deger = '';
  try { deger = getComputedStyle(document.documentElement).getPropertyValue(TAKIM_RENKLERI[sira % TAKIM_RENKLERI.length]!).trim(); } catch { /* tarayıcı dışı */ }
  const c = new Color().setStyle(deger || sahneRengi('yazi-ikincil'));
  takimRengiOnbellegi.set(sira, c);
  return c;
}
const rgb = (c: Color): Rgb => [c.r, c.g, c.b];
const takimCss = (sira: number): string => '#' + takimRengi(sira).getHexString();

function talasRenkleri(): TalasRenkleri {
  const r = (ad: string): Rgb => rgb(sahneRengi3(ad));
  return { ust: r('ham'), derin: r('mavi'), orta: r('acik-mavi'), tamam: r('ok'), fazla: r('uyari'), dalma: r('m-yakut'), disari: r('cam-hizli'), mor: r('mor') };
}

interface Harita { hm: YukseklikHaritasi; ag: HaritaAgi; geo: BufferGeometry; duvar: BufferGeometry; yuzey: Mesh; duvarAgi: Mesh; alt: Mesh; iz: string }
interface Yol { kesmeBitti: LineSegments; hizliBitti: LineSegments; hizliGolge: LineSegments; rEnd: Uint32Array; cEnd: Uint32Array }

export class GkodSahnesi {
  readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(40, 1, 0.1, 100000);
  readonly root = new Group();
  readonly path = new Group();
  readonly stock = new Group();
  readonly part = new Group();
  readonly tool = new Group();
  readonly orbit: Orbit;
  private prog: Program | null = null;
  private hm: YukseklikHaritasi | null | undefined = undefined;
  private yol: Yol | null = null;
  private harita: Harita | null = null;
  private takim: TakimNo | null = null;
  private renkler: TalasRenkleri | null = null;

  constructor(el: HTMLElement) {
    this.scene.environment = envTex; lights(this.scene, 1.1);
    this.root.rotation.x = -Math.PI / 2; this.scene.add(this.root);
    this.root.add(this.path, this.stock, this.part, this.tool);
    this.orbit = new Orbit(el, this.cam);
  }

  // Prototipin gBuildPath'i ve gTcMarkers'ı: kesme takım renginde, hızlı hareket soluk; geçilen kısım koyu çizilir.
  private yolKur(p: Program): void {
    temizle(this.path); this.yol = null;
    const t = yolTamponu(p, (T) => rgb(takimRengi(bilgi(T).col)));
    const konum = (a: Float32Array): BufferAttribute => new BufferAttribute(a, 3);
    const kA = konum(t.kesme), rA = konum(t.hizli), cA = konum(t.kesmeRengi);
    const seg = (pa: BufferAttribute, ca: BufferAttribute | null, mat: LineBasicMaterial): LineSegments => {
      const g = new BufferGeometry(); g.setAttribute('position', pa); if (ca) g.setAttribute('color', ca);
      const l = new LineSegments(g, mat); l.frustumCulled = false; this.path.add(l); return l;
    };
    seg(kA, cA, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22 }));
    const kesmeBitti = seg(kA, cA, new LineBasicMaterial({ vertexColors: true }));
    const hizliGolge = seg(rA, null, new LineBasicMaterial({ color: sahneRengi3('vurgu'), transparent: true, opacity: 0.16 }));
    const hizliBitti = seg(rA, null, new LineBasicMaterial({ color: sahneRengi3('vurgu'), transparent: true, opacity: 0.75 }));
    this.yol = { kesmeBitti, hizliBitti, hizliGolge, rEnd: t.rEnd, cEnd: t.cEnd };
    if (!p.moves.length) return;
    const b = p.bounds, span = Math.max(20, b[3]! - b[0]!, b[4]! - b[1]!);
    let son: TakimNo | null = null;
    for (const mv of p.moves) {
      if (mv.T === son) continue;
      son = mv.T;
      const sira = bilgi(mv.T).col, sp = textSprite('⟳ T' + String(mv.T), takimCss(sira));
      sizeSprite(sp, span * 0.035); sp.position.set(mv.b[0]!, mv.b[1]!, mv.b[2]! + span * 0.03); this.path.add(sp);
      const nokta = new Mesh(new SphereGeometry(span * 0.006, 12, 8), new MeshBasicMaterial({ color: takimRengi(sira) }));
      nokta.position.set(mv.b[0]!, mv.b[1]!, mv.b[2]!); this.path.add(nokta);
    }
  }

  // Prototipin gBuildStock'u: ızgara, eksen, program sıfırı; ham kutu varsa talaş yüzeyi, yan duvar, taban ve parça gölgesi.
  private hamKur(p: Program): void {
    temizle(this.stock); temizle(this.part); this.harita = null;
    const sb = GS.sb, gs = gsimHazirla();
    const span = p.bounds[3]! > p.bounds[0]! ? Math.max(p.bounds[3]! - p.bounds[0]!, p.bounds[4]! - p.bounds[1]!, 20) : 100;
    const izgara = new GridHelper(span * 1.8, 24, sahneRengi3('izgara-1'), sahneRengi3('izgara-2'));
    izgara.rotation.x = Math.PI / 2;
    izgara.position.set((p.bounds[0]! + p.bounds[3]!) / 2 || 0, (p.bounds[1]! + p.bounds[4]!) / 2 || 0, sb ? sb.z0 - 0.5 : (p.bounds[2] || 0) - 1);
    this.stock.add(izgara, new AxesHelper(Math.max(10, span * 0.15)));
    const sifir = textSprite('Program sıfırı', sahneRengi('yazi')); sizeSprite(sifir, Math.max(2.5, span * 0.03)); sifir.position.set(0, 0, Math.max(4, span * 0.05));
    this.stock.add(sifir);
    const hm = GS.hm;
    if (!sb || gs.lathe || !hm) return;
    const ag = haritaAgi(hm), sx = sb.x1 - sb.x0, sy = sb.y1 - sb.y0;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(ag.konum, 3)); geo.setAttribute('color', new BufferAttribute(ag.renk, 3)); geo.setIndex(new BufferAttribute(ag.indis, 1));
    const yuzey = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4, side: DoubleSide }));
    const duvar = new BufferGeometry(); duvar.setAttribute('position', new BufferAttribute(ag.duvar, 3)); duvar.setIndex(ag.duvarIndis); duvar.computeVertexNormals();
    const duvarAgi = new Mesh(duvar, new MeshStandardMaterial({ color: sahneRengi3('ham-K'), metalness: 0.6, roughness: 0.45, side: DoubleSide }));
    const alt = new Mesh(new PlaneGeometry(sx, sy), new MeshStandardMaterial({ color: sahneRengi3('ham-alt'), side: DoubleSide }));
    alt.position.set(sb.x0 + sx / 2, sb.y0 + sy / 2, sb.z0);
    this.stock.add(yuzey, duvarAgi, alt);
    this.harita = { hm, ag, geo, duvar, yuzey, duvarAgi, alt, iz: '' };
    if (GS.used === 'ham' && S.P && S.I && sb.shift) {
      const pg = new BufferGeometry(); pg.setAttribute('position', new BufferAttribute(S.P, 3)); pg.setIndex(new BufferAttribute(S.I, 1)); pg.computeVertexNormals();
      const golge = new Mesh(pg, new MeshStandardMaterial({
        color: sahneRengi3('ok'), transparent: true, opacity: 0.14, depthWrite: false, metalness: 0.1, roughness: 0.6, side: FrontSide,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      }));
      golge.quaternion.copy(S.q); golge.position.set(sb.shift[0] ?? 0, sb.shift[1] ?? 0, sb.shift[2] ?? 0); golge.renderOrder = 5;
      this.part.add(golge);
    }
  }

  // Prototipin gHMUpload'u: yükseklik ve renk ağa yazılır; yalnız harita ilerleyince ya da karşılaştırma değişince.
  private haritaYaz(): void {
    const h = this.harita; if (!h) return;
    const gs = gsimHazirla(), iz = h.hm.done + ':' + GS.idx + ':' + GS.frac.toFixed(3) + ':' + String(!!gs.compare);
    if (iz === h.iz) return;
    h.iz = iz;
    this.renkler ??= talasRenkleri();
    haritaYukle(h.hm, h.ag, !!gs.compare, this.renkler);
    const pos = h.geo.getAttribute('position'), col = h.geo.getAttribute('color'), dv = h.duvar.getAttribute('position');
    pos.needsUpdate = true; col.needsUpdate = true; dv.needsUpdate = true;
    h.geo.computeVertexNormals();
  }

  // Prototipin gSetTool'u: freze takımı tezgâhın takım tutucusuyla, diğerleri yalın silindirle çizilir.
  private takimKur(T: TakimNo | null): void {
    if (T === this.takim) return;
    this.takim = T; temizle(this.tool);
    if (T == null) return;
    const ti = bilgi(T), g = new Group(), m = machine();
    let h = 40;
    if (ti.t && isMillTool(ti.t as unknown as Kalem) && !ti.dOv && ti.t.kind !== 'probe') {
      const asm = assembly(ti.t as unknown as Kalem, m.type === 'lathe' ? { ...m, type: 'mill', taper: 'HSK-A63' } : m);
      asm.scale.setScalar(10);
      const w = new Group(); w.add(asm); w.rotation.x = Math.PI / 2; w.updateMatrixWorld(true);
      const bb = new Box3().setFromObject(w); w.position.z = -bb.min.z; h = bb.max.z - bb.min.z; g.add(w);
    } else {
      const r = ti.d / 2, L = Math.max(r * 3, 18), renk = takimRengi(ti.col);
      const mat: Material = new MeshStandardMaterial({ color: renk, metalness: 0.6, roughness: 0.35, emissive: renk, emissiveIntensity: 0.15 }); mat.userData['own'] = true;
      const kesici = new Mesh(new CylinderGeometry(r, r, L, 28), mat); kesici.rotation.x = Math.PI / 2; kesici.position.z = L / 2 + (ti.ball ? r : 0); g.add(kesici);
      if (ti.ball) { const top = new Mesh(new SphereGeometry(r, 24, 16), mat); top.position.z = r; g.add(top); }
      const tm: Material = new MeshStandardMaterial({ color: sahneRengi3('m-alu'), metalness: 0.9, roughness: 0.3 }); tm.userData['own'] = true;
      const tutucu = new Mesh(new CylinderGeometry(Math.max(r + 6, 16), Math.max(r + 3, 10), 30, 28), tm);
      tutucu.rotation.x = Math.PI / 2; tutucu.position.z = L + 15 + (ti.ball ? r : 0); g.add(tutucu); h = L + 30;
    }
    const sp = textSprite('T' + String(T) + ' · ' + ti.name, takimCss(ti.col)); sizeSprite(sp, clamp(ti.d * 0.4, 3.5, 9)); sp.position.z = h + 8; g.add(sp);
    this.tool.add(g);
  }

  // Görünürlük anahtarları (prototipin gApplyVis'i).
  private gorunurluk(): void {
    const gs = gsimHazirla(), y = this.yol, h = this.harita;
    if (y) { y.hizliGolge.visible = y.hizliBitti.visible = !!gs.showRapid; }
    if (h) { h.yuzey.visible = h.duvarAgi.visible = h.alt.visible = !!gs.removal; }
    this.part.visible = !!gs.showPart;
  }

  sigdir(v?: OrbitGorunusu | string): void {
    this.root.updateMatrixWorld(true);
    const b = new Box3();
    if (this.yol) b.setFromObject(this.yol.kesmeBitti);
    if (this.harita) b.union(new Box3().setFromObject(this.harita.yuzey)).union(new Box3().setFromObject(this.harita.alt));
    if (b.isEmpty()) b.setFromObject(this.path);
    if (b.isEmpty()) b.set(new Vector3(-50, -50, -50), new Vector3(50, 50, 50));
    this.orbit.fit(b, v || 'iso');
  }

  frame(renderer: WebGLRenderer, r: Dikdortgen, kk: number): void {
    const p = GS.prog;
    if (p !== this.prog) {
      const ilk = this.prog === null; this.prog = p; this.hm = undefined; this.takim = null; temizle(this.tool);
      if (p) this.yolKur(p); else { temizle(this.path); this.yol = null; }
      if (p) { this.hm = GS.hm; this.hamKur(p); this.sigdir('iso'); if (ilk) this.orbit.snap(); }
    } else if (p && GS.hm !== this.hm) { this.hm = GS.hm; this.yolKur(p); this.hamKur(p); this.takim = null; temizle(this.tool); }
    if (p && p.moves.length && this.yol) {
      const mv = p.moves[GS.idx]!, pp = gPosAt(p, GS.idx, GS.frac);
      this.takimKur(mv.T); this.tool.position.set(pp[0], pp[1], pp[2]);
      const bitti = GS.frac >= 0.999 ? GS.idx + 1 : GS.idx;
      this.yol.kesmeBitti.geometry.setDrawRange(0, bitti ? this.yol.cEnd[bitti - 1]! : 0);
      this.yol.hizliBitti.geometry.setDrawRange(0, bitti ? this.yol.rEnd[bitti - 1]! : 0);
      this.haritaYaz();
      if (gsimHazirla().follow) { this.root.updateMatrixWorld(true); this.orbit.tTarget.copy(this.tool.getWorldPosition(new Vector3())); }
    }
    this.gorunurluk();
    this.orbit.update(Math.min(1, kk * 1.4), r.width / r.height);
    renderer.setClearColor(sahneRengi('arka'), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.orbit.birak();
    [this.path, this.stock, this.part, this.tool].forEach(temizle);
    this.prog = null; this.hm = undefined; this.yol = null; this.harita = null; this.takim = null;
  }
}
