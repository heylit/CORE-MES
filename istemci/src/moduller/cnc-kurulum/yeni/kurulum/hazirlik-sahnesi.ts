import * as THREE from 'three';
import { state } from '../depo.ts';
import { D } from '../durum.ts';
import { FONT as YAZI, MONO, clamp } from '../bicim.ts';
import { allCons, allGauges, bt, byId, material, toolById, tools } from '../secici.ts';
import { fmtT } from '../hesap/gkod.ts';
import { PR, PS, prIsDone, prJawList, prPk, prProg, prSeq, prSrcText, prStk, prStkLabel, prToolEval, prTs, prZeroList, type HazirlikAdimi } from '../hesap/hazirlik.ts';
import { CNC3D } from '../sahne/cnc3d.ts';
import { envTex, lights, maxAniso, numTex } from '../sahne/gl.ts';
import type { Cizim } from '../sahne/Sahne.tsx';
import { textSprite } from '../sahne/yardimci.ts';
import type { Kalem } from '../veri/tipler.ts';
import { PRT, prtFrame, prtTool, talasBulutu } from './deneme.ts';
import { renk, renkKaynagi, temizle, type RenkAdi } from './renk.ts';
import { prLayout, type Yerlesim } from './yerlesim.ts';

// Hazırlığın 3B yükleme sahnesi: tezgâh adım adım yüklenir (prototip 20916-21206, kare 21579-21586).

const PI = Math.PI, TAU = PI * 2;

interface Yuva { sig: string; g: THREE.Group; lift: number; mode: string; base: number }
interface MagBilgisi { lathe: boolean; N: number; R: number; ring: THREE.Group }
interface Sahne3 {
  scene: THREE.Scene; cam: THREE.PerspectiveCamera; work: THREE.Group; mach: THREE.Group; slots: Record<string, Yuva>;
  tgt: THREE.Vector3; pos: THREE.Vector3; yaw: number; pitch: number; drag: { x: number; y: number; yaw: number; pitch: number } | null;
  idle: number; lay: Yerlesim | null; t: number; magInfo: MagBilgisi | null; magCur: number | null; vw: number; vh: number; dock: number;
  PRM: Record<'body' | 'body2' | 'table' | 'slot' | 'acc' | 'scr', THREE.MeshStandardMaterial>;
}

let P3: Sahne3 | null = null;
// Sahnenin yeniden kurulması gerektiğini söyler (prototipin PR.dirty'si).
let kirli = true;
export function sahneKirli(): void { kirli = true; }

const renk3 = (ad: RenkAdi): THREE.Color => new THREE.Color(renk(ad));

function kur(): Sahne3 {
  const scene = new THREE.Scene(), work = new THREE.Group(), mach = new THREE.Group();
  scene.environment = envTex; lights(scene, 1.1); scene.add(work, mach);
  scene.fog = new THREE.Fog(renk3('arka'), 70, 160);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: renk3('zemin'), metalness: 0.2, roughness: 0.9 })); fl.rotation.x = -PI / 2; fl.position.y = -0.01; scene.add(fl);
  const gr = new THREE.GridHelper(80, 40, renk3('izgara-1'), renk3('izgara-2')); gr.position.y = 0; scene.add(gr);
  const PRM = {
    body: new THREE.MeshStandardMaterial({ color: renk3('govde'), metalness: 0.45, roughness: 0.55 }),
    body2: new THREE.MeshStandardMaterial({ color: renk3('govde-acik'), metalness: 0.15, roughness: 0.5 }),
    table: new THREE.MeshStandardMaterial({ color: renk3('tabla'), metalness: 0.85, roughness: 0.32 }),
    slot: new THREE.MeshStandardMaterial({ color: renk3('kanal'), metalness: 0.5, roughness: 0.6 }),
    acc: new THREE.MeshStandardMaterial({ color: renk3('vurgu'), metalness: 0.3, roughness: 0.4, emissive: renk3('vurgu').multiplyScalar(0.29) }),
    scr: new THREE.MeshStandardMaterial({ color: renk3('ekran-govde'), metalness: 0.4, roughness: 0.5 }),
  };
  Object.values(PRM).forEach((m) => { m.userData['keep'] = true; });
  work.add(PRT.grp); scene.add(talasBulutu());
  return {
    scene, cam: new THREE.PerspectiveCamera(36, 1, 0.1, 600), work, mach, slots: {}, tgt: new THREE.Vector3(0, 4, 0), pos: new THREE.Vector3(14, 18, 40),
    yaw: 0, pitch: 0, drag: null, idle: 0, lay: null, t: 0, magInfo: null, magCur: null, vw: 1, vh: 1, dock: 0, PRM,
  };
}

function prBox(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function prCyl(r: number, h: number, mat: THREE.Material, seg = 32): THREE.Mesh { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); }
function prClear(g: THREE.Group): void { while (g.children.length) { const c = g.children[0]; if (!c) break; g.remove(c); CNC3D.dispose(c); } }

