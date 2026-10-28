import { LatheGeometry, Matrix4, Vector2 } from 'three';
import { fmtN, num } from '../bicim.ts';
import { save, state } from '../depo.ts';
import { gkodaGonder, type GTakimEslesmesi } from '../hesap/gkod.ts';
import { hazirligaGonder, prMachineChanged, prToolsChanged, PS } from '../hesap/hazirlik.ts';
import { catParams, lifeModel } from '../hesap/omur.ts';
import { download } from '../indir.ts';
import { parcaYukle, S, sSetMesh, stepBaytYukle } from '../parca.ts';
import { allMachines, allMill, byId, machine, material, toolLib, tools } from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import { camCal, camSetupCSV, camSetupMT } from './ayar-suresi.ts';
import {
  CAM_DEF, camChooseSetups, camPost, camSetupOps, camTime, camTools, camVoxels,
} from './cekirdek.ts';
import { camKaydi } from './durum.ts';
import { ORNEK_GOVDE, ORNEK_MIL, ORNEK_TORNA_FREZE } from './ornekler.ts';
import {
  camApplyRoute, camRoute, rtGeo, rtKey, rtLists, rtOk, rtSum, type HamSonucu, type Rota, type RotaOzeti,
} from './rota.ts';
import type { CamGeometri, CamParametre, CamTakim, FrezeIs, MtAyari, MtIs, NcProgram } from './tipler.ts';
import { camMTFinish, camMTInit, camMTProgs, camMTSetupOps } from './torna-freze.ts';
import { camLathe, camLatheProfile, type TornaAgi, type TornaSonucu } from './torna.ts';

// Oto-CAM'in çalışma durumu (prototipin CS'si) ve eylemleri. Plan bellekte durur (prototipte de), kayda yalnız ayarlar girer
// (state.cam). Sahne bu durumu okur; panel camAbone ile yenilenir. Ağır hesap adımları arasında ekran nefes alır (prototipin
// setTimeout zinciri).

export type CamKipi = 'mill' | 'lathe' | 'mt';
export interface CamGeo extends CamGeometri {
  bar: boolean;
  key: string;
  D0?: number;
  L0?: number;
  ID?: number;
  face?: number;
  dispV?: Float64Array;
}
export interface OmurSatiri { id: string; t: Kalem | null; T: number; proc?: 'turn' | 'mill'; cut: number; TR: number | null; parts: number | null; inMag: boolean }
interface RotaAnligi {
  job: FrezeIs | null; lathe: TornaSonucu | null; mt: MtIs | null; progs: Record<string, NcProgram>; tlife: OmurSatiri[] | null;
  G: CamGeo | null; ms: number; key: string; need: string[]; sum: RotaOzeti | null;
}
export type RotaKaydi = RotaAnligi | { err: string };

export interface CamDurumu {
  G: CamGeo | null;
  key: string;
  busy: string | null;
  job: FrezeIs | null;
  lathe: TornaSonucu | null;
  mt: MtIs | null;
  progs: Record<string, NcProgram>;
  tlife: OmurSatiri[] | null;
  need: string[];
  ms: number;
  msg: string;
  routes: Partial<Record<Rota, RotaKaydi>> | null;
  routesKey: string;
  cmpAt: Rota | null;
  // Sahne planı yeniden kursun (prototipte camSceneBase / camScenePaths / camFit çağrıları).
  sahne: number;
  yollar: number;
  sigdir: number;
}

export const CS: CamDurumu = {
  G: null, key: '', busy: null, job: null, lathe: null, mt: null, progs: {}, tlife: null, need: [], ms: 0, msg: '',
  routes: null, routesKey: '', cmpAt: null, sahne: 0, yollar: 0, sigdir: 0,
};

let surum = 0;
const dinleyiciler = new Set<() => void>();
export function camDegisti(): void { surum += 1; for (const d of dinleyiciler) d(); }
export function camAbone(d: () => void): () => void { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; }
export function camSurumu(): number { return surum; }

const bekle = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });
const hataMetni = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function sahneKur(): void { CS.sahne += 1; CS.yollar += 1; }
export function yollariKur(): void { CS.yollar += 1; }
export function sigdir(): void { CS.sigdir += 1; }
function mesgul(t: string | null): void { CS.busy = t ? (CS.cmpAt ? 'Rota ' + CS.cmpAt.toUpperCase() + ' · ' : '') + t : null; camDegisti(); }
function planSil(): void { CS.job = null; CS.lathe = null; CS.mt = null; }

