import * as THREE from 'three';
import { bt, byId, machine } from '../secici.ts';
import { prFixList, prFixN, prLathe, prStk } from '../hesap/hazirlik.ts';
import { CNC3D } from '../sahne/cnc3d.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';

// Eksik ham ölçüsü prototipte undefined okur ve NaN üretir; aynı sonuç.
const olc = (v: number | undefined): number => v ?? Number.NaN;

// Hazırlık sahnesinin yerleşimi: tezgâh tipine göre sabit noktalar (prototip 20940-20964).
export interface Yerlesim {
  lathe: boolean; m: Tezgah; k: number; fix: Kalem; n: number; offs: number[]; zero: THREE.Vector3; nose: number; spX: number;
  // freze
  tableTop: number; fixTop: number; fixW: number; fixD: number; vise: boolean; pitch: number; tw: number; sx: number; sz: number; sy: number;
  stockBot: number; stockTop: number; magPos: THREE.Vector3; magScale: number;
  // torna
  cy: number; headX: number; chuckR: number; chuckLen: number; fixShift: number; face: number; d: number; len: number;
  stockX0: number; stockX1: number; turPos: THREE.Vector3; turScale: number;
}

export function prLayout(): Yerlesim {
  const m = machine(), lathe = prLathe(), s = prStk(), L = { lathe, m } as Yerlesim;
  const fix = byId(prFixList(), bt().fixture) ?? prFixList()[0];
  if (!fix) throw new Error('bağlama listesi boş');
  if (!lathe) {
    L.k = 1 / 30; L.tableTop = 1.4;
    const fo = CNC3D.build(fix), fb = new THREE.Box3().setFromObject(fo); CNC3D.dispose(fo);
    L.fix = fix; L.fixTop = L.tableTop + fb.max.y; L.fixW = fb.max.x - fb.min.x; L.fixD = fb.max.z - fb.min.z;
    L.vise = /^f_(h|d|c)?vise$/.test(fix.kind); L.n = prFixN(); L.pitch = L.fixW + 0.9; L.offs = [];
    for (let fi = 0; fi < L.n; fi++) L.offs.push((fi - (L.n - 1) / 2) * L.pitch);
    L.tw = Math.max(21, L.n * L.pitch + 2);
    L.sx = Math.max(0.3, olc(s.x) * L.k); L.sz = Math.max(0.3, olc(s.y) * L.k); L.sy = Math.max(0.2, olc(s.z) * L.k);
    L.stockBot = L.fixTop - (L.vise ? Math.min(0.9, L.sy * 0.45) : 0); L.stockTop = L.stockBot + L.sy;
    L.nose = L.stockTop + 10.5; L.spX = 0;
    L.magPos = new THREE.Vector3(17, L.nose + 1.5, -7); L.magScale = 0.8;
    L.zero = new THREE.Vector3((L.offs[0] ?? 0) - L.sx / 2, L.stockTop, L.sz / 2);
  } else {
    L.k = 4.2 / 210; L.cy = 7.5; L.headX = -7;
    const fo2 = CNC3D.build(fix); fo2.rotation.y = Math.PI / 2; fo2.updateMatrixWorld(true);
    const fb2 = new THREE.Box3().setFromObject(fo2); CNC3D.dispose(fo2);
    L.fix = fix; L.chuckR = Math.max(fb2.max.y, -fb2.min.y); L.chuckLen = fb2.max.x - fb2.min.x; L.fixShift = L.headX - fb2.min.x; L.face = L.headX + L.chuckLen;
    L.d = Math.max(0.2, olc(s.d) * L.k); L.len = Math.max(0.4, olc(s.l) * L.k);
    L.stockX0 = L.face - Math.min(0.8, L.len * 0.3); L.stockX1 = L.stockX0 + L.len;
    L.turPos = new THREE.Vector3(Math.max(L.stockX1 + 7, 6), L.cy, -2.5); L.turScale = 0.85;
    L.zero = new THREE.Vector3(L.stockX1, L.cy, 0); L.n = 1; L.offs = [0];
    L.nose = L.cy + 8; L.spX = (L.face + L.stockX1) / 2 + 1.5;
  }
  return L;
}