function prSlot(s3: Sahne3, key: string, sig: string, build: (g: THREE.Group) => void): Yuva {
  let s = s3.slots[key];
  if (s && s.sig === sig) return s;
  const lift = s ? s.lift : 0, mode = s ? s.mode : 'off';
  if (s) { s3.work.remove(s.g); prClear(s.g); }
  const g = new THREE.Group(); try { build(g); } catch (e) { console.error(e); }
  s = s3.slots[key] = { sig, g, lift, mode, base: g.position.y }; s3.work.add(g); return s;
}

function prBase(s3: Sahne3, g: THREE.Group, L: Yerlesim): void {
  const M = s3.PRM;
  if (!L.lathe) {
    g.add(prBox(L.tw + 3, 1.4, 11, M.body, 0, 0.7, -0.5));
    g.add(prBox(L.tw, 0.5, 9, M.table, 0, L.tableTop - 0.25, 0));
    for (let i = 0; i < 5; i++) g.add(prBox(L.tw + 0.05, 0.16, 0.5, M.slot, 0, L.tableTop - 0.07, -3.6 + i * 1.8));
    const colH = L.nose + 7; g.add(prBox(5.5, colH, 3.2, M.body, 0, colH / 2, -9.5)); g.add(prBox(5.6, 0.35, 0.2, M.acc, 0, colH - 1.2, -7.85));
    g.add(prBox(1, L.magPos.y, 1, M.body, L.magPos.x, L.magPos.y / 2, L.magPos.z));
  } else {
    g.add(prBox(26, 3, 10, M.body, 2, 1.5, -1));
    g.add(prBox(6, L.cy + 4, 8, M.body2, L.headX - 3, (L.cy + 4) / 2, -1));
    const sp = prCyl(L.chuckR * 0.75, 1.2, M.body, 40); sp.rotation.z = PI / 2; sp.position.set(L.headX + 0.3, L.cy, 0); g.add(sp);
    g.add(prBox(24, 0.6, 1.2, M.table, 4, 3.3, -3.8)); g.add(prBox(24, 0.6, 1.2, M.table, 4, 3.3, 1.2));
    const ch = L.cy - 3.6 + 1.2; g.add(prBox(4.2, ch, 3.2, M.body, L.turPos.x, 3.6 + ch / 2, L.turPos.z - 2.4)); g.add(prBox(6.5, 1, 6, M.body, L.turPos.x, 4.1, L.turPos.z - 0.8));
  }
}

const takimAdimi = (T: number): HazirlikAdimi => ({ key: `T${String(T)}`, g: 'tools', T });