// Ham Malzeme sonucunun rota hesabına giden kısmı (prototipte S.geo, S.alt, S.axKey doğrudan okunur).
export function hamSonucu(): HamSonucu | null {
  return S.P ? { geo: S.geo, alt: S.alt as unknown as HamSonucu['alt'], axKey: S.axKey ?? '', P: S.P } : null;
}
const rho = (): number => material().rho || 7.85;
export function rota(): Rota | '' { return camRoute(hamSonucu(), rho(), allMachines()); }
export function rotaListeleri(): ReturnType<typeof rtLists> { return rtLists(hamSonucu(), rho(), allMachines()); }
export function rotaAnahtari(): string { return rtKey(hamSonucu(), material().id); }
export function rotaUygula(r: Rota | ''): void { camApplyRoute(r, hamSonucu(), rho(), allMachines()); }

export function camPrm(): CamParametre {
  const p = camKaydi().prm;
  return Object.assign({}, CAM_DEF, p, { tap: (p.tap as Record<string, boolean> | undefined) || {} }) as CamParametre;
}
export function camDialect(): string { return camKaydi().dialect || (machine().ctrl === 'heid' ? 'heid' : 'iso'); }
export function camMode(): CamKipi {
  const rt = rota();
  if (rt) return rt === 'c' ? 'mill' : 'mt';
  const m = machine(), bar = !!S.res && S.res.type === 'bar';
  if (bar) return 'mt';
  return m.type === 'lathe' || (m.type === 'millturn' && bar) ? 'lathe' : 'mill';
}
export function parcaHazir(): boolean { return !!(S.P && S.res && S.res.ok); }

