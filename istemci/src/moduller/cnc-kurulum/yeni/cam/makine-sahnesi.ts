import {
  Box3, BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, FrontSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  SphereGeometry, Vector3, type Object3D,
} from 'three';
import { clamp } from '../bicim.ts';
import { fmtT as sureYazi } from '../hesap/gkod.ts';
import { dispose as modelBirak, CNC3D } from '../sahne/cnc3d.ts';
import { envTex } from '../sahne/gl.ts';
import { disposeObj } from '../sahne/yardimci.ts';
import { camDegisti, CS } from './is.ts';
import {
  msAdvance, msBaslat, msCmpColor, msMeshChunk, msPartSDF, msReset, msSegAt, msSegPlace, type Benzetim, type KarsilastirmaSayaci, type SimParcasi,
} from './makine-sim.ts';
import { islemRengi3, sahneRengi3 } from './renk.ts';
import { cizgiler, type CamSahnesi } from './sahne.ts';
import type { CamTakim, MtIs } from './tipler.ts';

// Torna-freze makine simülasyonunun sahne kısmı (prototipin msMachine, msPose, msRemesh, msPathDraw, msStart/msStop, msFrame):
// makine modeli, aynalar, takım, talaş alanının yüzeyi, takım yolu ve çarpışma noktaları. Talaş ve zaman hesabı makine-sim.ts'te.

interface Ayna extends Group { jaws: Mesh[]; setJaw: (r: number) => void }

function temizle(g: Group): void { while (g.children.length) { const c = g.children[0]!; g.remove(c); modelBirak(c); disposeObj(c); } }