function prScreenTex(L: Yerlesim): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 680; const x = cv.getContext('2d');
  const m = L.m, p = prProg(), src = prSrcText(), st = PR.seq.find((s) => s.key === 'prog'), ok = !!st && prIsDone(st);
  if (x) {
    x.fillStyle = renk('ekran-arka'); x.fillRect(0, 0, 1024, 680);
    x.fillStyle = renk(m.ctrl === 'heid' ? 'ekran-heid' : 'ekran-iso'); x.fillRect(0, 0, 1024, 70);
    x.fillStyle = renk('yazi-parlak'); x.font = `700 32px ${YAZI}`; x.fillText(m.ctrl === 'heid' ? 'HEIDENHAIN TNC · Program Run' : 'CNC · MEM / AUTO', 24, 46);
    x.textAlign = 'right'; x.font = `600 26px ${YAZI}`; x.fillStyle = renk('yazi-ikincil'); x.fillText(m.name, 1000, 46); x.textAlign = 'left';
    if (!src) { x.fillStyle = renk('yazi-ikincil'); x.font = `600 38px ${YAZI}`; x.fillText('PROGRAM YOK', 40, 200); x.font = `500 28px ${YAZI}`; x.fillText('Yalnız magazin kontrolü', 40, 250); }
    else {
      x.fillStyle = renk('yazi-parlak'); x.font = `700 34px ${MONO}`; x.fillText(src.name.slice(0, 40), 24, 120);
      x.fillStyle = renk(ok ? 'ok' : 'sari'); x.font = `700 26px ${YAZI}`; x.fillText(ok ? '● YÜKLENDİ' : '○ YÜKLENECEK', 24, 160);
      const lines = (p?.lines ?? src.text.split('\n')).filter((l) => l.trim()).slice(0, 15);
      x.font = `500 22px ${MONO}`;
      lines.forEach((l, i) => { x.fillStyle = renk(/TOOL\s+CALL|\bT\d+\s*M0?6/i.test(l) ? 'vurgu' : /^\s*\d*\s*[;(]/.test(l) ? 'ekran-yorum' : 'yazi'); x.fillText(l.slice(0, 54), 24, 205 + i * 30); });
      x.fillStyle = renk('ekran-kutu'); x.fillRect(700, 90, 300, 560);
      x.fillStyle = renk('yazi-ikincil'); x.font = `600 22px ${YAZI}`; x.fillText('TAKIMLAR', 720, 126);
      prTs().slice(0, 12).forEach((T, i) => {
        const e = prToolEval(T), dn = prIsDone(takimAdimi(T));
        x.fillStyle = renk(e.lvl === 'err' ? 'hata' : dn ? 'ok' : 'yazi'); x.font = `700 24px ${MONO}`; x.fillText(`${dn ? '✓ ' : '· '}T${String(T)}`, 720, 162 + i * 34);
      });
      if (p && !p.err) {
        x.fillStyle = renk('yazi-ikincil'); x.font = `600 22px ${YAZI}`; x.fillText('SÜRE', 860, 126); x.fillStyle = renk('yazi-parlak'); x.font = `700 30px ${MONO}`; x.fillText(fmtT(p.total), 860, 162);
        x.fillStyle = renk('yazi-ikincil'); x.font = `600 22px ${YAZI}`; x.fillText('PARTİ', 860, 214); x.fillStyle = renk('yazi-parlak'); x.font = `700 30px ${MONO}`; x.fillText(String(PS().qty), 860, 250);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
}
function prScreen(s3: Sahne3, g: THREE.Group, L: Yerlesim): void {
  const M = s3.PRM;
  g.add(prBox(1.4, 9, 1.4, M.body, 0, 4.5, 0));
  g.add(prBox(9.4, 6.6, 0.6, M.scr, 0, 11.6, 0.2));
  const mat = new THREE.MeshBasicMaterial({ map: prScreenTex(L), toneMapped: false }); mat.userData['own'] = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 5.9), mat); face.position.set(0, 11.6, 0.52); g.add(face);
  const kb = prBox(9.4, 0.4, 2.6, M.scr, 0, 8.1, 1.3); kb.rotation.x = 0.25; g.add(kb);
  g.rotation.y = 0.45;
}
const prItem = (it: Kalem): THREE.Object3D => CNC3D.build(it);
function prDrop(g: THREE.Group, o: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const b = new THREE.Box3().setFromObject(o); o.position.set(x - (b.min.x + b.max.x) / 2, y - b.min.y, z - (b.min.z + b.max.z) / 2); g.add(o); return o;
}

function prBuildMag(g: THREE.Group, L: Yerlesim, curT: number | null): void {
  const m = L.m, arr = tools(), N = m.pockets, ring = new THREE.Group(), Mt = CNC3D.M, stOf: Record<number, 'cur' | 'err' | 'ok' | 'pend'> = {};
  prTs().forEach((T) => { const e = prToolEval(T), dn = prIsDone(takimAdimi(T)); stOf[T - 1] = T === curT ? 'cur' : e.lvl === 'err' ? 'err' : dn ? 'ok' : 'pend'; });
  const COL: Record<string, RenkAdi> = { cur: 'vurgu', err: 'hata', ok: 'ok', pend: 'yazi-soluk' };
  const halka = (s: string): THREE.MeshBasicMaterial => { const mm = new THREE.MeshBasicMaterial({ color: renk3(COL[s] ?? 'yazi-soluk'), toneMapped: false }); mm.userData['own'] = true; return mm; };
  g.add(ring);
  if (m.type === 'lathe') {
    const Rt = Math.max(2.6, N * 1.25 / TAU);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(Rt, Rt, 1.2, N * 2), Mt.steel); disc.rotation.x = PI / 2; ring.add(disc);
    for (let p = 0; p < N; p++) {
      const a = p / N * TAU, sx = Math.sin(a), sy = Math.cos(a);
      const stn = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.3), Mt.oxide); stn.position.set(sx * Rt, sy * Rt, 0); stn.rotation.z = -a; ring.add(stn);
      const nm = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(p + 1), depthWrite: false })); nm.material.userData['own'] = true; nm.scale.setScalar(0.5); nm.position.set(sx * Rt * 0.72, sy * Rt * 0.72, 0.75); ring.add(nm);
      const so = stOf[p]; if (so) { const rg = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 10, 32), halka(so)); rg.position.set(sx * Rt * 0.72, sy * Rt * 0.72, 0.68); ring.add(rg); }
      const t = toolById(arr[p] ?? 'empty'); if (t.kind === 'empty') continue;
      const obj = CNC3D.build(t), lt = CNC3D.isLatheTool(t), o = CNC3D.fit(obj, 2.5), bb = new THREE.Box3().setFromObject(o);
      if (lt) o.position.x -= bb.min.x; else o.position.y -= bb.max.y;
      const hd = new THREE.Group(); hd.add(o); hd.position.set(sx * (Rt + 0.15), sy * (Rt + 0.15), 0); hd.rotation.z = lt ? (PI / 2 - a) : (PI - a); ring.add(hd);
    }
    g.userData['info'] = { lathe: true, N, R: Rt, ring } satisfies MagBilgisi;
  } else {
    const Rm = Math.max(4.2, N * 1.3 / TAU), top = 0;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(Rm + 0.9, Rm + 0.9, 0.3, 64), Mt.dark); plate.position.y = top + 0.2; ring.add(plate);
    for (let q = 0; q < N; q++) {
      const b2 = q / N * TAU, cx = Math.sin(b2) * Rm, cz = Math.cos(b2) * Rm;
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 20), Mt.steel); sl.position.set(cx, top, cz); ring.add(sl);
      const so = stOf[q]; if (so) { const rg2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.11, 10, 36), halka(so)); rg2.rotation.x = PI / 2; rg2.position.set(cx, top + 0.4, cz); ring.add(rg2); }
      const nm2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(q + 1), depthWrite: false })); nm2.material.userData['own'] = true; nm2.scale.setScalar(0.6); nm2.position.set(Math.sin(b2) * (Rm + 1.4), top + 0.5, Math.cos(b2) * (Rm + 1.4)); ring.add(nm2);
      const tq = toolById(arr[q] ?? 'empty'); if (tq.kind === 'empty') continue;
      const asm = CNC3D.assembly(tq, m); if (CNC3D.isLatheTool(tq)) asm.rotation.z = -PI / 2;
      const o2 = CNC3D.fit(asm, 2.7), bb2 = new THREE.Box3().setFromObject(o2); o2.position.y -= bb2.max.y; o2.position.y += top; o2.position.x += cx; o2.position.z += cz; ring.add(o2);
    }
    g.userData['info'] = { lathe: false, N, R: Rm, ring } satisfies MagBilgisi;
  }
  if (L.lathe) { g.position.copy(L.turPos); g.scale.setScalar(L.turScale); } else { g.position.copy(L.magPos); g.scale.setScalar(L.magScale); }
}
function prTriad(g: THREE.Group, L: Yerlesim, w: Kalem | null): void {
  const len = L.lathe ? 2.2 : 2.6, o = new THREE.Vector3(0, 0, 0);
  const ax: [THREE.Vector3, RenkAdi, string][] = L.lathe
    ? [[new THREE.Vector3(1, 0, 0), 'acik-mavi', 'Z'], [new THREE.Vector3(0, 1, 0), 'hata', 'X']]
    : [[new THREE.Vector3(1, 0, 0), 'hata', 'X'], [new THREE.Vector3(0, 0, -1), 'ok', 'Y'], [new THREE.Vector3(0, 1, 0), 'acik-mavi', 'Z']];
  ax.forEach(([v, r, ad]) => {
    const h = new THREE.ArrowHelper(v, o, len, renk3(r), 0.55, 0.32); const lm = h.line.material as THREE.LineBasicMaterial, cm = h.cone.material as THREE.MeshBasicMaterial; lm.userData['own'] = true; cm.userData['own'] = true; lm.toneMapped = false; g.add(h);
    const sp = textSprite(ad, renk(r)); sp.position.copy(v.clone().multiplyScalar(len + 0.6)); sp.scale.multiplyScalar(0.9); g.add(sp);
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), new THREE.MeshBasicMaterial({ color: renk3('vurgu'), toneMapped: false })); ball.material.userData['own'] = true; g.add(ball);
  const ww = w ?? byId(D.WCS[L.m.ctrl], state.wcs[L.m.ctrl]); const lb = textSprite(ww ? ww.name : 'P', renk('vurgu')); lb.position.set(-1.1, 0.9, 0.6); g.add(lb);
  g.position.copy(L.zero);
}
const PR_SPINDLE_ZERO: Record<string, 1> = { z_probe: 1, z_edge: 1, z_dial: 1, z_touch: 1 };

