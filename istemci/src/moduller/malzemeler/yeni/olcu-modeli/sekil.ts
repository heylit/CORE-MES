import {
  BoxGeometry, type BufferGeometry, Curve, CylinderGeometry, DoubleSide, EdgesGeometry, ExtrudeGeometry, Group, LineSegments, Mesh, Path,
  RingGeometry, Shape, TorusGeometry, TubeGeometry, Vector3, type LineBasicMaterial, type Material,
} from 'three';
import { fmtD } from '../bicim.ts';
import { kesitBoyu } from './kesit.ts';

// 3215 c: biçim ve ölçüden (mm) küçük 3B model. Boy ekseni X. Model saklanmaz; her ölçü değişiminde yeniden kurulur.
// Uzun parça (boy / kesit > KISALT) kırık gösterilir: iki uç ve arada boşluk; gerçek boy ölçü yazısında durur.
export const KISALT = 12;

export interface OlcuEtiketi { a: Vector3; b: Vector3; metin: string }
export interface Sekil { grup: Group; olculer: OlcuEtiketi[]; kisaltildi: boolean; temsili: string | null }
export interface SekilMalzemeleri { govde: Material; ikinci: Material; kenar: LineBasicMaterial }

type Olcu = Record<string, number>;
const BOYLU = new Set(['cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent']);
const say = (v: number | undefined): string => (v === undefined ? '' : fmtD(v));
const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

// Tel ve kord kangalı: yarıçapı Rk, tur sayısı ve tur aralığı verilen sarmal (ortası sıfırda).
class Sarmal extends Curve<Vector3> {
  private readonly r: number; private readonly tur: number; private readonly adim: number;
  constructor(r: number, tur: number, adim: number) { super(); this.r = r; this.tur = tur; this.adim = adim; }
  override getPoint(u: number, h = new Vector3()): Vector3 {
    const a = u * this.tur * Math.PI * 2;
    return h.set(this.r * Math.cos(a), (u - 0.5) * this.tur * this.adim, this.r * Math.sin(a));
  }
}

function kesitSekli(form: string, o: Olcu): Shape {
  const s = new Shape();
  const a = o['a'] ?? 0, b = o['b'] ?? 0, t = o['t'] ?? 0;
  if (form === 'boru') {
    const D = o['D'] ?? 0;
    s.absarc(0, 0, D / 2, 0, Math.PI * 2, false);
    const h = new Path(); h.absarc(0, 0, Math.max(0.01, D / 2 - t), 0, Math.PI * 2, true); s.holes.push(h);
  } else if (form === 'kutu') {
    s.moveTo(-a / 2, -b / 2); s.lineTo(a / 2, -b / 2); s.lineTo(a / 2, b / 2); s.lineTo(-a / 2, b / 2); s.closePath();
    const ia = a / 2 - t, ib = b / 2 - t, h = new Path();
    h.moveTo(-ia, -ib); h.lineTo(-ia, ib); h.lineTo(ia, ib); h.lineTo(ia, -ib); h.closePath(); s.holes.push(h);
  } else {
    s.moveTo(0, 0); s.lineTo(a, 0); s.lineTo(a, t); s.lineTo(t, t); s.lineTo(t, b); s.lineTo(0, b); s.closePath();
  }
  return s;
}

function prizma(form: string, o: Olcu, L: number): BufferGeometry {
  if (form === 'cubuk') { const g = new CylinderGeometry((o['d'] ?? 0) / 2, (o['d'] ?? 0) / 2, L, 64); g.rotateZ(Math.PI / 2); return g; }
  if (form === 'altigen') {
    const r = (o['s'] ?? 0) / Math.sqrt(3), g = new CylinderGeometry(r, r, L, 6);
    g.rotateY(Math.PI / 6); g.rotateZ(Math.PI / 2); return g;
  }
  if (form === 'lama') return new BoxGeometry(L, o['b'] ?? 0, o['a'] ?? 0);
  const g = new ExtrudeGeometry(kesitSekli(form, o), { depth: L, bevelEnabled: false, curveSegments: 48 });
  g.translate(0, 0, -L / 2); g.rotateY(Math.PI / 2);
  if (form === 'kosebent') g.translate(0, -(o['b'] ?? 0) / 2, (o['a'] ?? 0) / 2);
  return g;
}