export class MakineSimulasyonu {
  on = false;
  play = false;
  speed = 10;
  show = { shell: false, path: true, cmp: false };
  S: Benzetim | null = null;
  PS: Float32Array | null = null;
  cmpN: KarsilastirmaSayaci = { g: 0, l: 0, ok: 0 };
  // Kaydırıcı sürüklenirken oynatma konumu yazılmaz.
  dragging = false;
  private readonly sahne: CamSahnesi;
  private readonly root: Group;
  private mach: Object3D | null = null;
  private chMain: Ayna | null = null;
  private chSub: Ayna | null = null;
  private spin = new Group();
  private partIn = new Group();
  private stub: Mesh | null = null;
  private toolG = new Group();
  private tool: Group | null = null;
  private toolId = '';
  private pathG = new Group();
  private coll = new Group();
  private chunks: Record<number, Mesh> = {};
  private spinA = 0;
  private pathSi = -1;
  private collN = -1;
  private readonly mat = new MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32, envMap: envTex, side: FrontSide });
  private readonly steel = new MeshStandardMaterial({ color: sahneRengi3('cam-ms-celik'), metalness: 0.75, roughness: 0.3, envMap: envTex });
  private readonly dark = new MeshStandardMaterial({ color: sahneRengi3('cam-ms-koyu'), metalness: 0.5, roughness: 0.5 });

  constructor(sahne: CamSahnesi) { this.sahne = sahne; this.root = sahne.ms; }

  get J(): MtIs | null { return this.S ? this.S.J : null; }

  private ayna(R: number, jawR: number, len: number, dir: number): Ayna {
    const g = new Group() as Ayna, b = new Mesh(new CylinderGeometry(R, R, len, 48), this.dark); b.rotation.z = Math.PI / 2; b.position.x = -dir * len / 2; g.add(b);
    g.jaws = [];
    for (let i = 0; i < 3; i++) { const j = new Mesh(new BoxGeometry(22, 26, 18), this.steel), a = i * Math.PI * 2 / 3 + Math.PI / 2; j.userData['a'] = a; g.add(j); g.jaws.push(j); }
    g.setJaw = (r: number): void => {
      g.jaws.forEach((j) => { const a = j.userData['a'] as number; j.position.set(dir * 11, Math.sin(a) * (r + 13), Math.cos(a) * (r + 13)); j.rotation.x = -a + Math.PI / 2; });
    };
    g.setJaw(jawR); return g;
  }

  // Makine modeli bin kat büyütülür (model metre, plan milimetre); görüşü kapatan kabin parçaları "Makine kabini" ile açılır.
  private makineKur(J: MtIs): void {
    const st = this.S!.st, ntx = st.sub;
    temizle(this.root);
    const m = CNC3D.build({ id: ntx ? 'm_tf' : 'm_lathe', name: '', kind: ntx ? 'm_tf' : 'm_lathe' } as unknown as Parameters<typeof CNC3D.build>[0]);
    const hide = ntx ? [[-1.1, 1.38], [-0.84, 1.38], [1.1, 1.38], [-0.1, 1.95]] : [[-0.84, 1.3], [-0.6, 1.3], [-0.12, 1.55]];
    m.children.forEach((c) => { hide.forEach((q) => { if (Math.abs(c.position.x - q[0]!) < 0.02 && Math.abs(c.position.y - q[1]!) < 0.02) c.visible = false; }); });
    m.scale.setScalar(1000); m.updateMatrixWorld(true);
    const mb = new Box3().setFromObject(m), xw = st.Fm - 350, xe = st.Fm + J.Lp + 900;
    m.children.forEach((c) => {
      if (!c.visible) return; const b = new Box3().setFromObject(c); if (b.isEmpty()) return;
      const sz = b.getSize(new Vector3()), cen = b.getCenter(new Vector3());
      const front = b.max.z > st.Az + 90 && b.max.x > xw && b.min.x < xe && b.min.y < st.Ay + 900, side = (sz.z > 1200 && sz.x < 300) || cen.x < mb.min.x + 250 || cen.x > mb.max.x - 250;
      const roof = b.min.y > st.Ay + 500 && sz.x > 1500;
      if (front || side || roof) { c.userData['shell'] = true; c.visible = this.show.shell; }
    });
    this.mach = m; this.root.add(m);
    const ax = new Group(); ax.position.set(0, st.Ay, st.Az); this.root.add(ax);
    this.chMain = this.ayna(Math.max(90, J.D0 * 1.6), J.D0 / 2, 110, 1); this.chMain.position.x = st.Fm; ax.add(this.chMain);
    this.chSub = null;
    if (ntx) { this.chSub = this.ayna(Math.max(70, J.D0 * 1.3), st.gripR, 110, -1); this.chSub.position.x = st.subHome; ax.add(this.chSub); }
    this.spin = new Group(); ax.add(this.spin); this.partIn = new Group(); this.partIn.matrixAutoUpdate = false; this.spin.add(this.partIn);
    this.stub = new Mesh(new CylinderGeometry(J.D0 / 2, J.D0 / 2, 1, 40), new MeshStandardMaterial({ color: sahneRengi3('cam-ms-kutuk'), metalness: 0.55, roughness: 0.32, envMap: envTex }));
    this.stub.rotation.z = Math.PI / 2; this.stub.visible = false; ax.add(this.stub);
    this.toolG = new Group(); this.root.add(this.toolG); this.tool = null; this.toolId = '';
    this.pathG = new Group(); this.root.add(this.pathG);
    this.coll = new Group(); this.root.add(this.coll);
    this.chunks = {};
  }

  /* blok → eksen yerel matris, faz: op10 · op20 (karşı iş mili) · flip (ters bağlama) */
  private yerel(stage: string, off: number): Matrix4 {
    const st = this.S!.st, R = this.J!.R, Mx = new Matrix4();
    if (stage === 'flip') Mx.set(1, 0, 0, st.Bf, 0, 0, 1, R, 0, -1, 0, R, 0, 0, 0, 1);
    else Mx.set(-1, 0, 0, st.A + (off || 0), 0, 0, 1, R, 0, 1, 0, -R, 0, 0, 0, 1);
    return Mx;
  }
  private dunya(Mx: Matrix4, phi: number, p: number[]): Vector3 {
    const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(Mx), c = Math.cos(phi), s = Math.sin(phi), st = this.S!.st;
    return new Vector3(v.x, st.Ay + v.y * c - v.z * s, st.Az + v.y * s + v.z * c);
  }
  private dunyaYonu(Mx: Matrix4, phi: number, d: number[]): Vector3 {
    const v = new Vector3(d[0], d[1], d[2]).transformDirection(Mx), c = Math.cos(phi), s = Math.sin(phi);
    return new Vector3(v.x, v.y * c - v.z * s, v.y * s + v.z * c).normalize();
  }
  private aci(s: SimParcasi, stage: string): number { return s.proc === 'mill' ? (s.axial ? 0 : (stage === 'flip' ? 1 : -1) * (s.C || 0) * Math.PI / 180) : 0; }
  private takim(t: CamTakim, proc: string): Group {
    if (this.toolId === t.id + proc && this.tool) return this.tool;
    if (this.tool) { this.toolG.remove(this.tool); modelBirak(this.tool); disposeObj(this.tool.children[1]!); }
    const J = this.J!, asm = CNC3D.assembly(t, proc === 'turn' ? J.cfg.lathM : J.c.millM), g = new Group(); asm.scale.setScalar(10); asm.updateMatrixWorld(true);
    const bb = new Box3().setFromObject(asm);
    let tip: Vector3, dir: Vector3;
    if (proc === 'turn' && CNC3D.isLatheTool(t)) { tip = new Vector3(bb.max.x, 0, 0); dir = new Vector3(1, 0, 0); } else { tip = new Vector3(0, bb.min.y, 0); dir = new Vector3(0, -1, 0); }
    asm.position.sub(tip); g.add(asm);
    const head = new Mesh(new BoxGeometry(120, 150, 120), new MeshStandardMaterial({ color: sahneRengi3('cam-ms-kafa'), metalness: 0.4, roughness: 0.5 }));
    if (dir.y < 0) head.position.y = bb.max.y - tip.y + 75; else head.position.x = bb.min.x - tip.x - 60;
    g.add(head);
    g.userData['dir'] = dir; this.tool = g; this.toolId = t.id + proc; this.toolG.add(g); return g;
  }

  /* ---------- talaş yüzeyi ---------- */
  private yuzey(budget?: number): boolean {
    const S = this.S; if (!S) return false; const F = S.F, t0 = performance.now(), Dm = F.dirty, PS = this.PS, n = this.cmpN;
    const col = this.show.cmp && PS ? (x: number, y: number, z: number): number[] => msCmpColor(F, PS, n, x, y, z) : null;
    let any = false;
    for (let q = 0; q < Dm.length; q++) {
      if (!Dm[q]) continue; Dm[q] = 0; any = true;
      const a = q % F.CX, b = Math.floor(q / F.CX) % F.CY, c = Math.floor(q / (F.CX * F.CY)), old = this.chunks[q], A = msMeshChunk(F, a, b, c, col);
      let g: BufferGeometry | null = null;
      if (A) {
        g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(A.P, 3)); g.setAttribute('normal', new BufferAttribute(A.N, 3));
        g.setAttribute('color', new BufferAttribute(A.C, 3)); g.setIndex(new BufferAttribute(A.I, 1));
      }
      if (old) { if (g) { old.geometry.dispose(); old.geometry = g; } else { this.partIn.remove(old); old.geometry.dispose(); delete this.chunks[q]; } }
      else if (g) { const mm = new Mesh(g, this.mat); this.chunks[q] = mm; this.partIn.add(mm); }
      if (budget && performance.now() - t0 > budget) break;
    }
    return any;
  }

  /* ---------- konumlar: parça yerleşimi, iş mili açısı, aynalar, takım ---------- */
  private poz(dt: number): void {
    const S = this.S; if (!S || !S.segs.length) return;
    const J = S.J, st = S.st, t = Math.min(S.t, S.total - 1e-9), si = msSegAt(S, t), s = S.segs[si]!, d = S.cum[si + 1]! - S.cum[si]!, u = d > 0 ? (t - S.cum[si]!) / d : 1;
    const pl = msSegPlace(st, s, u), Mx = this.yerel(pl.stage, pl.off);
    this.partIn.matrix.copy(Mx); this.partIn.matrixWorldNeedsUpdate = true;
    const nx = S.segs[si + 1], sp = s.ev ? (nx && nx.mv && nx.stage === s.stage ? nx : null) : s, phi = sp && sp.proc === 'mill' ? this.aci(sp, pl.stage) : 0;
    const turning = !s.ev && s.proc === 'turn';
    if (turning && this.play) this.spinA += dt * 14; else if (!turning) this.spinA = phi;
    this.spin.rotation.x = turning ? this.spinA : phi;
    if (st.sub && this.chSub) {
      let sx = st.subHome; const row = s.row >= 0 ? J.rows[s.row] : undefined;
      if (s.ev === 'approach') sx = st.subHome + (st.A - st.grip - st.subHome) * u;
      else if (s.ev === 'transfer') sx = st.A - st.grip + st.dSub * u;
      else if (s.stage === 'op20') sx = st.A - st.grip + st.dSub;
      else if (row && row.sub === 'part') sx = st.A - st.grip;
      this.chSub.position.x = sx;
    }
    if (!st.sub && this.chMain) {
      const flipped = (s.stage === 'op20' && s.ev !== 'flip') || (s.ev === 'flip' && u > 0.6);
      this.chMain.setJaw(flipped ? st.gripR : J.D0 / 2);
      this.partIn.visible = s.ev === 'flip' ? u < 0.25 || u > 0.55 : true;
    }
    if (this.stub) {
      this.stub.visible = S.stubOn && st.sub;
      if (this.stub.visible) { const x0 = st.Fm, x1 = st.A - (J.Lp + 3.6); this.stub.scale.y = Math.max(1, x1 - x0); this.stub.position.x = (x0 + x1) / 2; }
    }
    if (s.ev && s.ev !== 'tc') { if (this.tool) this.tool.visible = false; return; }
    const seg = s.ev === 'tc' ? S.segs[si + 1] : s;
    if (!seg || !seg.mv || !seg.tool || !seg.ti) { if (this.tool) this.tool.visible = false; return; }
    const tool = this.takim(seg.tool, seg.proc!); tool.visible = true;
    const p0 = msSegPlace(st, seg, 0), M2 = this.yerel(p0.stage, p0.off), ph = this.aci(seg, p0.stage), R = J.R;
    let p: number[];
    if (s.ev === 'tc') { const m0 = seg.mv[0]!; p = seg.proc === 'turn' ? (seg.ti.lmode === 'drill' ? [m0.a[0]!, R, -R] : [m0.a[0]!, R, m0.a[1]! - R]) : m0.a; }
    else {
      let acc = 0, m = seg.mv[seg.mv.length - 1]!, w = 1; const tot = seg.dur || 1e-9;
      for (let k = 0; k < seg.mv.length; k++) { const mm = seg.mv[k]!; if ((acc + mm.dur) / tot >= u) { m = mm; w = mm.dur > 0 ? clamp((u * tot - acc) / mm.dur, 0, 1) : 1; break; } acc += mm.dur; }
      if (seg.proc === 'turn') { const X = m.a[0]! + (m.b[0]! - m.a[0]!) * w, r = m.a[1]! + (m.b[1]! - m.a[1]!) * w; p = seg.ti.lmode === 'drill' ? [X, R, -R] : [X, R, r - R]; }
      else p = [m.a[0]! + (m.b[0]! - m.a[0]!) * w, m.a[1]! + (m.b[1]! - m.a[1]!) * w, m.a[2]! + (m.b[2]! - m.a[2]!) * w];
    }
    const tipW = this.dunya(M2, ph, p);
    let dirW: Vector3;
    if (seg.proc === 'mill') dirW = this.dunyaYonu(M2, ph, [-seg.axis![0]!, -seg.axis![1]!, -seg.axis![2]!]);
    else if (seg.ti.lmode === 'drill' || seg.ti.lmode === 'id') dirW = this.dunyaYonu(M2, 0, seg.back ? [-1, 0, 0] : [1, 0, 0]);
    else dirW = new Vector3(0, -1, 0);
    tool.quaternion.setFromUnitVectors(tool.userData['dir'] as Vector3, dirW); tool.position.copy(tipW);
  }

  private cizgi(pts: number[], renk: ReturnType<typeof sahneRengi3> | null): void { if (pts.length) this.pathG.add(cizgiler(pts, renk)); }
  private yolCiz(): void {
    temizle(this.pathG); const S = this.S; if (!this.show.path || !S) return;
    const si = msSegAt(S, Math.min(S.t, S.total - 1e-9)); let s = S.segs[si]; if (s && s.ev === 'tc') s = S.segs[si + 1];
    this.pathSi = si;
    if (!s || !s.mv || !s.ti) return;
    const pl = msSegPlace(S.st, s, 0), M2 = this.yerel(pl.stage, pl.off), ph = this.aci(s, pl.stage), R = S.J.R, cut: number[] = [], rap: number[] = [], ti = s.ti;
    const P = (q: number[]): number[] => (s.proc === 'turn' ? (ti.lmode === 'drill' ? [q[0]!, R, -R] : [q[0]!, R, q[1]! - R]) : q);
    s.mv.forEach((m) => { const a = this.dunya(M2, ph, P(m.a)), b = this.dunya(M2, ph, P(m.b)); (m.t ? cut : rap).push(a.x, a.y, a.z, b.x, b.y, b.z); });
    this.cizgi(cut, s.proc === 'turn' ? sahneRengi3('vurgu') : (S.J.rows[s.row] ? islemRengi3(S.J.rows[s.row]!.kind) : sahneRengi3('acik-mavi')));
    this.cizgi(rap, null);
  }
  private carpismaCiz(): void {
    temizle(this.coll); const S = this.S; if (!S) return; const R = S.J.R;
    S.colls.forEach((c) => {
      const s = S.segs[c.si]!, pl = msSegPlace(S.st, s, 0), M2 = this.yerel(pl.stage, pl.off), ph = this.aci(s, pl.stage);
      const p = s.proc === 'turn' ? [c.p[0]!, R, c.p[1]! - R] : c.p, m = new Mesh(new SphereGeometry(4, 16, 12), new MeshBasicMaterial({ color: sahneRengi3('cam-ulasilamaz') }));
      m.position.copy(this.dunya(M2, ph, p)); this.coll.add(m);
    });
  }

  /* ---------- giriş / çıkış ---------- */
  async baslat(J: MtIs): Promise<void> {
    CS.busy = 'Makine sahnesi ve ham çubuk hazırlanıyor…'; camDegisti();
    await new Promise((r) => { setTimeout(r, 30); });
    try {
      this.S = msBaslat(J); this.PS = null; this.cmpN = { g: 0, l: 0, ok: 0 }; this.show.cmp = false;
      this.makineKur(J); this.yuzey(); this.play = false; this.on = true; this.collN = -1;
      this.sahne.root.visible = false; this.root.visible = true;
      this.poz(0); this.yolCiz(); this.sigdir();
    } catch (e) { console.error(e); this.on = false; CS.msg = '⚠ Simülasyon kurulamadı: ' + (e instanceof Error ? e.message : String(e)); }
    CS.busy = null; camDegisti();
  }
  durdur(): void {
    this.on = false; this.play = false; this.root.visible = false; this.sahne.root.visible = true;
    Object.keys(this.chunks).forEach((k) => { this.chunks[Number(k)]!.geometry.dispose(); }); this.chunks = {};
    temizle(this.root); this.mach = null; this.S = null; this.PS = null; this.tool = null; this.toolId = '';
    this.sahne.sigdir(); camDegisti();
  }
  sigdir(v?: string): void {
    const S = this.S; if (!S) return; const st = S.st, J = S.J, x0 = st.Fm - 40, x1 = st.A + 60 + (st.sub ? st.dSub : 0);
    this.sahne.orbit.fit(new Box3(new Vector3(x0, st.Ay - J.D0 * 1.6, st.Az - J.D0 * 1.6), new Vector3(x1, st.Ay + J.D0 * 2.2, st.Az + J.D0 * 1.6)), v || 'front');
  }

  // Uzun ileri sarışta hesap ekranı dondurmasın diye önce mesaj gösterilir (prototipte %8'den uzun atlama).
  async git(t: number): Promise<void> {
    const S = this.S; if (!S) return; t = clamp(t, 0, S.total);
    if (t < S.pos - 1e-9) msReset(S);
    S.t = t;
    if (t - S.pos > S.total * 0.08) {
      CS.busy = 'Simülasyon ' + sureYazi(t) + ' noktasına hesaplanıyor…'; camDegisti();
      await new Promise((r) => { setTimeout(r, 20); });
      msAdvance(S, t); this.yuzey(); CS.busy = null;
    } else msAdvance(S, t);
    this.poz(0); this.yolCiz(); this.carpismaDegisti(); camDegisti();
  }
  oynat(): void { const S = this.S; if (!S) return; if (S.t >= S.total - 1e-9) void this.git(0); this.play = !this.play; camDegisti(); }
  basa(): void { this.play = false; void this.git(0); }
  sona(): void { const S = this.S; if (!S) return; this.play = false; void this.git(S.total).then(() => { this.bitti(); }); }
  satir(row: number): void { const S = this.S; if (!S) return; this.play = false; void this.git(S.rowStart[row]! + 1e-6); }
  komsu(yon: 1 | -1): void {
    const S = this.S; if (!S) return; this.play = false;
    const cur = msSegAt(S, Math.min(S.t, S.total - 1e-9)), row = S.segs[cur]!.row;
    let k = yon > 0 ? row + 1 : (S.t - S.rowStart[row]! > 0.02 ? row : row - 1); k = clamp(k, 0, S.J.rows.length - 1);
    void this.git(S.rowStart[k]! + 1e-6);
  }
  private bitti(): void { if (!this.PS) { this.show.cmp = true; void this.karsilastir(); } camDegisti(); }
  async karsilastir(): Promise<void> {
    const S = this.S; if (!S) return;
    if (!this.PS) {
      CS.busy = 'Bitmiş parça ile karşılaştırma alanı hesaplanıyor…'; camDegisti();
      await new Promise((r) => { setTimeout(r, 20); });
      try { this.PS = msPartSDF(S.F, S.J.G); } catch (e) { console.error(e); }
      CS.busy = null;
    }
    this.cmpN = { g: 0, l: 0, ok: 0 }; S.F.dirty.fill(1); this.yuzey(); camDegisti();
  }
  karsilastirmaAc(): void {
    this.show.cmp = !this.show.cmp;
    if (this.show.cmp) void this.karsilastir(); else if (this.S) { this.S.F.dirty.fill(1); this.yuzey(); camDegisti(); }
  }
  yolAc(): void { this.show.path = !this.show.path; this.yolCiz(); camDegisti(); }
  kabinAc(): void {
    this.show.shell = !this.show.shell;
    this.mach?.children.forEach((c) => { if (c.userData['shell']) c.visible = this.show.shell; }); camDegisti();
  }
  private carpismaDegisti(): void { const S = this.S; if (S && this.collN !== S.colls.length) { this.collN = S.colls.length; this.carpismaCiz(); } }

  // Her kare (prototipin msFrame'i): oynatırken zaman ilerler, talaş bütçeli kaldırılır, yüzey bütçeli yenilenir.
  frame(dt: number): void {
    const S = this.S; if (!this.on || !S) return;
    let degisti = false;
    if (this.play) {
      const nt = Math.min(S.total, S.t + dt / 60 * this.speed), ok = msAdvance(S, nt, 14);
      S.t = ok ? nt : S.pos;
      if (S.t >= S.total - 1e-9) { this.play = false; S.t = S.total; msAdvance(S, S.total); this.bitti(); }
      degisti = true;
    }
    this.yuzey(10); this.poz(dt);
    const si = msSegAt(S, Math.min(S.t, S.total - 1e-9)); if (si !== this.pathSi) this.yolCiz();
    this.carpismaDegisti();
    if (degisti) camDegisti();
  }
}