function prProgSig(): string {
  const s = prSrcText(), st = PR.seq.find((x) => x.key === 'prog');
  return `${s ? s.name : '-'}|${st && prIsDone(st) ? 1 : 0}|${String(PS().qty)}|${PR.seq.filter((x) => x.T).map((x) => `${String(x.T)}${prIsDone(x) ? '+' : '-'}${prToolEval(x.T ?? 0).lvl}`).join('')}`;
}

function prBuild(s3: Sahne3): void {
  kirli = false; PR.seq = prSeq(); PR.at = clamp(PR.at, 0, PR.seq.length - 1);
  const L = s3.lay = prLayout(), m = L.m, cur = PR.seq[PR.at], mat = material(), s = prStk(), M = s3.PRM;
  const lk = `${L.lathe ? 'L' : 'M'}|${m.id}|${L.lathe ? L.chuckR.toFixed(2) + L.face.toFixed(2) : `${L.nose.toFixed(2)}${String(L.tableTop)}|${String(L.n)}`}`;
  if (s3.mach.userData['sig'] !== m.id) { prClear(s3.mach); const mo = CNC3D.fit(CNC3D.build(m), 14), mb = new THREE.Box3().setFromObject(mo); mo.position.y -= mb.min.y; s3.mach.add(mo); s3.mach.userData['sig'] = m.id; }
  prSlot(s3, 'base', lk, (g) => { prBase(s3, g, L); });
  prSlot(s3, 'screen', `scr|${m.id}|${prProgSig()}|${String(renkIzi())}`, (g) => { prScreen(s3, g, L); g.position.set(L.lathe ? -15 : -17, 0, L.lathe ? 4 : 3); });
  prSlot(s3, 'fix', `fix|${lk}|${L.fix.id}`, (g) => {
    const o = prItem(L.fix);
    if (!L.lathe) L.offs.forEach((dx, i) => { prDrop(g, i ? prItem(L.fix) : o, dx, L.tableTop, 0); });
    else { o.rotation.y = PI / 2; const w = new THREE.Group(); w.add(o); w.position.set(L.fixShift, L.cy, 0); g.add(w); }
  });
  const jaw = byId(prJawList(), bt().jaw) ?? prJawList()[0];
  if (jaw) prSlot(s3, 'jaw', `jaw|${lk}|${jaw.id}|${L.fix.id}|${prStkLabel(s)}`, (g) => {
    if (!L.lathe) {
      if (/^j_(hard|soft|step|grip)$/.test(jaw.kind)) {
        L.offs.forEach((dx) => { [-1, 1].forEach((sgn) => {
          const o = prItem(jaw), b = new THREE.Box3().setFromObject(o), w0 = b.max.x - b.min.x, sc = Math.min(1, (L.vise ? Math.min(L.fixD, 4.2) : 4) / w0);
          o.scale.setScalar(sc); o.rotation.y = PI / 2; const wr = new THREE.Group(); wr.add(o); wr.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(wr), th = bb.max.x - bb.min.x; prDrop(g, wr, dx + sgn * (L.sx / 2 + th / 2 + 0.02), L.stockBot - 0.25, 0);
        }); });
      } else if (jaw.kind === 'j_par') {
        L.offs.forEach((dx) => { const op = prItem(jaw), bp = new THREE.Box3().setFromObject(op); op.scale.set(Math.max(0.3, L.sx * 0.9) / (bp.max.x - bp.min.x), 0.35, Math.max(0.3, L.sz * 0.8) / (bp.max.z - bp.min.z)); prDrop(g, op, dx, L.stockBot - 0.62, 0); });
      } else if (jaw.kind !== 'j_none') {
        L.offs.forEach((dx) => { const o3 = prItem(jaw); o3.scale.setScalar(0.7); prDrop(g, o3, dx - (L.sx / 2 + 2.2), L.fixTop, L.sz / 2 + 1.5); });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const j = prItem(jaw), jb = new THREE.Box3().setFromObject(j), sc2 = (L.chuckR * 0.42) / Math.max(jb.max.z - jb.min.z, 0.01);
        j.scale.setScalar(Math.min(0.6, sc2)); j.rotation.z = -PI / 2;
        const arm = new THREE.Group(); arm.add(j); j.position.set(0, 0, L.d / 2 + (jb.max.z - jb.min.z) * Math.min(0.6, sc2) / 2 + 0.05);
        const piv = new THREE.Group(); piv.add(arm); piv.rotation.x = i * TAU / 3; piv.position.set(L.face - 0.05, L.cy, 0); g.add(piv);
      }
    }
  });
  prSlot(s3, 'stock', `stk|${lk}|${String(L.n)}|${PRT.on && PRT.hm ? 'T' : ''}|${prStkLabel(s)}|${mat.iso}|${L.fix.id}`, (g) => {
    const sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk(`ham-${mat.iso}` as RenkAdi) || renk('ham')), metalness: 0.75, roughness: 0.33 }); sm.userData['own'] = true;
    const lm = new THREE.LineBasicMaterial({ color: renk3('vurgu'), transparent: true, opacity: 0.85 }); lm.userData['own'] = true;
    if (!L.lathe) L.offs.forEach((dx, ix) => {
      if (ix === 0 && PRT.on && PRT.hm) return;
      const bxm = new THREE.Mesh(new THREE.BoxGeometry(L.sx, L.sy, L.sz), sm); bxm.position.set(dx, L.stockBot + L.sy / 2, 0); g.add(bxm);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(bxm.geometry), lm); e.position.copy(bxm.position); g.add(e);
    });
    else {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(L.d / 2, L.d / 2, L.len, 48), sm); cyl.rotation.z = PI / 2; cyl.position.set((L.stockX0 + L.stockX1) / 2, L.cy, 0); g.add(cyl);
      const e2 = new THREE.LineSegments(new THREE.EdgesGeometry(cyl.geometry, 30), lm); e2.rotation.z = PI / 2; e2.position.copy(cyl.position); g.add(e2);
    }
  });
  const zi = byId(prZeroList(), bt().zero) ?? prZeroList()[0], zSp = !!zi && !L.lathe && PR_SPINDLE_ZERO[zi.kind] === 1;
  if (zi) prSlot(s3, 'zero', `zero|${lk}|${String(L.n)}|${zi.id}|${prStkLabel(s)}|${state.wcs[m.ctrl] ?? ''}`, (g) => {
    const WL = D.WCS[m.ctrl], wcur = byId(WL, state.wcs[m.ctrl]), wi = Math.max(0, wcur ? WL.indexOf(wcur) : 0);
    L.offs.forEach((dx, i) => { const tr = new THREE.Group(); prTriad(tr, L, WL[Math.min(WL.length - 1, wi + i)] ?? null); tr.position.x += dx - (L.offs[0] ?? 0); g.add(tr); });
    if (!zSp) { const o = prItem(zi), b = new THREE.Box3().setFromObject(o), sc = Math.min(1, 3 / Math.max(0.1, b.max.y - b.min.y)); o.scale.setScalar(sc); if (!L.lathe) prDrop(g, o, L.sx / 2 + 3, L.tableTop, L.sz / 2 + 2); else prDrop(g, o, L.face + 1.5, 3, 3.2); }
  });
  let spItem: Kalem | null = null, spTool: Kalem | null = null;
  if (!L.lathe) {
    if (cur && cur.g === 'tools' && (cur.T ? cur.T <= m.pockets : true)) { const tid = tools()[prPk(cur)]; if (tid && tid !== 'empty') spTool = toolById(tid); }
    else if (cur && cur.g === 'zero' && zSp) spItem = zi ?? null;
    else if (cur && cur.g === 'final') { const T0 = prTs()[0]; if (T0 && T0 <= m.pockets && tools()[T0 - 1] !== 'empty') spTool = toolById(tools()[T0 - 1] ?? 'empty'); }
  }
  if (PRT.on && PRT.curT) { spTool = prtTool(PRT.curT); spItem = null; }
  prSlot(s3, 'spindle', `sp|${lk}|${spTool ? `t${spTool.id}` : spItem ? `z${spItem.id}` : '-'}`, (g) => {
    if (L.lathe) return;
    const o = spTool ? (CNC3D.isLatheTool(spTool) ? CNC3D.build(spTool) : CNC3D.assembly(spTool, m)) : spItem ? prItem(spItem) : null;
    let top = 1.2;
    if (o) { o.scale.multiplyScalar(10 * L.k); const bb = new THREE.Box3().setFromObject(o); o.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); const spin = new THREE.Group(); spin.add(o); g.add(spin); g.userData['spin'] = spin; top = bb.max.y - bb.min.y; }
    const hd = new THREE.Group(); hd.position.y = top; g.add(hd);
    const nose = prCyl(1.05, 0.7, M.body, 32); nose.position.y = 0.35; hd.add(nose);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 8, 40), M.acc); ring.rotation.x = PI / 2; ring.position.y = 0.05; hd.add(ring);
    hd.add(prBox(3.4, 4.2, 3.4, M.body2, 0, 2.8, 0)); hd.add(prBox(3.45, 0.3, 3.45, M.body, 0, 4.6, 0)); hd.add(prBox(2, 1.6, 8.5, M.body, 0, 3.4, -4.6));
  });
  const curT = cur?.T ? cur.T : cur && cur.key === 'mag' ? prPk(cur) + 1 : null;
  const mgSig = `mag|${lk}|${tools().join(',')}|${String(curT)}|${PR.seq.filter((x) => x.T).map((x) => `${String(x.T)}${prIsDone(x) ? '+' : '-'}`).join('')}|${String(PS().qty)}|${state.material}|${String(renkIzi())}`;
  const mgs = prSlot(s3, 'mag', mgSig, (g) => { prBuildMag(g, L, curT); });
  s3.magInfo = (mgs.g.userData['info'] as MagBilgisi | undefined) ?? null;
  s3.magCur = PRT.on && PRT.curT ? Number(PRT.curT) - 1 : curT ? curT - 1 : (cur && cur.key === 'mag' ? prPk(cur) : null);
  const cl = byId(D.COOL, state.coolant) ?? D.COOL[0];
  if (cl) prSlot(s3, 'cool', `cool|${lk}|${cl.id}`, (g) => {
    const o = prItem(cl), b = new THREE.Box3().setFromObject(o), hang = b.max.y <= 0.05;
    if (hang) { const sc = Math.min(1, 6 / Math.max(0.1, b.max.y - b.min.y)); o.scale.setScalar(sc); b.setFromObject(o); o.position.set(-3 - (b.min.x + b.max.x) / 2, L.nose - b.max.y, -(b.min.z + b.max.z) / 2); g.add(o); }
    else { o.scale.setScalar(Math.min(1, 3.2 / Math.max(0.1, b.max.y - b.min.y))); if (!L.lathe) prDrop(g, o, -8.2, L.tableTop, 2.6); else prDrop(g, o, L.face - 1, 3, -4); }
  });
  const cart = state.gauges.slice(0, 8).map((id) => byId(allGauges(), id)).concat(state.cons.slice(0, 8).map((id) => byId(allCons(), id))).filter((c): c is Kalem => c !== null);
  prSlot(s3, 'cart', `cart|${cart.map((c) => c.id).join(',')}`, (g) => {
    g.add(prBox(9, 0.35, 5.4, M.body, 0, 4.6, 0)); g.add(prBox(9, 0.3, 5.4, M.body, 0, 1.2, 0));
    [[-4.2, -2.4], [4.2, -2.4], [-4.2, 2.4], [4.2, 2.4]].forEach(([a, b]) => { const l = prCyl(0.15, 4.6, M.table, 10); l.position.set(a ?? 0, 2.3, b ?? 0); g.add(l); });
    const lb = textSprite('ÖLÇÜM · SARF', renk('sari')); lb.position.set(0, 7.7, 0); g.add(lb);
    cart.forEach((it, i) => {
      const o = prItem(it), b = new THREE.Box3().setFromObject(o), sz = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 0.1); o.scale.setScalar(1.9 / sz);
      const col = i % 4, row = Math.floor(i / 4), top = row < 2;
      prDrop(g, o, -3.3 + col * 2.2, top ? 4.78 : 1.36, row % 2 ? 1.2 : -1.2);
    });
    g.position.set(L.lathe ? -15 : -17, 0, L.lathe ? 14 : 13); g.rotation.y = 0.5;
  });
}
let renkSayaci = 0;
const renkIzi = (): number => renkSayaci;

