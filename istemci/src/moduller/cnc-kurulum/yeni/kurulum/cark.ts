import * as THREE from 'three';
import { FONT as YAZI, clamp, pad2, sstep, upTR } from '../bicim.ts';
import { cardTex, envTex, lights, maxAniso, rr } from '../sahne/gl.ts';
import type { Cizim } from '../sahne/Sahne.tsx';
import type { Kalem } from '../veri/tipler.ts';
import { seciliEmir } from '../veri.ts';
import { dokuIzi, renk, renkKaynagi, temizle } from './renk.ts';
import { K, focusIdx, goRow, isSel, kancalar, selIndex, setOpt, toggle, type CarkAdimi } from './satirlar.ts';
import { S, isaretler, isaretliSayisi, operasyon, saat } from './secim.ts';

// Kurulum çarkı: 3B davul, her adım bir satır, her seçenek bir kart (prototip 17512-17575, 17779-17881, kare 24482-24512).
// "SEÇİLDİ" damgası ve en alttaki "Kurulum tamam" kartı bugün köprüde sahneye sonradan eklenir (cerceve-kopru.ts 453-616);
// burada sahnenin kendi parçasıdır.

const PI = Math.PI, TAU = PI * 2;
const R = 8, ALPHA = TAU / 18, CR = 9, CW = 2.4, CH = 1.64, SP = 2.72, BETA = SP / CR, FOV = 42;

interface KartVerisi { fm: THREE.MeshStandardMaterial; faceM: THREE.MeshBasicMaterial; glowM: THREE.MeshBasicMaterial; bm: THREE.MeshBasicMaterial; badge: THREE.Mesh; face: THREE.Mesh; frame: THREE.Mesh; sc: number; gl: number; row: number; k: number; damga?: THREE.Mesh; damgaBas?: number | null }
interface Satir { pivot: THREE.Group; car: THREE.Group; cards: THREE.Group[]; label: THREE.Mesh; lm: THREE.MeshBasicMaterial; def: CarkAdimi }

const kv = (c: THREE.Object3D): KartVerisi => c.userData as KartVerisi;

function tuval(g: number, y: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = g; c.height = y;
  const x = c.getContext('2d');
  if (x === null) throw new Error('tuval yok');
  return [c, x];
}
function doku(c: HTMLCanvasElement, aniso = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (aniso) t.anisotropy = maxAniso; return t;
}

function makeGlowTex(): THREE.CanvasTexture {
  const [c, x] = tuval(256, 200), acc = renk('vurgu');
  x.shadowColor = acc; x.shadowBlur = 22; x.strokeStyle = acc; x.lineWidth = 5; rr(x, 27, 28, 202, 144, 12); x.stroke(); x.stroke();
  return doku(c);
}
function makeBadgeTex(): THREE.CanvasTexture {
  const [c, x] = tuval(64, 64);
  x.fillStyle = renk('ok'); x.beginPath(); x.arc(32, 32, 30, 0, TAU); x.fill(); x.strokeStyle = renk('yazi-parlak'); x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(18, 33); x.lineTo(28, 43); x.lineTo(46, 22); x.stroke();
  return doku(c);
}
function labelTex(i: number, def: CarkAdimi): THREE.CanvasTexture {
  const [c, x] = tuval(1024, 64);
  const n = pad2(i + 1), title = upTR(def.title) + (def.type === 'multi' ? `  ·  ${String(def.list().length)} SEÇİLİ` : '');
  x.font = `700 34px ${YAZI}`; x.textBaseline = 'middle';
  const w1 = x.measureText(n + '   ').width, w2 = x.measureText(title).width, sx = 512 - (w1 + w2) / 2;
  x.fillStyle = renk('vurgu'); x.fillText(n, sx, 34); x.fillStyle = renk('yazi'); x.fillText(title, sx + w1, 34);
  return doku(c, true);
}
function gearGeo(rO: number, n: number, depth: number): THREE.ExtrudeGeometry {
  const sh = new THREE.Shape(), step = TAU / n, rR = rO - 0.38;
  for (let i = 0; i < n; i++) {
    const a = i * step - step / 2, pts: [number, number][] = [[rR, a], [rR, a + step * 0.22], [rO, a + step * 0.36], [rO, a + step * 0.64], [rR, a + step * 0.78], [rR, a + step]];
    pts.forEach(([r, b], k) => { const X = Math.cos(b) * r, Y = Math.sin(b) * r; if (i === 0 && k === 0) sh.moveTo(X, Y); else sh.lineTo(X, Y); });
  }
  const h0 = new THREE.Path(); h0.absarc(0, 0, rO - 1.05, 0, TAU, true); sh.holes.push(h0);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 48 });
  g.translate(0, 0, -depth / 2); g.rotateY(PI / 2); return g;
}