/* ---------- parça → CAM koordinatı ---------- */
export function camGeom(): CamGeo | null {
  if (!S.P || !S.I || !S.res || !S.res.ok) return null;
  const rt = rota(), r = rt === 'c' ? S.alt!.block : rt ? S.alt!.bar : S.res, e = new Matrix4().makeRotationFromQuaternion(S.q).elements;
  const P = S.P, n = P.length / 3, V = new Float64Array(n * 3), c = r.ctr, key = S.name + '|' + rt + '|' + r.label + '|' + S.q.toArray().join(',');
  if (r.type === 'bar') {
    const ai = r.ai!, ui = (ai + 1) % 3, vi = (ai + 2) % 3;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3]!, y = P[i * 3 + 1]!, z = P[i * 3 + 2]!, w = [e[0]! * x + e[4]! * y + e[8]! * z, e[1]! * x + e[5]! * y + e[9]! * z, e[2]! * x + e[6]! * y + e[10]! * z];
      V[i * 3] = w[ui]! - c[ui]!; V[i * 3 + 1] = w[vi]! - c[vi]!; V[i * 3 + 2] = w[ai]! - c[ai]!;
    }
    return { bar: true, V, T: S.I, D0: r.D!, L0: r.L!, ID: r.ID || 0, face: num(state.stock.face, 2), key, stock: { Lx: 0, Ly: 0, Lz: 0 } };
  }
  const sz = r.S!, o = [c[0]! - sz[0]! / 2, c[1]! - sz[1]! / 2, c[2]! + sz[2]! / 2];
  for (let j = 0; j < n; j++) {
    const x = P[j * 3]!, y = P[j * 3 + 1]!, z = P[j * 3 + 2]!;
    V[j * 3] = e[0]! * x + e[4]! * y + e[8]! * z - o[0]!; V[j * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z - o[1]!; V[j * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z - o[2]!;
  }
  return { bar: false, V, T: S.I, stock: { Lx: sz[0]!, Ly: sz[1]!, Lz: sz[2]! }, key };
}

/* ---------- çalıştırma ---------- */
function camTmap(): Record<string, number> {
  const arr = tools(), tm: Record<string, number> = {}, free: number[] = [], need: string[] = [], ids: string[] = [];
  arr.forEach((id, i) => { if (id === 'empty') free.push(i); });
  if (CS.job) CS.job.res.forEach((r) => { r.ops.forEach((o) => { if (ids.indexOf(o.tool.id) < 0) ids.push(o.tool.id); }); });
  ids.forEach((id) => { const i = arr.indexOf(id); if (i >= 0) tm[id] = i + 1; else need.push(id); });
  need.forEach((id) => { const i = free.shift(); tm[id] = i != null ? i + 1 : 90 + Object.keys(tm).length; });
  CS.need = need; return tm;
}
function omur(t: Kalem | null, mat: Parameters<typeof catParams>[1], cut: number): { TR: number | null; parts: number | null } {
  let TR: number | null = null;
  try {
    if (t) { const q = catParams(t, mat); q.rel = num(state.life.trel, 80); const LM = lifeModel(t, mat, q); if (LM.err === undefined) TR = LM.TR; }
  } catch { /* ömür modeli bu takımı tanımıyorsa ömür boş kalır */ }
  return { TR, parts: TR && cut > 0 ? Math.floor(TR / cut) : null };
}
export function camPostAll(): void {
  const J = CS.job; if (!J) return; const d = camDialect(); CS.progs = {}; J.tmap = camTmap();
  J.setups.forEach((_s, i) => { const p: NcProgram = camPost(J, i, d, J.mach); p.time = camTime(p.text, J.mach, J.prm); CS.progs[i] = p; });
  const inv: Record<string, string> = {}, use: Record<string, number> = {}, tm = J.tmap;
  Object.keys(tm).forEach((id) => { inv[tm[id]!] = id; });
  Object.keys(CS.progs).forEach((k) => {
    const t = CS.progs[k]!.time; if (!t) return;
    Object.keys(t.p.stat.perTool).forEach((T) => { const id = inv[T]; if (id) use[id] = (use[id] || 0) + t.p.stat.perTool[T]!.t; });
  });
  CS.tlife = Object.keys(tm).map((id) => {
    const t = byId(toolLib(J.mach), id), cut = use[id] || 0;
    return { id, t, T: tm[id]!, cut, ...omur(t, J.mat, cut), inMag: CS.need.indexOf(id) < 0 };
  }).sort((a, b) => a.T - b.T);
}
function camMTLife(J: MtIs): void {
  const use: Record<string, number> = {}, info: Record<string, MtIs['rows'][number]> = {};
  J.rows.forEach((r) => { const k = r.proc + ':' + r.tool.id; use[k] = (use[k] || 0) + (r.cut || 0); info[k] = r; });
  CS.tlife = Object.keys(use).map((k) => {
    const r = info[k]!, t = r.tool, cut = use[k]!;
    return { id: t.id, t, T: r.T!, proc: r.proc, cut, ...omur(t, J.c.mat, cut), inMag: true };
  }).sort((a, b) => (a.proc === b.proc ? 0 : a.proc === 'turn' ? -1 : 1) || a.T - b.T);
}

export function camLatheMachs(): Tezgah[] { return allMachines().filter((x) => x.type !== 'mill'); }
export function camMillMachs(): Tezgah[] { return allMachines().filter((x) => x.type === 'mill'); }
export function camMTCfg(): MtAyari {
  const m = machine(), Ls = camLatheMachs(), c = camKaydi(), lathM = m.type !== 'mill' ? m : (byId(Ls, c.mtLathe) || Ls[0]!);
  const canSame = lathM.type === 'millturn' || !!lathM.live, pref = c.mtMill || 'same', sep = !canSame || pref !== 'same';
  const Ms = camMillMachs(), millSel = sep ? (byId(Ms, pref) || (m.type === 'mill' ? m : byId(Ms, 'f5a') || Ms[0]!)) : lathM;
  let lathLib = toolLib(lathM).filter((t) => t.kind !== 'empty' && t.kind !== 'probe');
  if (lathM.type !== 'millturn') lathLib = lathLib.concat(allMill().filter((t) => t.kind === 'drill'));
  const millLib = sep ? toolLib(millSel).filter((t) => t.kind !== 'empty') : lathM.type === 'millturn' ? allMill() : D.LIVE;
  const lathMc = Object.assign({}, lathM, { rpm: lathM.spindle || lathM.rpm });
  const millMc = sep ? millSel : Object.assign({}, lathM, { rpm: lathM.type === 'millturn' ? lathM.rpm : (lathM.liveRpm || 6000) });
  return { lathM, lathMc, millSel, millMc, sep, canSame, lathLib, millLib };
}

// Torna parçası arka alından başlıyorsa (iç çap önde) ters çevrilir (prototipteki sezgi).
function tornaAgi(G: CamGeo, mt: boolean): TornaAgi {
  const LL: TornaAgi = { V: G.V, T: G.T, D0: G.D0!, L0: G.L0!, ID: G.ID || 0, face: G.face! }, P0 = camLatheProfile(LL, 1);
  if (P0.prof.length > 4 && P0.prof[P0.prof.length - 1]!.ri > 0.3 && P0.prof[0]!.ri < 0.3) {
    const V2 = new Float64Array(G.V);
    if (mt) for (let i = 0; i < V2.length; i += 3) { V2[i + 1] = -V2[i + 1]!; V2[i + 2] = -V2[i + 2]!; }
    else for (let i = 2; i < V2.length; i += 3) V2[i] = -V2[i]!;
    LL.V = V2;
  }
  return LL;
}

async function camGenerateLathe(G: CamGeo, t0: number): Promise<boolean> {
  const m = machine(), mat = material(), prm = camPrm();
  mesgul('Profil çıkarılıyor…');
  await bekle(30);
  try {
    const LL = tornaAgi(G, false);
    let zmx = -1e9; for (let q = 2; q < LL.V.length; q += 3) zmx = Math.max(zmx, LL.V[q]!);
    const DV = new Float64Array(LL.V); for (let q = 2; q < DV.length; q += 3) DV[q] = DV[q]! - zmx;
    G.dispV = DV; sahneKur();
    const lib = toolLib(m).concat(m.type === 'millturn' ? [] : allMill().filter((t) => t.kind === 'drill')) as CamTakim[];
    const L = camLathe(LL, prm, m, mat, lib);
    L.time = camTime(L.text, m, prm);
    CS.lathe = L;
  } catch (e) { console.error(e); CS.msg = '⚠ ' + hataMetni(e); }
  CS.busy = null; CS.ms = performance.now() - t0; yollariKur(); camDegisti();
  return !!CS.lathe;
}

async function camGenerateMT(G: CamGeo, t0: number): Promise<boolean> {
  const cfg = camMTCfg(), mat = material(), prm = camPrm();
  const fail = (e: unknown): boolean => { console.error(e); CS.busy = null; CS.msg = '⚠ Hesap hatası: ' + hataMetni(e); camDegisti(); return false; };
  mesgul('Dönel profil çıkarılıyor · torna operasyonları · tornalanmış gövde − parça farkı…');
  await bekle(30);
  let J: MtIs;
  try {
    const LL = tornaAgi(G, true);
    J = camMTInit(LL, { prm, lathM: cfg.lathMc, millM: cfg.millMc, mat, lathLib: cfg.lathLib as CamTakim[], millLib: cfg.millLib as CamTakim[], sep: cfg.sep }) as MtIs;
    J.cfg = cfg; J.part = S.name || ''; J.key = G.key;
  } catch (e) { return fail(e); }
  for (let si = 0; si < J.AS.setups.length; si++) {
    const s = J.AS.setups[si]!;
    mesgul('Frezeleme ' + (si + 1) + ' / ' + J.AS.setups.length + ' · OP' + s.op + ' ' + s.dir.name + ': dilimleme, ofset, takım seçimi…');
    await bekle(20);
    try { camMTSetupOps(J, si); } catch (e) { return fail(e); }
  }
  mesgul('İşlemler sıralanıyor, programlar yazılıyor, süreler hesaplanıyor…');
  await bekle(20);
  try { camMTFinish(J, camDialect()); camMTLife(J); } catch (e) { return fail(e); }
  CS.mt = J; CS.G = Object.assign(J.G, { key: G.key, bar: false }) as unknown as CamGeo; CS.busy = null; CS.ms = performance.now() - t0; camKaydi().selRow = -1;
  sahneKur(); sigdir(); camDegisti();
  return true;
}

// Prototipin camGenerate'i: sonuç CS'ye yazılır; söz başarıyı verir (prototipte CS.done).
let uretiliyor = false;
export function uretimSuruyor(): boolean { return uretiliyor; }
export async function camGenerate(): Promise<boolean> {
  if (uretiliyor) return false;
  uretiliyor = true;
  try { return await camGenerateIc(); } finally { uretiliyor = false; if (CS.busy !== null) { CS.busy = null; camDegisti(); } }
}
async function camGenerateIc(): Promise<boolean> {
  const rt0 = rota(); if (rt0) rotaUygula(rt0);
  CS.msg = '';
  const G = camGeom();
  if (!G) { CS.msg = '⚠ Önce parça yükleyin (Ham Malzeme sayfası ya da örnek parça)'; camDegisti(); return false; }
  CS.key = G.key + '|' + machine().id; CS.G = G; planSil(); CS.progs = {}; CS.tlife = null; sahneKur(); sigdir();
  const t0 = performance.now(), kip = camMode();
  if (kip === 'mt') {
    if (!G.bar) { CS.busy = null; CS.msg = '⚠ Ham malzeme çubuk değil'; camDegisti(); return false; }
    return camGenerateMT(G, t0);
  }
  if (kip === 'lathe') {
    if (!G.bar) { CS.busy = null; CS.msg = '⚠ Torna için Ham Malzeme sayfasında “Yuvarlak çubuk” seçin'; camDegisti(); return false; }
    return camGenerateLathe(G, t0);
  }
  const m = machine(), mat = material(), lib = toolLib(m).filter((t) => t.kind !== 'empty') as CamTakim[], prm = camPrm();
  const job = { prm, mat, mach: m, G, setups: [], res: [], warn: [], part: S.name } as unknown as FrezeIs;
  job.five = /^m_(5ax|5axh|dmf|hmc)$/.test(m.kind) || /5 eksen/.test(m.code || '');
  const fail = (e: unknown): boolean => { console.error(e); CS.busy = null; CS.msg = '⚠ Hesap hatası: ' + hataMetni(e); camDegisti(); return false; };
  try {
    mesgul('Parça voksellere ayrılıyor…'); await bekle(20);
    job.X = camVoxels(G, prm.res);
    mesgul('Erişim analizi: 6 yönden hangi talaş alınabilir…'); await bekle(20);
    job.AS = camChooseSetups(G, job.X, prm, job.five); job.T = camTools(lib);
  } catch (e) { return fail(e); }
  const AS = job.AS, T = job.T;
  for (let si = 0; si < AS.setups.length; si++) {
    const s = AS.setups[si]!;
    mesgul('Bağlama ' + (si + 1) + ' / ' + AS.setups.length + ' · ' + s.dir.name + ': dilimleme, ofset, takım seçimi…');
    await bekle(20);
    try {
      const r = camSetupOps(G, AS, si, s, prm, T, mat, m);
      job.setups.push(s); job.res.push(r); r.warn.forEach((w) => { job.warn.push(s.dir.name + ': ' + w); });
    } catch (e) { return fail(e); }
  }
  CS.job = job; job.tmap = camTmap();
  mesgul('NC programı yazılıyor ve süre hesaplanıyor…');
  await bekle(20);
  camPostAll();
  CS.busy = null; CS.ms = performance.now() - t0; camKaydi().sel = -1; yollariKur(); camDegisti();
  return true;
}

// "Program üret" (prototipin data-ca=run): karşılaştırma yapılmışsa bu rotanın sonucu güncellenir.
export async function uret(): Promise<void> {
  const ok = await camGenerate(), rr = rota();
  if (ok && rr && CS.routes && CS.routesKey === rotaAnahtari()) { CS.routes[rr] = camSnap(); camDegisti(); }
}

/* ---------- rota karşılaştırması ---------- */
function camSnap(): RotaAnligi {
  const o = { job: CS.job, lathe: CS.lathe, mt: CS.mt, progs: CS.progs, tlife: CS.tlife, G: CS.G, ms: CS.ms, key: CS.key, need: CS.need, sum: null } as RotaAnligi;
  o.sum = rtSum(o); return o;
}
export function rotaGoster(r: Rota): void {
  const o = CS.routes && CS.routesKey === rotaAnahtari() ? CS.routes[r] : null; rotaUygula(r);
  if (o && 'sum' in o && o.sum) { CS.job = o.job; CS.lathe = o.lathe; CS.mt = o.mt; CS.progs = o.progs; CS.tlife = o.tlife; CS.G = o.G; CS.ms = o.ms; CS.key = o.key; CS.need = o.need; }
  else { planSil(); CS.progs = {}; CS.tlife = null; CS.G = camGeom(); CS.key = CS.G ? CS.G.key + '|' + machine().id : ''; }
  sahneKur(); sigdir(); camDegisti();
}
export async function rotalariKarsilastir(): Promise<void> {
  if (uretiliyor || !rtGeo(hamSonucu())) return;
  const keep = rota(), Ls = rotaListeleri()!, g = rtGeo(hamSonucu())!, list = (['a', 'b', 'c'] as Rota[]).filter((r) => rtOk(r, Ls, g)), c = camKaydi();
  CS.routes = {}; CS.routesKey = rotaAnahtari();
  (['a', 'b', 'c'] as Rota[]).forEach((r) => { if (list.indexOf(r) < 0) CS.routes![r] = { err: 'sığan tezgâh yok' }; });
  for (const r of list) {
    c.route = r; CS.cmpAt = r;
    const ok = await camGenerate();
    CS.routes[r] = ok ? camSnap() : { err: 'hesap hatası' };
    await bekle(30);
  }
  CS.cmpAt = null; c.route = keep; save(); rotaGoster(keep as Rota);
}
export function rotaSec(r: Rota): void {
  if (r !== rota() || !(CS.job || CS.mt || CS.lathe)) { camKaydi().route = r; save(); rotaGoster(r); }
}
export function rotaTezgahiSec(r: Rota, rol: string, mid: string): void {
  const c = camKaydi(); c.rt = c.rt || {}; c.rt[r] = Object.assign({}, c.rt[r]); c.rt[r]![rol] = mid; c.route = r; save();
  if (CS.routes) delete CS.routes[r];
  CS.routesKey = rotaAnahtari(); rotaGoster(r);
}

/* ---------- parça ---------- */
// Görünüm açılınca (prototipin PAGES.cam.enter): parça ya da tezgâh değiştiyse plan silinir.
export function camGiris(): void {
  const G = camGeom(), key = G ? G.key + '|' + machine().id : '';
  if (key !== CS.key) { CS.key = key; CS.G = G; planSil(); sahneKur(); sigdir(); }
  camDegisti();
}
function parcaSonrasi(): void { CS.busy = null; planSil(); CS.G = camGeom(); sahneKur(); sigdir(); camDegisti(); }
export function ornekYukle(tur: 'govde' | 'mil' | 'mt'): void {
  const bar = tur !== 'govde', metin = tur === 'govde' ? ORNEK_GOVDE : tur === 'mil' ? ORNEK_MIL : ORNEK_TORNA_FREZE;
  state.stock.type = bar ? 'bar' : 'block'; state.stock.axis = 'auto'; save();
  planSil(); mesgul('Örnek STEP okunuyor…'); S.after = parcaSonrasi;
  void stepBaytYukle(new TextEncoder().encode(metin.trim()), tur === 'mt' ? 'ornek_torna_freze.step' : bar ? 'ornek_mil.step' : 'ornek_govde.step')
    .then(() => { if (CS.busy) { CS.busy = null; camDegisti(); } });
}
export function burcYukle(): void {
  const pr = [[16, 0], [30, 0], [30, 10], [24, 10], [24, 80], [16, 80], [16, 0]], g = new LatheGeometry(pr.map((q) => new Vector2(q[0], q[1])), 96);
  const P = new Float32Array(g.attributes['position']?.array ?? []), I = new Uint32Array(g.index?.array ?? []); g.dispose();
  state.stock.type = 'tube'; state.stock.axis = 'auto'; save();
  planSil(); S.after = parcaSonrasi;
  sSetMesh({ P, I, solids: 1 }, 'ornek_burc (Ø60 × 80, iç Ø32)');
}
export function dosyaYukle(f: File): void { S.after = parcaSonrasi; void parcaYukle(f); }

/* ---------- ayarlar ---------- */
export function tezgahSec(id: string): void { state.machine = id; prMachineChanged(); save(); planSil(); yollariKur(); camDegisti(); }
export function malzemeSec(id: string): void { state.material = id; save(); planSil(); yollariKur(); camDegisti(); }
export function dilSec(d: string): void {
  camKaydi().dialect = d; save();
  if (CS.mt) camMTProgs(CS.mt, camDialect()); else camPostAll();
  camDegisti();
}
export function parametreYaz(k: keyof CamParametre, v: number | boolean): void { (camKaydi().prm as Record<string, unknown>)[k] = v; save(); }
export function mtTornaSec(id: string): void { state.machine = id; prMachineChanged(); save(); CS.mt = null; CS.G = camGeom(); sahneKur(); sigdir(); camDegisti(); }
export function mtFrezeSec(v: string): void { camKaydi().mtMill = v; save(); CS.mt = null; CS.G = camGeom(); sahneKur(); sigdir(); camDegisti(); }

// Kılavuz seçimi değişince o bağlama (freze) ya da bütün freze kısmı (torna + freze) yeniden hesaplanır.
export async function kilavuzSec(si: number, anahtarlar: string[], acik: boolean): Promise<void> {
  const P2 = camKaydi().prm, tap = ((P2.tap as Record<string, boolean> | undefined) || {}); P2.tap = tap;
  anahtarlar.forEach((k) => { tap[k] = acik; }); save();
  if (CS.job) {
    const J = CS.job; J.prm = camPrm(); mesgul('Bağlama yeniden hesaplanıyor…'); await bekle(20);
    J.res[si] = camSetupOps(J.G, J.AS!, si, J.setups[si]!, J.prm, J.T!, J.mat, J.mach); J.warn = [];
    J.res.forEach((rr, k) => { rr.warn.forEach((w) => { J.warn.push(J.setups[k]!.dir.name + ': ' + w); }); });
    J.tmap = camTmap(); camPostAll(); CS.busy = null; yollariKur(); camDegisti();
  } else if (CS.mt) {
    const J = CS.mt; J.prm.tap = Object.assign({}, tap); J.c.prm = Object.assign({}, J.c.prm, { tap: J.prm.tap });
    mesgul('Diş açma ekleniyor, plan yeniden sıralanıyor…'); await bekle(20);
    try {
      J.warn = J.warn.filter((w) => !/^OP\d+ .*: /.test(w) || /torna/.test(w));
      J.res.forEach((_r, k) => { camMTSetupOps(J, k); }); camMTFinish(J, camDialect()); camMTLife(J);
    } catch (e) { console.error(e); }
    CS.busy = null; yollariKur(); camDegisti();
  }
}

/* ---------- çıktılar ---------- */
export function programIndir(p: NcProgram): void { download(p.name, p.text, 'text/plain'); }
export function hepsiniIndir(L: NcProgram[]): void { L.forEach((p, n) => { setTimeout(() => { programIndir(p); }, n * 400); }); }
function csv(ad: string, rows: (string | number)[][]): void {
  download(ad, '﻿' + rows.map((r) => r.map((v) => String(v).replace(/;/g, ',')).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
export function takimListesi(): void {
  const J = CS.job; if (!J || !J.tmap) return; const rows: (string | number)[][] = [['T', 'Takım', 'Kod', 'Ø', 'Kullanıldığı işlemler']];
  Object.keys(J.tmap).forEach((id) => {
    const t = byId(toolLib(J.mach), id), ops: string[] = [];
    J.res.forEach((r, si) => { r.ops.forEach((o) => { if (o.tool.id === id) ops.push('OP' + ((si + 1) * 10) + ' ' + o.name); }); });
    rows.push([J.tmap![id]!, t ? t.name : id, t ? t.code || '' : '', t ? t.d ?? '' : '', ops.join(' / ')]);
  });
  download('Takim_listesi.csv', '﻿' + rows.map((r) => r.join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
export function islemKarti(): void {
  const J = CS.mt; if (!J) return; let n = 0, rows: (string | number)[][] = [['Sıra', 'OP', 'İşlem türü', 'İşlem', 'Yön', 'T', 'Takım', 'Kod', 'Süre (dk)']];
  J.rows.forEach((r) => {
    rows.push([++n, 'OP' + r.op, r.proc === 'turn' ? 'Torna' : 'Freze', r.name, r.proc === 'turn' ? (r.op === 20 ? 'Arka' : 'Ön') : (r.axial ? r.setup!.dir.name : 'C' + r.C), r.T!, r.tool.name, r.tool.code || '', fmtN(r.time!, 2)]);
  });
  rows.push(['', '', '', 'ÇEVRİM (parça başı)', '', '', '', '', fmtN(J.total!, 2)]);
  rows = rows.concat(camSetupCSV(camSetupMT(J)));
  csv('Islem_karti.csv', rows);
}
// Eksik takımlar magazinin boş ceplerine konur (prototipin data-ca=mag).
export function magazineYerlestir(): void {
  const J = CS.job; if (!J || !J.tmap) return; const arr = tools();
  CS.need.forEach((id) => { const T = J.tmap![id]; if (T && T <= arr.length && arr[T - 1] === 'empty') arr[T - 1] = id; });
  prToolsChanged(); camPostAll(); camDegisti();
}

/* ---------- başka görünüme gönderim ---------- */
// Simülasyona: takım eşleşmesi programdaki numarayla; tornada X çap (×101 eşleşmesi prototipteki gibi).
export function simulasyonaGonder(p: NcProgram, si: number): void {
  const ov: GTakimEslesmesi = {}, tm = CS.job ? CS.job.tmap || {} : CS.lathe ? CS.lathe.tn : {};
  Object.keys(tm).forEach((id) => { ov[tm[id]!] = { id }; if (CS.lathe && !CS.job) ov[tm[id]! * 101] = { id }; });
  const ust = !!CS.job && si === 0 && CS.job.setups[0]!.dir.k === '+Z';
  gkodaGonder(p.text, p.name, { takimlar: ov, opt: { stockSrc: ust ? 'ham' : 'blk', hamOrigin: 'tlf', lathe: camMode() === 'lathe' }, adDegisinceYukle: false });
}
export function mtSimulasyonaGonder(p: NcProgram): void {
  const J = CS.mt; if (!J) return; const tm = (p.kind === 'lathe' ? J.ltmap : J.tmap) || {}, ov: GTakimEslesmesi = {};
  Object.keys(tm).forEach((id) => { ov[tm[id]!] = { id }; if (p.kind === 'lathe') ov[tm[id]! * 101] = { id }; });
  if (p.kind === 'lathe') { const mL = J.cfg.lathM; if (machine().id !== mL.id) { state.machine = mL.id; prMachineChanged(); } }
  gkodaGonder(p.text, p.name, { takimlar: ov, opt: { lathe: p.kind === 'lathe', stockSrc: p.kind === 'lathe' ? 'ham' : 'blk', hamOrigin: 'tlf' }, adDegisinceYukle: false });
}
export function hazirligaAktar(p: NcProgram): void { hazirligaGonder(p.text, p.name); }

/* ---------- süre kalibrasyonu ---------- */
export function hamSure(): number {
  if (CS.mt) return CS.mt.total!;
  if (CS.lathe) return CS.lathe.time ? CS.lathe.time.total : 0;
  return Object.keys(CS.progs).reduce((a, k) => a + (CS.progs[k]!.time ? CS.progs[k]!.time!.total : 0), 0);
}
export function kalibreEt(gercek: number): void {
  const raw = hamSure(); if (!(gercek > 0 && raw > 0)) return;
  const c = camKaydi(), mid = machine().id, k = (c.cal[mid] as { f: number; n: number } | undefined) || { f: 1, n: 0 }, f1 = gercek / raw;
  k.f = (k.f * k.n + f1) / (k.n + 1); k.n++; c.cal[mid] = k; save(); camDegisti();
}
export function kalibrasyonuSifirla(): void { delete camKaydi().cal[machine().id]; save(); camDegisti(); }
export { camCal };

// Parti adedi Oto-CAM ve Hazırlık'ta aynıdır (prototipte PS().qty).
export function partiYaz(q: number): void { const c = camKaydi(); c.qty = q; try { PS().qty = q; } catch { /* hazırlık kaydı yoksa yalnız Oto-CAM'de */ } save(); }

/* ---------- görünürlük ---------- */
// Yol görünürlüğü kayıtta durur (prototipte state.cam.vis / sel / selRow); sahne yalnız yolları yeniden kurar.
export function islemGorunur(k: string, acik: boolean): void { camKaydi().vis[k] = acik; save(); yollariKur(); camDegisti(); }
export function baglamaGoster(i: number): void { camKaydi().sel = i; save(); yollariKur(); camDegisti(); }
export function satirSec(k: number): void { const c = camKaydi(); c.selRow = c.selRow === k ? -1 : k; save(); yollariKur(); camDegisti(); }
export function mtSatirEtiketi(r: { proc: string; axial?: boolean; setup?: { dir: { back?: boolean } }; C?: number }): string {
  return r.proc === 'turn' ? 'TORNA' : r.axial ? (r.setup?.dir.back ? 'FREZE · ARKA' : 'FREZE · ÖN') : 'FREZE · C' + String(r.C) + '°';
}