const PR_SLOT_STEP: Record<string, string> = { screen: 'prog', stock: 'material', fix: 'fixture', jaw: 'jaw', zero: 'zero', cool: 'cool', cart: 'gauges' };
function prSlotMode(key: string): 'on' | 'off' | 'hover' {
  const cur = PR.seq[PR.at], g = cur ? cur.g : 'machine';
  if (g === 'machine') return 'off';
  if (key === 'base') return 'on';
  if (g === 'trial' && (key === 'zero' || key === 'cool' || key === 'screen' || key === 'cart')) return 'off';
  if (key === 'spindle' || key === 'mag') return 'on';
  const sg = PR_SLOT_STEP[key]; if (!sg) return 'on';
  const st = PR.seq.find((x) => x.g === sg);
  if (key === 'cart') { const gs2 = PR.seq.filter((x) => x.g === 'gauges' || x.g === 'cons'), any = gs2.some(prIsDone); if (g === 'gauges' || g === 'cons') return gs2.every(prIsDone) ? 'on' : 'hover'; return any ? 'on' : 'off'; }
  if (key === 'screen') return 'on';
  if (cur && cur.g === sg) return st && prIsDone(st) ? 'on' : 'hover';
  if (st && prIsDone(st)) return 'on';
  const idx = st ? PR.seq.indexOf(st) : -1; return idx >= 0 && idx < PR.at ? 'on' : 'off';
}
function prFocusKeys(): string[] {
  const cur = PR.seq[PR.at], g = cur ? cur.g : 'machine';
  const T: Record<string, string[]> = { machine: ['#mach'], prog: ['screen'], material: ['stock', 'fix'], fixture: ['fix', 'stock'], jaw: ['jaw', 'stock', 'fix'], zero: ['zero', 'stock', 'spindle'], tools: ['spindle', 'mag'], cool: ['cool', 'fix', 'spindle'], gauges: ['cart'], cons: ['cart'], final: ['*'], trial: ['#trial'] };
  return T[g] ?? ['*'];
}
const prBox3 = new THREE.Box3(), prTmpB = new THREE.Box3(), prV = new THREE.Vector3(), prV2 = new THREE.Vector3();
function prAnimate(s3: Sahne3, dt: number, kk: number): void {
  s3.t += dt; const t = s3.t;
  const cur = PR.seq[PR.at], machStep = !cur || cur.g === 'machine';
  s3.mach.visible = machStep; s3.work.visible = !machStep;
  if (machStep) s3.mach.rotation.y += dt * 0.25;
  for (const [k, s] of Object.entries(s3.slots)) {
    const md = prSlotMode(k); s.g.visible = md !== 'off';
    const tl = md === 'hover' ? (k === 'spindle' ? Math.sin(t * 2.2) * 0.15 : 1.6 + Math.sin(t * 2.2) * 0.18) : 0; s.lift += (tl - s.lift) * Math.min(1, kk * (md === 'hover' ? 1 : 1.6));
    if (k === 'spindle') {
      const L0 = s3.lay; if (L0 && !L0.lathe) { if (PRT.on && PRT.p) s.g.position.copy(PRT.tip); else s.g.position.set(L0.offs[0] ?? 0, L0.stockTop + 2.4, 0); }
      const spin = s.g.userData['spin'] as THREE.Group | undefined; if (spin && PRT.on && PRT.playing && PRT.spinOn) spin.rotation.y += dt * 40;
    } else if (k !== 'mag' && k !== 'screen') s.g.position.y = s.lift;
  }
  const I = s3.magInfo;
  if (I && s3.magCur != null) {
    if (I.lathe) { const tz = s3.magCur / I.N * TAU + PI / 2, cz = I.ring.rotation.z, dz = Math.atan2(Math.sin(tz - cz), Math.cos(tz - cz)); I.ring.rotation.z = cz + dz * kk; }
    else { const ty = -PI / 2 - s3.magCur / I.N * TAU, cy0 = I.ring.rotation.y, dy = Math.atan2(Math.sin(ty - cy0), Math.cos(ty - cy0)); I.ring.rotation.y = cy0 + dy * kk; }
  }
  const keys = prFocusKeys(); prBox3.makeEmpty();
  if (keys[0] === '#mach') prBox3.setFromObject(s3.mach);
  else if (keys[0] === '#trial') {
    const Lz = s3.lay;
    if (Lz && !Lz.lathe) { const o0 = Lz.offs[0] ?? 0; prBox3.set(new THREE.Vector3(o0 - Lz.sx / 2 - 1.5, Lz.fixTop - 1.2, -Lz.sz / 2 - 1.5), new THREE.Vector3(o0 + Lz.sx / 2 + 1.5, Lz.stockTop + 4.5, Lz.sz / 2 + 1.5)); }
    else { const sl = s3.slots['stock']; if (sl) prBox3.setFromObject(sl.g); }
  } else if (keys[0] === '*') { for (const [k, s] of Object.entries(s3.slots)) if (s.g.visible && k !== 'base') { prTmpB.setFromObject(s.g); if (!prTmpB.isEmpty()) prBox3.union(prTmpB); } }
  else keys.forEach((k) => { const s = s3.slots[k]; if (s?.g.visible) { prTmpB.setFromObject(s.g); if (!prTmpB.isEmpty()) prBox3.union(prTmpB); } });
  if (prBox3.isEmpty()) prBox3.set(new THREE.Vector3(-6, 0, -4), new THREE.Vector3(6, 8, 4));
  const c = prBox3.getCenter(prV), rad = Math.max(3, prBox3.getSize(prV2).length() / 2);
  const vw = s3.vw || 1, vh = s3.vh || 1, dock = s3.dock || 0, tf = Math.tan(s3.cam.fov * PI / 360) * (vh - dock) / (vh + dock), aspE = vw / Math.max(1, vh - dock - 70);
  const dist = rad / Math.min(tf, tf * aspE) * (keys[0] === '*' ? 0.92 : 1.05);
  const final = cur?.g === 'final'; s3.idle += dt; if (final && !s3.drag) s3.yaw += dt * 0.12;
  const yaw = 0.5 + s3.yaw, pitch = clamp(0.38 + s3.pitch, 0.05, 1.2);
  const tp = new THREE.Vector3(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  const dk = Math.min(1, kk * 0.75); s3.tgt.lerp(c, dk); s3.pos.lerp(tp, dk);
  s3.cam.position.copy(s3.pos); s3.cam.lookAt(s3.tgt); s3.cam.near = Math.max(0.1, dist / 60); s3.cam.far = dist * 8 + 100;
  if (s3.scene.fog instanceof THREE.Fog) { s3.scene.fog.near = dist * 1.2; s3.scene.fog.far = dist * 3.2 + 40; }
  s3.cam.updateProjectionMatrix();
}

// Sahne döndürme (prototip 21559-21563).
export function sahneBasildi(x: number, y: number): void { const s = P3; if (s) s.drag = { x, y, yaw: s.yaw, pitch: s.pitch }; }
export function sahneKaydi(x: number, y: number): void { const s = P3; if (!s?.drag) return; s.yaw = s.drag.yaw - (x - s.drag.x) * 0.006; s.pitch = s.drag.pitch + (y - s.drag.y) * 0.004; }
export function sahneBirakildi(): void { if (P3) P3.drag = null; }
export function sahneSifirla(): void { if (P3) { P3.yaw = 0; P3.pitch = 0; } }

// Kare: yükleme sahnesi ve deneme. dock: sahnenin altındaki seçim alanının yüksekliği (kamera bu kadar yukarı kayar).
export function hazirlikCiz(z: Cizim, dock: number, canli: () => void): void {
  renkKaynagi(z);
  const s3 = P3 ?? (P3 = kur());
  const dt = z.dt, kk = 1 - Math.pow(0.0008, dt), r = z.rect;
  if (kirli) prBuild(s3);
  s3.vw = r.width; s3.vh = r.height; s3.dock = clamp(dock, 0, r.height * 0.55);
  s3.cam.aspect = r.width / (r.height + s3.dock); s3.cam.setViewOffset(r.width, r.height + s3.dock, 0, s3.dock, r.width, r.height);
  const d = prtFrame(dt); if (d.degisti) kirli = true; if (d.canli) canli();
  prAnimate(s3, dt, kk);
  temizle(z, 'arka');
  z.renderer.render(s3.scene, s3.cam);
}

export function hazirlikBirak(): void {
  const s = P3; if (!s) return;
  for (const y of Object.values(s.slots)) { s.work.remove(y.g); prClear(y.g); }
  prClear(s.mach); s.work.remove(PRT.grp);
  Object.values(s.PRM).forEach((m) => { m.dispose(); });
  P3 = null; kirli = true; renkSayaci += 1;
}