const kutu = (x: CanvasRenderingContext2D, a: number, b: number, g: number, y: number, r: number): void => { rr(x, a, b, g, y, r); };

interface Cark {
  scene: THREE.Scene; cam: THREE.PerspectiveCamera; drum: THREE.Group; gears: THREE.Mesh[]; pawls: THREE.Mesh[];
  GEO: Record<'frame' | 'face' | 'glow' | 'badge' | 'label', THREE.BufferGeometry>; glowTex: THREE.Texture; badgeTex: THREE.Texture;
  rows: (Satir | undefined)[]; iz: number; renkIzi: number; thMax: number; gx: number; pxUnit: number;
  stageRect: { left: number; top: number; width: number; height: number }; lastSW: number; lastSH: number;
  mouseX: number; mouseY: number; dragDrum: number | null; dragOpt: number | null; pickables: THREE.Object3D[]; ray: THREE.Raycaster;
  son: { pivot: THREE.Group; malzeme: THREE.MeshBasicMaterial; tuval: HTMLCanvasElement; iz: string; bas: number } | null;
  damgaDokusu: THREE.Texture | null; kay: number; kayHedef: number;
}

let C: Cark | null = null;

function kur(): Cark {
  const scene = new THREE.Scene(); scene.environment = envTex;
  scene.fog = new THREE.Fog(new THREE.Color(renk('arka')), 13, 27); lights(scene, 1);
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const drum = new THREE.Group(); scene.add(drum);
  const gearMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk('disli')), metalness: 0.9, roughness: 0.38 });
  const gearG = gearGeo(R + 0.25, 18, 0.3), gears = [new THREE.Mesh(gearG, gearMat), new THREE.Mesh(gearG, gearMat)];
  gears.forEach((g) => { drum.add(g); });
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 24), gearMat); axle.rotation.z = PI / 2; drum.add(axle);
  const spokeG = new THREE.BoxGeometry(0.22, 2 * (R - 1.0), 0.22);
  gears.forEach((g) => { for (let s = 0; s < 3; s++) { const sp = new THREE.Mesh(spokeG, gearMat); sp.rotation.x = s * PI / 3; g.add(sp); } });
  const acc = new THREE.Color(renk('vurgu'));
  const pawlMat = new THREE.MeshStandardMaterial({ color: acc, metalness: 0.3, roughness: 0.4, emissive: acc, emissiveIntensity: 0.35 });
  const pawls = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 3), pawlMat); m.rotation.x = -PI / 2; scene.add(m); return m; });
  return {
    scene, cam, drum, gears, pawls,
    GEO: { frame: new THREE.BoxGeometry(CW, CH, 0.08), face: new THREE.PlaneGeometry(CW - 0.06, CH - 0.06), glow: new THREE.PlaneGeometry(CW + 0.5, CH + 0.5), badge: new THREE.CircleGeometry(0.16, 28), label: new THREE.PlaneGeometry(6.4, 0.4) },
    glowTex: makeGlowTex(), badgeTex: makeBadgeTex(), rows: [], iz: -1, renkIzi: dokuIzi(), thMax: 1.2, gx: 7, pxUnit: 50,
    stageRect: { left: 0, top: 0, width: 1, height: 1 }, lastSW: 0, lastSH: 0, mouseX: 0, mouseY: 0, dragDrum: null, dragOpt: null,
    pickables: [], ray: new THREE.Raycaster(), son: null, damgaDokusu: null, kay: 0, kayHedef: 0,
  };
}

