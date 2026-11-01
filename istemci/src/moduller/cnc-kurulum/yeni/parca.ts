import { useSyncExternalStore } from 'react';
import { LatheGeometry, Quaternion, Vector2, Vector3 } from 'three';
import { stepOku } from '../../../ortak/step/step-oku.ts';
import { fmtN, num } from './bicim.ts';
import { state } from './depo.ts';
import { aabb, agOlcu, enBuyukGovde, govdeAgi, meshVol, minBox as minKutu, parseSTL, sCompute, type HamParca } from './hesap/ham.ts';
import { parcaAbone, parcaDegisti, parcaSurumu, S, type Ag, type Govde } from './parca-durumu.ts';
import { allMaterials, byId } from './secici.ts';
import type { IsMalzemesi } from './veri/tipler.ts';

// Parça yükleme ve ham hesabının S'ye bağlanması (prototipin dosya okuma, geometri ve sCompute'u). Ağı ve sahneyi görünüm kurar
// (S.P/S.I değişince); mesajlar prototipteki gibi S.busy (sürüyor) ve S.msg'dedir. Her değişiklikten sonra parcaDegisti() çağrılır.

export { S, parcaDegisti };
export type { Ag, Govde };

export function useParca(): number { return useSyncExternalStore(parcaAbone, parcaSurumu, parcaSurumu); }

function sBusy(msg: string | null): void { S.busy = msg; parcaDegisti(); }
function sMsg(msg: string): void { S.msg = msg; parcaDegisti(); }

export function stockMat(): IsMalzemesi {
  const L0 = allMaterials();
  return byId(L0, state.stock.mat || state.material) ?? (L0[0] as IsMalzemesi);
}
export function stockRho(): number {
  const r = num(state.stock.rho, Number.NaN);
  return Number.isNaN(r) || r <= 0 ? (stockMat().rho || 7.85) : r;
}

// S yüklü ağ taşıyorsa ham hesabının gördüğü parçadır (hesap axKey, autoAi, geo alanlarını S'ye yazar).
function hamParcasi(): HamParca | null { return S.P && S.I ? S as HamParca : null; }

// Prototipin sCompute'u: sonuç S.res, S.alt, S.geo'ya yazılır. Çizim (sRenderResults, sVisual) Ham Malzeme görünümündür.
export function hamHesapla(): void {
  const parca = hamParcasi();
  const h = sCompute({ st: state.stock, parca, rho: stockRho(), fmtN }, S.vol);
  S.res = h.res; S.alt = h.alt; S.geo = h.geo;
  parcaDegisti();
}

export function sBodyMesh(): Ag { return govdeAgi(S.bodies ?? [], S.bodySel); }

export function sSetMesh(m: Ag, name: string, keepBodies?: boolean): void {
  S.busy = null;
  if (!keepBodies) S.bodies = null;
  S.axKey = null; S.geo = null;
  const { vol, area } = agOlcu(m.P, m.I);
  S.P = m.P; S.I = m.I; S.vol = Math.abs(vol); S.area = area; S.tris = m.I.length / 3; S.name = name; S.solids = m.solids || 1; S.q.identity();
  if (vol < 0) S.msg = '';
  if (S.vol < 1e-6) S.msg = '⚠ Model kapalı bir katı değil — hacim hesaplanamadı. Hammadde ölçüsü yine de hesaplandı.';
  S.fitPending = true;
  hamHesapla();
}

// Prototipin rotateBy ve minBox'u: yön değişir, ham yeniden hesaplanır.
export function rotateBy(axis: 'x' | 'y' | 'z', ang: number): void {
  const q = new Quaternion().setFromAxisAngle(new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), ang);
  S.q.premultiply(q);
  S.fitPending = true;
  hamHesapla();
}
export function minBox(): void {
  if (!S.P) return;
  const r = minKutu(S.P, S.q, fmtN);
  S.q.copy(r.q);
  S.msg = r.mesaj;
  S.fitPending = true;
  hamHesapla();
}
export { aabb };

// Prototipin STEP ayarı: kutu oranı 0,0006, açısal sapma 0,15.
const STEP_AYRINTI = 0.0006;
const STEP_ACI = 0.15;

// Prototipin loadSTEP'i: STEP baytlarını üçgenler; söz yükleme bitince çözülür.
export async function stepBaytYukle(buf: Uint8Array, name: string): Promise<void> {
  sBusy('STEP geometrisi üçgenleniyor…');
  let aglar: Awaited<ReturnType<typeof stepOku>> | null;
  try { aglar = await stepOku(buf.slice().buffer, STEP_AYRINTI, STEP_ACI); } catch { aglar = null; }
  if (!aglar || !aglar.length) { S.busy = null; sMsg('⚠ STEP dosyası okunamadı veya katı model içermiyor'); return; }
  const bodies: Govde[] = aglar.map((m, i) => ({ P: m.konum, I: m.dizin, vol: meshVol(m.konum, m.dizin), name: m.ad || `Gövde ${String(i + 1)}` }));
  S.bodies = bodies.length > 1 ? bodies : null; S.bodySel = 0; S.bodyFile = name;
  if (S.bodies) { S.bodySel = enBuyukGovde(bodies); sSetMesh(sBodyMesh(), name, true); }
  else { const ilk = bodies[0] as Govde; sSetMesh({ P: ilk.P, I: ilk.I, solids: 1 }, name); }
}

// Prototipin sLoadFile'ı: STEP, STP, STL.
export async function parcaYukle(f: File): Promise<void> {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  S.msg = '';
  sBusy('Dosya okunuyor…');
  let buf: Uint8Array;
  try { buf = new Uint8Array(await f.arrayBuffer()); } catch { S.busy = null; sMsg('⚠ Dosya okunamadı'); return; }
  try {
    if (ext === 'stl') sSetMesh(parseSTL(buf), f.name);
    else if (ext === 'step' || ext === 'stp') await stepBaytYukle(buf, f.name);
    else throw new Error('Desteklenen biçimler: STEP, STP, STL');
  } catch (er) {
    S.busy = null;
    sMsg(`⚠ ${er instanceof Error ? er.message : String(er)}`);
  }
}

// Örnek parça: flanşlı mil. Form eşitlemesi (stockFormSync) Ham Malzeme görünümünündür; görünüm parcaAbone ile yeniler.
export function samplePart(): void {
  const pr: [number, number][] = [[0, 0], [22, 0], [22, 18], [40, 18], [40, 30], [30, 30], [30, 95], [24, 95], [24, 120], [0, 120]];
  const g = new LatheGeometry(pr.map((p) => new Vector2(p[0], p[1])), 72);
  const P = new Float32Array(g.attributes['position']?.array ?? []);
  const I = new Uint32Array(g.index?.array ?? []);
  g.dispose();
  sSetMesh({ P, I, solids: 1 }, 'Örnek: flanşlı mil (Ø80 × 120)');
  state.stock.type = 'bar'; state.stock.axis = 'auto';
  hamHesapla();
}