export function sekilKur(form: string, o: Olcu, m: SekilMalzemeleri, gercekOran = false): Sekil | null {
  const grup = new Group(), olculer: OlcuEtiketi[] = [];
  let kisaltildi = false, temsili: string | null = null;
  const ekle = (g: BufferGeometry, x = 0, malzeme: Material = m.govde): void => {
    const govde = new Mesh(g, malzeme); govde.position.x = x; grup.add(govde);
    const kenar = new LineSegments(new EdgesGeometry(g, 25), m.kenar); kenar.position.x = x; grup.add(kenar);
  };
  if (BOYLU.has(form)) {
    const S = kesitBoyu(form, o), L = o['l'];
    if (S === null || L === undefined) return null;
    let gx: number;
    if (!gercekOran && L / S > KISALT) {
      kisaltildi = true;
      const p = S * 4.2, bos = S * 1.1;
      ekle(prizma(form, o, p), -(p / 2 + bos / 2)); ekle(prizma(form, o, p), p / 2 + bos / 2);
      gx = p + bos / 2;
    } else { ekle(prizma(form, o, L)); gx = L / 2; }
    const ust = form === 'cubuk' ? (o['d'] ?? 0) / 2 : form === 'altigen' ? (o['s'] ?? 0) / 2 : form === 'boru' ? (o['D'] ?? 0) / 2 : (o['b'] ?? 0) / 2;
    const on = form === 'cubuk' ? (o['d'] ?? 0) / 2 : form === 'altigen' ? (o['s'] ?? 0) / Math.sqrt(3) : form === 'boru' ? (o['D'] ?? 0) / 2 : (o['a'] ?? 0) / 2;
    olculer.push({ a: V(-gx, ust + S * 0.9, on), b: V(gx, ust + S * 0.9, on), metin: `L ${say(L)}` });
    const xu = gx + S * 0.02;
    if (form === 'cubuk') olculer.push({ a: V(xu, -(o['d'] ?? 0) / 2, 0), b: V(xu, (o['d'] ?? 0) / 2, 0), metin: `Ø ${say(o['d'])}` });
    else if (form === 'altigen') olculer.push({ a: V(xu, -(o['s'] ?? 0) / 2, 0), b: V(xu, (o['s'] ?? 0) / 2, 0), metin: `SW ${say(o['s'])}` });
    else if (form === 'boru') olculer.push({ a: V(xu, -(o['D'] ?? 0) / 2, 0), b: V(xu, (o['D'] ?? 0) / 2, 0), metin: `Ø ${say(o['D'])}` });
    else olculer.push({ a: V(xu, -(o['b'] ?? 0) / 2, -(o['a'] ?? 0) / 2), b: V(xu, -(o['b'] ?? 0) / 2, (o['a'] ?? 0) / 2), metin: `${say(o['a'])} × ${say(o['b'])}` });
  } else if (form === 'levha' || form === 'blok') {
    const X = form === 'levha' ? o['l'] ?? 0 : o['b'] ?? 0, Y = form === 'levha' ? o['t'] ?? 0 : o['h'] ?? 0, Z = form === 'levha' ? o['w'] ?? 0 : o['a'] ?? 0;
    const Yc = form === 'levha' ? Math.max(Y, Math.max(X, Z) / 150) : Y;
    if (Yc > Y) temsili = 'Kalınlık görünsün diye kalın çizildi';
    ekle(new BoxGeometry(X, Yc, Z));
    const p = Math.max(X, Z) * 0.05;
    olculer.push({ a: V(-X / 2, -Yc / 2, Z / 2 + p), b: V(X / 2, -Yc / 2, Z / 2 + p), metin: say(X) });
    olculer.push({ a: V(X / 2 + p, -Yc / 2, -Z / 2), b: V(X / 2 + p, -Yc / 2, Z / 2), metin: say(Z) });
  } else if (form === 'disk') {
    ekle(new CylinderGeometry((o['d'] ?? 0) / 2, (o['d'] ?? 0) / 2, o['t'] ?? 0, 96));
    olculer.push({ a: V(-(o['d'] ?? 0) / 2, (o['t'] ?? 0) / 2, 0), b: V((o['d'] ?? 0) / 2, (o['t'] ?? 0) / 2, 0), metin: `Ø ${say(o['d'])}` });
  } else if (form === 'oring') {
    const R = ((o['d1'] ?? 0) + (o['d2'] ?? 0)) / 2, g = new TorusGeometry(R, (o['d2'] ?? 0) / 2, 32, 120);
    g.rotateX(Math.PI / 2); ekle(g, 0, m.ikinci);
    olculer.push({ a: V(-(o['d1'] ?? 0) / 2, 0, 0), b: V((o['d1'] ?? 0) / 2, 0, 0), metin: `İç Ø ${say(o['d1'])}` });
  } else if (form === 'tel' || form === 'kord') {
    const d = o['d'] ?? 0, Rk = Math.max(60, d * 40), tur = 7, adim = d * 1.15;
    ekle(new TubeGeometry(new Sarmal(Rk, tur, adim), tur * 64, d / 2, 12, false));
    olculer.push({ a: V(Rk - d / 2, (tur * adim) / 2 + d * 3, 0), b: V(Rk + d / 2, (tur * adim) / 2 + d * 3, 0), metin: `Ø ${say(d)}` });
    temsili = 'Kangal çapı temsilî';
  } else if (form === 'rulo' || form === 'kumas') {
    // Dış çap rulo boyundan: film kesit alanı (t x L) halka alanına eşit; kumaşta kalınlık bilinmediği için temsilî.
    const ic = 76, w = o['w'] ?? 0, t = form === 'rulo' ? o['t'] ?? 0 : 0.3;
    const dis = Math.sqrt(ic ** 2 + (4 * t * (o['L'] ?? 0) * 1000) / Math.PI);
    const g = new CylinderGeometry(dis / 2, dis / 2, w, 96, 1, true); g.rotateZ(Math.PI / 2); ekle(g);
    for (const yon of [1, -1]) { const k = new RingGeometry(ic / 2, dis / 2, 96); k.rotateY((yon * Math.PI) / 2); ekle(k, (yon * w) / 2); }
    const go = new CylinderGeometry(ic / 2, ic / 2, w * 1.04, 48, 1, true); go.rotateZ(Math.PI / 2); ekle(go, 0, m.ikinci);
    olculer.push({ a: V(-w / 2, dis / 2 * 1.08, 0), b: V(w / 2, dis / 2 * 1.08, 0), metin: `En ${say(w)}` });
    temsili = form === 'rulo' ? 'Dış çap rulo boyundan hesaplandı' : 'Rulo çapı temsilî';
  } else return null;
  return { grup, olculer, kisaltildi, temsili };
}

// Malzeme rengi aileden (ve metalde sınıftan) tasarım değişkeni adıdır; kaliteye göre ince ton yok (3215 KURGU V4).
const METAL: Record<string, string> = {
  paslanmaz: '--sahne3b-krom', aluminyum: '--sahne3b-alu', aldokum: '--sahne3b-alu', bakir: '--sahne3b-sari',
  titanyum: '--sahne3b-galv', nikel: '--sahne3b-galv', dokme: '--sahne3b-celik-koyu',
};
const AILE: Record<string, string> = {
  plastik: '--sahne3b-ic', elastomer: '--sahne3b-kaucuk', ahsap: '--sahne3b-ahsap', kompozit: '--sahne3b-koyu', seramik: '--sahne3b-panel', cam: '--sahne3b-cam',
};
export function malzemeRengiAdi(aile: string | null, sinif: string | null): string {
  if (aile === 'metal') return (sinif && METAL[sinif]) || '--sahne3b-celik';
  return (aile && AILE[aile]) || '--sahne3b-celik';
}

// Rulo kapakları ve açık silindirler arkadan da görünsün.
export const IKI_YUZ = DoubleSide;