function makeCard(c: Cark, opt: Kalem, def: CarkAdimi): THREE.Group {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk('kart-govde')), metalness: 0.6, roughness: 0.4, transparent: true });
  const faceM = new THREE.MeshBasicMaterial({ map: cardTex(opt, { cat: def.cat, col: renk(def.col) }), transparent: true, toneMapped: false });
  const glowM = new THREE.MeshBasicMaterial({ map: c.glowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const bm = new THREE.MeshBasicMaterial({ map: c.badgeTex, transparent: true, toneMapped: false });
  const frame = new THREE.Mesh(c.GEO.frame, fm), face = new THREE.Mesh(c.GEO.face, faceM), glow = new THREE.Mesh(c.GEO.glow, glowM), badge = new THREE.Mesh(c.GEO.badge, bm);
  face.position.z = 0.041; glow.position.z = -0.06; badge.position.set(CW / 2 - 0.22, CH / 2 - 0.22, 0.05); badge.visible = false;
  g.add(glow, frame, face, badge);
  const u: KartVerisi = { fm, faceM, glowM, bm, badge, face, frame, sc: 1, gl: 0, row: 0, k: 0 };
  g.userData = u;
  return g;
}
function buildRow(c: Cark, i: number): Satir | undefined {
  const def = K.defs[i]; if (!def) return undefined;
  const pivot = new THREE.Group(), row = new THREE.Group(), car = new THREE.Group();
  pivot.rotation.x = i * ALPHA; row.position.z = R; car.position.z = -CR; pivot.add(row); row.add(car);
  const cards = def.options.map((opt, k) => {
    const card = makeCard(c, opt, def), a = k * BETA; card.position.set(CR * Math.sin(a), 0, CR * Math.cos(a)); card.rotation.y = a;
    kv(card).row = i; kv(card).k = k; car.add(card); return card;
  });
  const lm = new THREE.MeshBasicMaterial({ map: labelTex(i, def), transparent: true, toneMapped: false, depthWrite: false }), label = new THREE.Mesh(c.GEO.label, lm);
  label.position.set(0, CH / 2 + 0.33, 0.02); row.add(label);
  c.drum.add(pivot);
  return { pivot, car, cards, label, lm, def };
}
function disposeRow(c: Cark, r: Satir): void {
  c.drum.remove(r.pivot); r.lm.map?.dispose(); r.lm.dispose();
  r.cards.forEach((card) => { const u = kv(card); u.fm.dispose(); u.faceM.dispose(); u.glowM.dispose(); u.bm.dispose(); u.damga?.geometry.dispose(); });
}
function satirlariYenile(c: Cark): void {
  c.rows.forEach((r) => { if (r) disposeRow(c, r); }); c.rows = []; c.iz = K.iz;
}

// ----- etkileşim (prototip 17780-17838) -----
export function carkSec(cx: number, cy: number): void {
  const c = C; if (!c) return;
  const nx = ((cx - c.stageRect.left) / c.stageRect.width) * 2 - 1, ny = -((cy - c.stageRect.top) / c.stageRect.height) * 2 + 1;
  c.ray.setFromCamera(new THREE.Vector2(nx, ny), c.cam);
  const hit = c.ray.intersectObjects(c.pickables, false)[0];
  if (!hit?.object.parent) return;
  const u = kv(hit.object.parent), i = u.row, k = u.k, def = K.defs[i]; if (!def) return;
  const a = K.anim[def.key];
  if (i !== K.active) { goRow(i); if (def.type === 'single') setOpt(k); else if (a) a.focus = k; return; }
  if (def.type === 'single') setOpt(k); else if (a?.focus === k) toggle(); else setOpt(k);
}

interface Surukleme { x: number; y: number; axis: 'x' | 'y' | null; d0: number; o0: number }
let drag: Surukleme | null = null;
export function carkBasildi(x: number, y: number): void { drag = { x, y, axis: null, d0: K.active, o0: focusIdx(K.active) }; }
export function carkKaydi(x: number, y: number): void {
  const c = C; if (!c) return;
  c.mouseX = (x - c.stageRect.left) / c.stageRect.width - 0.5; c.mouseY = (y - c.stageRect.top) / c.stageRect.height - 0.5;
  if (!drag) return;
  const dx = x - drag.x, dy = y - drag.y;
  if (!drag.axis && Math.sqrt(dx * dx + dy * dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (drag.axis === 'y') c.dragDrum = clamp(drag.d0 - dy / (c.pxUnit * R * ALPHA), 0, K.defs.length - 1);
  if (drag.axis === 'x') c.dragOpt = clamp(drag.o0 - dx / (c.pxUnit * SP), 0, (K.defs[K.active]?.options.length ?? 1) - 1);
}
export function carkBirakildi(x: number, y: number, tiklama: boolean): void {
  const c = C; if (!drag || !c) { drag = null; return; }
  if (!drag.axis) { if (tiklama) carkSec(x, y); }
  else if (drag.axis === 'y' && c.dragDrum != null) { const t = Math.round(c.dragDrum); K.drumCur = c.dragDrum; c.dragDrum = null; goRow(t); }
  else if (drag.axis === 'x' && c.dragOpt != null) { const k = Math.round(c.dragOpt), d = K.defs[K.active], a = d ? K.anim[d.key] : undefined; if (a) a.cur = c.dragOpt; c.dragOpt = null; setOpt(k); }
  drag = null; c.dragDrum = null; c.dragOpt = null;
}
export function carkCikti(): void { if (C) { C.mouseX = 0; C.mouseY = 0; } }
export function surukleniyor(): boolean { return drag !== null; }

// ----- "Kurulum tamam" kartına iniş -----
export function sonKartaIn(acik: boolean): void { if (C) C.kayHedef = acik ? 1 : 0; }

// ----- boyut ve kamera (prototip 17870-17881) -----
function layout(c: Cark, r: Cark['stageRect']): void {
  c.stageRect = r;
  if (r.width === c.lastSW && r.height === c.lastSH) return; c.lastSW = r.width; c.lastSH = r.height;
  const asp = r.width / Math.max(1, r.height), t = Math.tan(FOV / 2 * PI / 180), dist = Math.max(10.2, (asp < 1 ? 1.95 : 4.0) / (t * asp));
  c.cam.aspect = asp; c.cam.position.set(0, 0.35, R + dist); c.cam.lookAt(0, -0.15, R); c.cam.updateProjectionMatrix();
  if (c.scene.fog instanceof THREE.Fog) { c.scene.fog.near = dist + 0.6; c.scene.fog.far = dist + 14; }
  const half = dist * t * asp; c.pxUnit = r.height / (2 * dist * t);
  const showG = half > 4.6; c.gx = showG ? half - 0.3 : half + 2;
  c.gears[0]?.position.set(-c.gx, 0, 0); c.gears[1]?.position.set(c.gx, 0, 0); c.gears.forEach((g) => { g.visible = showG; });
  c.pawls[0]?.position.set(-c.gx, 0, R + 0.85); c.pawls[1]?.position.set(c.gx, 0, R + 0.85); c.pawls.forEach((p) => { p.visible = showG; });
  const lim = (showG ? c.gx - 0.5 : half - 0.2) - CW / 2; c.thMax = Math.asin(clamp(lim / CR, 0.05, 0.99));
}

// ----- damga ve son kart (cerceve-kopru.ts 492-616) -----
function damgaMalzemesi(c: Cark): THREE.MeshBasicMaterial {
  if (c.damgaDokusu === null) {
    const [t, x] = tuval(512, 180), y = renk('ok');
    x.strokeStyle = y; x.lineWidth = 12; kutu(x, 12, 12, 488, 156, 22); x.stroke();
    x.lineWidth = 3; kutu(x, 30, 30, 452, 120, 14); x.stroke();
    x.fillStyle = y; x.font = `800 84px ${YAZI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✓ SEÇİLDİ', 256, 94);
    c.damgaDokusu = doku(t);
  }
  return new THREE.MeshBasicMaterial({ map: c.damgaDokusu, transparent: true, depthWrite: false, toneMapped: false });
}
function sonKartIzi(): string {
  const s = isaretliSayisi();
  return JSON.stringify([S.kurulum, s.secilen, s.toplam, seciliEmir()?.id ?? null, dokuIzi()]);
}
function sonKartCiz(t: HTMLCanvasElement): void {
  const x = t.getContext('2d'); if (x === null) return;
  const { secilen, toplam } = isaretliSayisi(), e = seciliEmir(), k = S.kurulum;
  const G = t.width, Y = t.height;
  x.clearRect(0, 0, G, Y);
  const gr = x.createLinearGradient(0, 0, 0, Y); gr.addColorStop(0, renk('kart-ust')); gr.addColorStop(1, renk('kart-alt'));
  x.fillStyle = gr; kutu(x, 0, 0, G, Y, 30); x.fill();
  const r = k?.gecerli === true ? renk('ok') : k !== null ? renk('sari') : renk('vurgu');
  x.strokeStyle = r; x.lineWidth = 6; kutu(x, 3, 3, G - 6, Y - 6, 28); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = renk('yazi-ikincil'); x.font = `600 30px ${YAZI}`;
  x.fillText(e === null ? 'Üretim emri seçilmedi' : `${operasyon(e)} · ${e.parcaNo}`, G / 2, 70);
  if (k?.gecerli === true) {
    x.save(); x.translate(G / 2, Y / 2 + 10); x.rotate(-0.06);
    x.strokeStyle = renk('ok'); x.lineWidth = 12; kutu(x, -400, -110, 800, 220, 26); x.stroke();
    x.fillStyle = renk('ok'); x.font = `800 92px ${YAZI}`; x.fillText('KURULUM TAMAM', 0, -28);
    x.font = `700 40px ${YAZI}`; x.fillText(`${k.kisi.ad} · ${saat(k.zaman)}`, 0, 58);
    x.restore();
  } else {
    x.fillStyle = renk('yazi-parlak'); x.font = `800 88px ${YAZI}`; x.fillText('KURULUM TAMAM', G / 2, Y / 2 - 10);
    x.fillStyle = r; x.font = `700 38px ${YAZI}`;
    x.fillText(k !== null ? 'Seçimler değişti · yeniden onaylayın'
      : secilen === toplam && toplam > 0 ? 'Bütün adımlar seçildi · onaylayın' : `${String(secilen)} / ${String(toplam)} adım seçildi`, G / 2, Y / 2 + 80);
  }
}
function damgaCiz(c: Cark, r: Satir, simdi: number): void {
  const a = isaretler(), def = r.def, isaretli = a[def.key] === true, coklu = def.type === 'multi';
  let enIyi: THREE.Group | null = null;
  if (isaretli && !coklu) for (const k of r.cards) if (k.visible && (enIyi === null || kv(k).faceM.opacity > kv(enIyi).faceM.opacity)) enIyi = k;
  for (const k of r.cards) {
    const u = kv(k), secik = isaretli && (coklu ? u.badge.visible : k === enIyi);
    if (!secik) { if (u.damga) { u.damga.visible = false; u.damgaBas = null; } continue; }
    if (!u.damga) { u.damga = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.46), damgaMalzemesi(c)); u.damga.position.set(0.42, -0.24, 0.07); u.damga.rotation.z = -0.16; k.add(u.damga); }
    if (typeof u.damgaBas !== 'number') u.damgaBas = simdi;
    const t = Math.min(1, (simdi - u.damgaBas) / 240);
    u.damga.visible = k.visible; u.damga.scale.setScalar(1 + 0.9 * (1 - t) * (1 - t));
    (u.damga.material as THREE.MeshBasicMaterial).opacity = u.faceM.opacity * (0.35 + 0.6 * t);
  }
}
function sonKart(c: Cark, simdi: number): void {
  if (!S.isaretleyebilir) return;
  const toplam = K.defs.length;
  if (c.son === null) {
    const [t] = tuval(1024, 420);
    const malzeme = new THREE.MeshBasicMaterial({ map: doku(t), transparent: true, toneMapped: false, depthWrite: false });
    const kart = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.48), malzeme), satir = new THREE.Group(); satir.position.z = R; satir.add(kart);
    const pivot = new THREE.Group(); pivot.add(satir); c.drum.add(pivot);
    c.son = { pivot, malzeme, tuval: t, iz: '', bas: 0 };
  }
  const son = c.son, iz = sonKartIzi();
  if (iz !== son.iz) {
    if (S.kurulum?.gecerli === true && !son.iz.includes('"gecerli":true')) son.bas = simdi;
    son.iz = iz; sonKartCiz(son.tuval); if (son.malzeme.map) son.malzeme.map.needsUpdate = true;
  }
  c.kay += (c.kayHedef - c.kay) * 0.12; if (Math.abs(c.kayHedef - c.kay) < 0.001) c.kay = c.kayHedef;
  c.drum.rotation.x -= c.kay * ALPHA;
  son.pivot.rotation.x = toplam * ALPHA;
  const konum = -c.drum.rotation.x / ALPHA, gorunurluk = Math.max(0, Math.min(1, 1.15 - Math.abs(toplam - konum) * 0.3));
  son.pivot.visible = gorunurluk > 0.02; son.malzeme.opacity = gorunurluk;
  const b = son.bas === 0 ? 1 : Math.min(1, (simdi - son.bas) / 320);
  son.pivot.children[0]?.children[0]?.scale.setScalar(1 + 0.25 * (1 - b) * (1 - b));
}

// ----- kare (prototip 24482-24507) -----
export function carkCiz(z: Cizim): void {
  renkKaynagi(z);
  if (C && C.renkIzi !== dokuIzi()) { carkBirak(); }
  const c = C ?? (C = kur());
  kancalar.etiket = etiketYenile;
  if (c.iz !== K.iz) satirlariYenile(c);
  layout(c, z.rect);
  const dt = z.dt, kk = 1 - Math.pow(0.0008, dt), k2 = 1 - Math.pow(0.0002, dt);
  const dTarget = c.dragDrum ?? K.active; K.drumCur += (dTarget - K.drumCur) * (c.dragDrum != null ? k2 : kk);
  c.drum.rotation.x = -K.drumCur * ALPHA;
  c.cam.position.x += (c.mouseX * 0.8 - c.cam.position.x) * kk * 0.5; c.cam.position.y += ((0.35 - c.mouseY * 0.5) - c.cam.position.y) * kk * 0.5; c.cam.lookAt(0, -0.15, R);
  c.pickables.length = 0;
  const lo = Math.floor(K.drumCur) - 3, hi = Math.ceil(K.drumCur) + 3, simdi = performance.now();
  c.rows.forEach((r, j) => { if (r && (j < lo || j > hi)) r.pivot.visible = false; });
  for (let i = Math.max(0, lo); i <= Math.min(K.defs.length - 1, hi); i++) {
    const r = c.rows[i] ?? (c.rows[i] = buildRow(c, i)); if (!r) continue;
    const def = r.def, a = K.anim[def.key], isAct = i === K.active; if (!a) continue;
    r.pivot.visible = true;
    const tgt = isAct && c.dragOpt != null ? c.dragOpt : (def.type === 'single' ? selIndex(def) : a.focus);
    a.cur += (tgt - a.cur) * (isAct && c.dragOpt != null ? k2 : kk); r.car.rotation.y = -a.cur * BETA;
    const rel = Math.abs(i - K.drumCur), rowOp = clamp(1.15 - rel * 0.3, 0, 1);
    r.lm.opacity = rowOp * (isAct ? 1 : 0.55);
    const sel = Math.round(tgt);
    r.cards.forEach((card, ci) => {
      const u = kv(card), ang = Math.abs((ci - a.cur) * BETA);
      const fade = 1 - sstep(c.thMax * 0.55, c.thMax + 0.15, ang), side = isAct ? 1 : (ci === sel ? 0.95 : 0.4), op = fade * rowOp * side;
      if (op < 0.015) { card.visible = false; return; }
      card.visible = true; u.fm.opacity = op; u.faceM.opacity = op;
      const foc = isAct && ci === sel;
      u.sc += ((foc ? 1.08 : 1) - u.sc) * kk; card.scale.setScalar(u.sc);
      u.gl += ((foc ? 1 : 0) - u.gl) * kk; u.glowM.opacity = u.gl * op; u.glowM.visible = u.gl > 0.01;
      const opt = def.options[ci], b = def.type === 'multi' && opt !== undefined && isSel(def, opt); u.badge.visible = b; if (b) u.bm.opacity = op;
      if (op > 0.2) c.pickables.push(u.face, u.frame);
    });
    damgaCiz(c, r, simdi);
  }
  sonKart(c, simdi);
  c.drum.updateMatrixWorld(true);
  temizle(z, 'arka');
  z.renderer.render(c.scene, c.cam);
}

// Çoklu adımın etiketi seçili sayısını gösterir: liste değişince yenilenir.
export function etiketYenile(i: number): void {
  const r = C?.rows[i]; if (!r) return;
  r.lm.map?.dispose(); r.lm.map = labelTex(i, r.def); r.lm.needsUpdate = true;
}

export function carkBirak(): void {
  const c = C; if (!c) return;
  satirlariYenile(c);
  c.glowTex.dispose(); c.badgeTex.dispose(); c.damgaDokusu?.dispose();
  Object.values(c.GEO).forEach((g) => { g.dispose(); });
  C = null;
}
