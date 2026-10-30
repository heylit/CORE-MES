import { ExtrudeGeometry, LatheGeometry, Path as YolSekli, Shape, Vector2, type BufferGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { clamp, fmtN, num, upTR } from '../bicim.ts';
import { durumKur, state } from '../depo.ts';
import { gParse } from '../hesap/gkod.ts';
import { PS } from '../hesap/hazirlik.ts';
import { cutData } from '../hesap/kesme.ts';
import { CLP } from '../hesap/kesit.ts';
import { matBeh, mbAp, mbSo } from '../hesap/malzeme-davranisi.ts';
import { camCaps } from '../hesap/sinirlar.ts';
import { toolsOf } from '../hesap/omur.ts';
import { allMachines, allMaterials, machine, material, toolLib } from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import type { Tezgah } from '../veri/tipler.ts';
import * as AY from './ayar-suresi.ts';
import * as CK from './cekirdek.ts';
import * as SIM from './makine-sim.ts';
import * as RT from './rota.ts';
import * as SG from './sigma.ts';
import type { CamGeometri, CamTakim, FrezeIs, MtAyari, MtIs, NcProgram } from './tipler.ts';
import * as TF from './torna-freze.ts';
import * as TR from './torna.ts';

// Tasima prototiptekiyle ayni sonucu vermeli: Oto-CAM'in prototip kodu eski ekranin yukledigi prototipten alinir, ayni girdi ve
// ayni cekirdek islevleriyle kosturulur; NC metinleri, plan, sureler ve simulasyon alani karsilastirilir.
let HTML = '';
function parca(bas: string, son: string): string {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${bas}`);
  const j = HTML.indexOf(son, i);
  if (j < 0) throw new Error(`Prototipte bulunamadı: ${son}`);
  return HTML.slice(i, j);
}
// Ekran baglayicilari ($('#...').addEventListener) hesap degildir; prototip kodundan cikarilir.
function baglayicisiz(kod: string): string {
  const out: string[] = []; let atla = false;
  for (const l of kod.split('\n')) {
    if (atla) { if (l === '  });') atla = false; continue; }
    if (l.startsWith("  $('#")) { if (!l.trimEnd().endsWith('});') && !l.trimEnd().endsWith('}, true);')) atla = true; continue; }
    out.push(l);
  }
  return out.join('\n');
}
type Islevler = Record<string, (...a: never[]) => unknown>;
let P: Islevler = {};
const BOLUM = '  /* =========================================================\n     ';
beforeAll(async () => {
  HTML = await prototipYukle();
  const cekirdek = parca('  var CLP = ClipperLib, CK = 1000;', `${BOLUM}OTO-CAM ARAYÜZÜ`);
  P = new Function('ClipperLib', 'cutData', 'gParse', 'mbSo', 'mbAp', 'fmtN', 'upTR', 'num', 'clamp',
    `${cekirdek}\nreturn { CAM_DEF, camVoxels, camChooseSetups, camTools, camSetupOps, camPost, camTime, camLatheProfile, camLathe, camMTInit, camMTSetupOps, camMTFinish };`,
  )(CLP, cutData, gParse, mbSo, mbAp, fmtN, upTR, num, clamp) as Islevler;
});
beforeEach(() => { durumKur(null, null); });

// Sentetik parcalar: delikli ve cepli blok, kademeli mil, alti koseli bolumu olan mil (torna + freze).
function agi(g: BufferGeometry): { P: Float32Array; I: Uint32Array } {
  const m = mergeVertices(g.index ? g : g.toNonIndexed(), 1e-4);
  return { P: new Float32Array(m.getAttribute('position').array), I: new Uint32Array(m.index!.array) };
}
function blokParca(): { P: Float32Array; I: Uint32Array } {
  const s = new Shape(); s.moveTo(0, 0); s.lineTo(60, 0); s.lineTo(60, 40); s.lineTo(0, 40); s.lineTo(0, 0);
  const d = new YolSekli(); d.absarc(15, 20, 5, 0, Math.PI * 2, true); s.holes.push(d);
  const c = new YolSekli(); c.moveTo(32, 10); c.lineTo(32, 30); c.lineTo(50, 30); c.lineTo(50, 10); c.lineTo(32, 10); s.holes.push(c);
  return agi(new ExtrudeGeometry(s, { depth: 20, bevelEnabled: false, curveSegments: 48 }));
}
function lathe(pr: number[][], seg: number): BufferGeometry { return new LatheGeometry(pr.map((p) => new Vector2(p[0], p[1])), seg); }
function milParca(): { P: Float32Array; I: Uint32Array } { return agi(lathe([[0, 0], [12, 0], [12, 25], [18, 25], [18, 50], [9, 50], [9, 62], [0, 62]], 96)); }
function mtParca(): { P: Float32Array; I: Uint32Array } {
  return agi(mergeGeometries([lathe([[0, 0], [16, 0], [16, 30], [0, 30]], 96), lathe([[0, 30], [16, 30], [16, 55], [0, 55]], 6)])!);
}
function blokG(A: { P: Float32Array; I: Uint32Array }, pay = 2): CamGeometri {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < A.P.length; i++) { mn[i % 3] = Math.min(mn[i % 3]!, A.P[i]!); mx[i % 3] = Math.max(mx[i % 3]!, A.P[i]!); }
  const sz = [0, 1, 2].map((k) => mx[k]! - mn[k]! + 2 * pay), o = [mn[0]! - pay, mn[1]! - pay, mx[2]! + pay], V = new Float64Array(A.P.length);
  for (let j = 0; j < A.P.length / 3; j++) { V[j * 3] = A.P[j * 3]! - o[0]!; V[j * 3 + 1] = A.P[j * 3 + 1]! - o[1]!; V[j * 3 + 2] = A.P[j * 3 + 2]! - o[2]!; }
  return { bar: false, V, T: A.I, stock: { Lx: sz[0]!, Ly: sz[1]!, Lz: sz[2]! } } as unknown as CamGeometri;
}
function cubukG(A: { P: Float32Array; I: Uint32Array }): TR.TornaAgi {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < A.P.length; i++) { mn[i % 3] = Math.min(mn[i % 3]!, A.P[i]!); mx[i % 3] = Math.max(mx[i % 3]!, A.P[i]!); }
  const L = [0, 1, 2].map((k) => mx[k]! - mn[k]!), ai = L.indexOf(Math.max(...L)), ui = (ai + 1) % 3, vi = (ai + 2) % 3, c = [0, 1, 2].map((k) => (mx[k]! + mn[k]!) / 2);
  const V = new Float64Array(A.P.length); let r = 0;
  for (let i = 0; i < A.P.length / 3; i++) { const w = [A.P[i * 3]!, A.P[i * 3 + 1]!, A.P[i * 3 + 2]!]; V[i * 3] = w[ui]! - c[ui]!; V[i * 3 + 1] = w[vi]! - c[vi]!; V[i * 3 + 2] = w[ai]! - c[ai]!; r = Math.max(r, Math.hypot(V[i * 3]!, V[i * 3 + 1]!)); }
  return { V, T: A.I, D0: Math.ceil(2 * r + 2), L0: L[ai]! + 5, ID: 0, face: 2 };
}
const tezgah = (id: string): Tezgah => allMachines().filter((m) => m.id === id)[0]!;
const malzeme = (id: string) => allMaterials().filter((m) => m.id === id)[0]!;
const json = (x: unknown): unknown => JSON.parse(JSON.stringify(x));

function frezeIsi(M: Islevler, G: CamGeometri, mach: Tezgah, matId: string): { job: FrezeIs; progs: Record<string, NcProgram> } {
  const m = M as unknown as typeof CK, mat = malzeme(matId), lib = toolLib(mach).filter((t) => t.kind !== 'empty') as CamTakim[];
  const prm = Object.assign({}, m.CAM_DEF, { res: 60, tap: {} }), five = /^m_(5ax|5axh|dmf|hmc)$/.test(mach.kind) || /5 eksen/.test(mach.code || '');
  const X = m.camVoxels(G, prm.res), AS = m.camChooseSetups(G, X, prm, five), T = m.camTools(lib);
  const job = { prm, mat, mach, G, setups: [], res: [], warn: [], part: 'p', five, X, AS, T } as unknown as FrezeIs;
  AS.setups.forEach((s, i) => { const r = m.camSetupOps(G, AS, i, s, prm, T, mat, mach); job.setups.push(s); job.res.push(r); r.warn.forEach((w) => job.warn.push(s.dir.name + ': ' + w)); });
  const tm: Record<string, number> = {}; let n = 1; job.res.forEach((r) => r.ops.forEach((o) => { if (!tm[o.tool.id]) tm[o.tool.id] = n++; })); job.tmap = tm;
  const progs: Record<string, NcProgram> = {};
  job.setups.forEach((_s, i) => { const p = m.camPost(job, i, i % 2 ? 'iso' : 'heid', mach); progs[i] = { ...p, time: m.camTime(p.text, mach, prm) }; });
  return { job, progs };
}
function mtAyari(lathM: Tezgah, ayri: boolean): MtAyari {
  const canSame = lathM.type === 'millturn' || !!lathM.live, sep = !canSame || ayri, millSel = sep ? tezgah('f5a') : lathM;
  let lathLib = toolLib(lathM).filter((t) => t.kind !== 'empty' && t.kind !== 'probe'); if (lathM.type !== 'millturn') lathLib = lathLib.concat(D.MILL.filter((t) => t.kind === 'drill'));
  const millLib = sep ? toolLib(millSel).filter((t) => t.kind !== 'empty') : lathM.type === 'millturn' ? D.MILL : D.LIVE;
  const lathMc = Object.assign({}, lathM, { rpm: lathM.spindle || lathM.rpm }), millMc = sep ? millSel : Object.assign({}, lathM, { rpm: lathM.type === 'millturn' ? lathM.rpm : (lathM.liveRpm || 6000) });
  return { lathM, lathMc, millSel, millMc, sep, canSame, lathLib, millLib };
}
function mtIsi(M: Islevler, G: TR.TornaAgi, cfg: MtAyari, matId: string): MtIs {
  const m = M as unknown as typeof TF & typeof TR & { CAM_DEF: typeof CK.CAM_DEF };
  const prm = Object.assign({}, m.CAM_DEF, { tap: {}, res: 60 }), LL: TR.TornaAgi = { ...G }, P0 = m.camLatheProfile(LL, 1);
  if (P0.prof.length > 4 && P0.prof[P0.prof.length - 1]!.ri > 0.3 && P0.prof[0]!.ri < 0.3) { const V2 = new Float64Array(G.V); for (let i = 0; i < V2.length; i += 3) { V2[i + 1] = -V2[i + 1]!; V2[i + 2] = -V2[i + 2]!; } LL.V = V2; }
  const J = m.camMTInit(LL, { prm, lathM: cfg.lathMc, millM: cfg.millMc, mat: malzeme(matId), lathLib: cfg.lathLib as CamTakim[], millLib: cfg.millLib as CamTakim[], sep: cfg.sep }) as MtIs; J.part = 'p';
  for (let i = 0; i < J.AS.setups.length; i++) m.camMTSetupOps(J, i);
  m.camMTFinish(J, 'heid'); J.cfg = cfg;
  return J;
}
const YENI = { ...CK, ...TR, ...TF } as unknown as Islevler;

describe('Oto-CAM cekirdegi prototiple ayni', () => {
  it('freze: baglamalar, uyarilar ve NC programlari ayni', () => {
    const G = blokG(blokParca());
    for (const [mid, mat] of [['f5a', 'c45'], ['yim', 'al6061']] as const) {
      const a = frezeIsi(P, G, tezgah(mid), mat), b = frezeIsi(YENI, G, tezgah(mid), mat);
      expect(Object.keys(b.progs).length).toBeGreaterThan(0);
      expect(json({ w: b.job.warn, p: b.progs })).toEqual(json({ w: a.job.warn, p: a.progs }));
    }
  }, 120000);

  it('torna: profil, NC programi ve sure ayni', () => {
    const G = cubukG(milParca());
    for (const [mid, mat] of [['tcy', 'c45'], ['tby', 'ss304'], ['ulathe', 'al6061']] as const) {
      const m = tezgah(mid), lib = toolLib(m).concat(m.type === 'millturn' ? [] : D.MILL.filter((t) => t.kind === 'drill')) as CamTakim[];
      const calis = (M: Islevler) => {
        const X = M as unknown as typeof TR & typeof CK, prm = Object.assign({}, X.CAM_DEF, { tap: {} }), L = X.camLathe(G, prm, m, malzeme(mat), lib);
        return json({ ...L, env: Array.from(L.env), t: X.camTime(L.text, m, prm) });
      };
      const b = calis(YENI) as { lines: string[] };
      expect(b.lines.length).toBeGreaterThan(10);
      expect(b).toEqual(calis(P));
    }
  }, 60000);

  it('torna-freze: islem sirasi, programlar ve sure ayni', () => {
    const G = cubukG(mtParca());
    for (const [mid, ayri] of [['tfm', false], ['tcy', true]] as const) {
      const a = mtIsi(P, G, mtAyari(tezgah(mid), ayri), 'c45'), b = mtIsi(YENI, G, mtAyari(tezgah(mid), ayri), 'c45');
      const oz = (J: MtIs) => json({ warn: J.warn, total: J.total, progs: J.progs, rows: J.rows.map((r) => [r.op, r.proc, r.name, r.tool.id, r.T, r.time, r.cut, r.tcSkip]) });
      expect(b.rows.some((r) => r.proc === 'mill')).toBe(true);
      expect(oz(b)).toEqual(oz(a));
    }
  }, 120000);
});

describe('ayar suresi, sigma, FAI ve rota prototiple ayni', () => {
  let eski: Islevler = {};
  const CS: { progs: Record<string, NcProgram> } = { progs: {} };
  beforeAll(() => {
    const kod = baglayicisiz(parca(`${BOLUM}TEZGÂH AYAR SÜRESİ`, `${BOLUM}MALZEME DAVRANIŞI`));
    eski = new Function('state', 'toolsOf', 'PS', 'material', 'machine', 'allMachines', 'fmtN', 'num', 'clamp', 'camReach', 'CS', 'esc', 'fmtMin', 'matBeh',
      `function camCal() { var c = state.cam.cal[machine().id]; return c && c.f ? c.f : 1; }\n${kod}\nreturn { camSetupMT, camSetupMill, camFitMT, camFitMill, suRangeOf, suWith, suRefRange, suProf, camSetupCSV };`,
    )(new Proxy({}, { get: (_h, k) => (state as unknown as Record<string | symbol, unknown>)[k], set: (_h, k, v) => { (state as unknown as Record<string | symbol, unknown>)[k] = v; return true; } }),
      toolsOf, PS, material, machine, allMachines, fmtN, num, clamp, CK.camReach, CS, (x: string) => x, (x: number) => String(x), matBeh) as Islevler;
  });
  const SENARYO = [{}, { job: 'repeat' }, { job: 'new' }, { meas: 'preset', kit: 'yes' }, { jaw: 'quick', fix: 'zp' }, { op: 'rare' }];
  const sade = (E: AY.AyarToplami): unknown => { const { J: _j, ...r } = E; return json(r); };
  function kur(kayit: Record<string, unknown>): void { durumKur(JSON.stringify(kayit), null); }
  const e = (ad: string) => eski[ad] as (...a: unknown[]) => unknown;

  it('torna-freze isinde hazirlik, aralik, senaryolar, sigma ve FAI ayni', () => {
    const J = mtIsi(YENI, cubukG(mtParca()), mtAyari(tezgah('tfm'), false), 'c45');
    for (const kayit of [{ machine: 'tfm' }, { machine: 'tfm', cam: { sc: { job: 'new', tol: 'tight', kit: 'no', qc: 'qa', faiw: 'run' }, su: { t_swap: 4 }, suV: 2, cal: { tfm: { f: 1.2 } } }, suProf: { tfm: { swap: 2, meas: 'manual' } } }]) {
      kur(kayit);
      const Ja = { ...J }, Jb = { ...J }, f = () => e('camSetupMT')(Ja) as AY.AyarToplami, g = () => AY.camSetupMT(Jb);
      expect(sade(g())).toEqual(sade(f()));
      expect(json(Jb._fai)).toEqual(json((Ja as MtIs)._fai));
      expect(json(AY.camSetupRange(g(), {}))).toEqual(json(e('suRangeOf')(() => { const X = f(); return { els: X.T.concat(X.M), of: X.of }; })));
      for (const o of SENARYO) expect(sade(AY.suWith(o, g))).toEqual(sade(e('suWith')(o, f) as AY.AyarToplami));
      expect(json(SG.camFitMT(Jb))).toEqual(json(e('camFitMT')(Ja)));
      expect(AY.camSetupCSV(g())).toEqual(e('camSetupCSV')(f()));
    }
  }, 120000);

  it('freze isinde hazirlik, aralik, sigma ve FAI ayni', () => {
    const { job, progs } = frezeIsi(YENI, blokG(blokParca()), tezgah('fgk'), 'c45');
    kur({ machine: 'fgk', cam: { sc: { job: 'new', fix: 'zp' }, qty: 3 } });
    CS.progs = progs;
    const Ja = { ...job }, Jb = { ...job }, f = () => e('camSetupMill')(Ja) as AY.AyarToplami, g = () => AY.camSetupMill(Jb, progs);
    expect(sade(g())).toEqual(sade(f()));
    expect(json(Jb._fai)).toEqual(json((Ja as FrezeIs)._fai));
    expect(json(AY.camSetupRange(g(), progs))).toEqual(json(e('suRangeOf')(() => { const X = f(); return { els: X.T.concat(X.M), of: X.of }; })));
    expect(json(SG.camFitMill(Jb))).toEqual(json(e('camFitMill')(Ja)));
  }, 120000);

  it('tezgah profilleri tablosu ayni (tekrar is ve ilk kez)', () => {
    kur({ suProf: { f5a: { kg: 40 }, tcy: { swap: 3.3, meas: 'manual' } }, cam: { sc: { tol: 'gen', op: 'mid' } } });
    for (const m of allMachines()) {
      expect(json(AY.suProf(m))).toEqual(json(e('suProf')(m)));
      for (const job of ['repeat', 'new']) expect(json(AY.suRefRange(m, job))).toEqual(json(e('suRefRange')(m, job)));
    }
  }, 60000);

  it('rota listeleri ve oneri ayni', () => {
    const kod = parca('  var RT_NAME = {', '  function camRoute() {');
    const hamlar = [
      { method: 'turn', D: 40, L: 120, partLen: 115, partD: 38, S: [120, 45, 45], Vs: 240000 },
      { method: 'mt', D: 110, L: 400, partLen: 390, partD: 105, S: [400, 112, 112], Vs: 5e6 },
      { method: 'mill', D: 300, L: 700, partLen: 690, partD: 290, S: [700, 520, 300], Vs: 1.1e8 },
      { method: 'mt', D: 700, L: 2000, partLen: 1990, partD: 690, S: [2000, 700, 700], Vs: 9e8 },
    ];
    hamlar.forEach((h, i) => {
      const H = { P: 1, geo: { method: h.method, ai: 0 }, alt: { bar: { D: h.D, L: h.L, label: 'c' + i, partLen: h.partLen, partD: h.partD }, block: { label: 'b' + i, S: h.S, Vs: h.Vs } }, axKey: 'k' + i } as unknown as RT.HamSonucu;
      const Ms = allMachines();
      const a = new Function('S', 'CS', 'material', 'allMachines', 'camCaps', 'fmtN', 'PI', `${kod}\nvar L = rtLists(); return { L: L, rec: rtRecommend(L) };`)(H, {}, () => ({ rho: 7.85 }), () => Ms, camCaps, fmtN, Math.PI);
      const L = RT.rtLists(H, 7.85, Ms)!;
      expect(json({ L, rec: RT.rtRecommend(L, H.geo!) })).toEqual(json(a));
    });
  });
});

describe('makine simulasyonu prototiple ayni', () => {
  it('alan, cizelge, talas kaldirma, carpisma ve yuzey ayni', () => {
    const J = mtIsi(YENI, cubukG(mtParca()), mtAyari(tezgah('tfm'), false), 'c45');
    class Sahte { [k: string]: unknown; a: unknown[]; constructor(...a: unknown[]) { this.a = a; } add(): void { /* sahne yok */ } setAttribute(k: string, v: Sahte): void { this[k] = v.a[0]; } setIndex(v: Sahte): void { this['index'] = v.a[0]; } }
    const THREE = { Group: Sahte, MeshStandardMaterial: Sahte, BufferGeometry: Sahte, BufferAttribute: Sahte };
    const kod = parca('  var MS = { on: false', "  $('#camPanel').addEventListener('click', function (e) {\n    if (!MS.on)");
    const yer = parca('  function msMachine(J) {', '    csClear(MS.root);').replace('function msMachine(J) {', 'function msYer(J) {');
    const E = new Function('THREE', 'CS', 'envTex', 'clamp', 'gParse', 'camPostOps', 'camToGlobal', 'camReach', 'PI', 'TAU',
      `${kod}\n${yer} return st; }\nreturn { MS, msYer, msField, msBuildTimeline, msReset, msAdvance, msPartSDF, msMeshChunk, msCmpColor };`,
    )(THREE, { scene: { add: () => undefined } }, null, clamp, gParse, CK.camPostOps, CK.camToGlobal, CK.camReach, Math.PI, Math.PI * 2) as Record<string, (...a: unknown[]) => unknown> & { MS: Record<string, unknown> };
    const MS = E.MS, S = SIM.msBaslat(J);
    MS['J'] = J; MS['st'] = E['msYer']!(J); MS['F'] = E['msField']!(J, MS['st']); E['msBuildTimeline']!(J, MS['st']); E['msReset']!();
    expect(json(S.st)).toEqual(json(MS['st']));
    expect(json({ segs: S.segs, cum: S.cum, total: S.total, rowStart: S.rowStart })).toEqual(json({ segs: MS['segs'], cum: MS['cum'], total: MS['total'], rowStart: MS['rowStart'] }));
    const F = MS['F'] as SIM.Alan;
    for (const oran of [0.2, 0.6, 1]) {
      E['msAdvance']!(S.total * oran); SIM.msAdvance(S, S.total * oran);
      expect([S.pos, S.si, S.F.cut, S.stubOn]).toEqual([MS['pos'], MS['si'], F.cut, MS['stubOn']]);
      expect(S.F.f).toEqual(F.f);
      expect(json(S.colls)).toEqual(json(MS['colls']));
    }
    E['msPartSDF']!(); const PSd = SIM.msPartSDF(S.F, J.G);
    expect(PSd).toEqual(MS['PS']);
    MS['cmpN'] = { g: 0, l: 0, ok: 0 }; const sayac = { g: 0, l: 0, ok: 0 };
    for (let q = 0; q < F.CX * F.CY * F.CZ; q += 7) {
      const a = q % F.CX, b = Math.floor(q / F.CX) % F.CY, c = Math.floor(q / (F.CX * F.CY));
      const g1 = E['msMeshChunk']!(F, a, b, c, E['msCmpColor']) as Record<string, unknown> | null, g2 = SIM.msMeshChunk(S.F, a, b, c, (x, y, z) => SIM.msCmpColor(S.F, PSd, sayac, x, y, z));
      expect(g2 ? [g2.P, g2.N, g2.C, g2.I] : null).toEqual(g1 ? [g1['position'], g1['normal'], g1['color'], g1['index']] : null);
    }
    expect(sayac).toEqual(MS['cmpN']);
  }, 180000);
});

describe('saf yardimcilar', () => {
  it('rtSort: siganlar once, sonra uyarisi az olan', () => {
    const m = tezgah('f5a'), L: RT.TezgahUygunlugu[] = [{ m, bad: ['x'], warn: [], u: 0.5 }, { m, bad: [], warn: ['y'], u: 0.5 }, { m, bad: [], warn: [], u: 0.9 }, { m, bad: [], warn: [], u: 0.5 }];
    expect(RT.rtSort(L).map((x) => [x.bad.length, x.warn.length, x.u])).toEqual([[0, 0, 0.5], [0, 0, 0.9], [0, 1, 0.5], [1, 0, 0.5]]);
  });
  it('suEl elle girilen birim sureyi kullanir, bos deger varsayilandir', () => {
    durumKur(JSON.stringify({ cam: { su: { t_prog: 3, t_bar: '' }, suV: 2 } }), null);
    expect(AY.suEl('t_prog', 'Program', 2, 1).min).toBe(6);
    expect(AY.suEl('t_bar', 'Cubuk', 1, 5.5)).toMatchObject({ u: 5.5, own: false });
  });
  it('fmtHM ve fmtHC', () => {
    expect([AY.fmtHM(42.4), AY.fmtHM(125), AY.fmtHC(65)]).toEqual(['42 dk', '2 sa 05 dk', '1:05']);
  });
  it('simulasyon: tornalama dis capi kucultur, malzeme alani azalir', () => {
    const J = mtIsi(YENI, cubukG(milParca()), mtAyari(tezgah('tcy'), false), 'c45'), S = SIM.msBaslat(J);
    const once = S.F.f.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
    SIM.msSeekHesap(S, S.total); expect(S.F.cut).toBeGreaterThan(0);
    expect(S.F.f.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)).toBeLessThan(once);
    SIM.msSeekHesap(S, 0); expect(S.F.f.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)).toBe(once);
  }, 120000);
});
