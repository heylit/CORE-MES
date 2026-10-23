import { clamp, fmtN, lc, num, upTR } from '../bicim.ts';
import { save, state } from '../depo.ts';
import {
  allCons, allGauges, allMachines, allMaterials, bt, byId, cust, dirtyUsage, holderIdFor, invKey, machine, material, stockOf, tkey,
  toolById, toolLib, tools,
} from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import type { IsMalzemesi, Kalem, Tezgah } from '../veri/tipler.ts';
import { S } from '../parca-durumu.ts';
import { gParse, SAMPLE_HEID, SAMPLE_ISO, tStation } from './gkod.ts';
import { coolHint, cutData, type KesmeOnerisi } from './kesme.ts';
import { cycleOf, lifeCard } from './omur.ts';

// Hazırlık görünümünün veri ve kural kısmı (prototip 20650-20915). Adlar, imzalar ve iletiler prototipinkidir: adım onayları ve son
// onay imzası (`prAllSig`) eski ekranla aynı kayda yazılır ve sunucu (kurallar.ts sonOnayAdimlariTamamMi) aynı biçimi bekler.
// Arayüz (kart, şerit, form, yazdırma) P1'dedir.

// ----- öteki hesaplar -----
// G-kod ayrıştırıcısı, takım ömrü ve ham sonucu çekirdek hesaplarıdır; testte yerine sahtesi konabilsin diye bağlantı noktasıyla okunur.
export interface GkodProgrami {
  err?: string;
  name: string;
  tools: (number | string)[];
  warn: unknown[];
  lines: string[];
  heid?: boolean;
  blk?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
  stat?: { perTool: Record<number, { t: number; len: number; S?: number } | undefined>; feedT?: number };
  total?: number;
  [alan: string]: unknown;
}
export interface GkodAraclari {
  gParse: (metin: string, secenek: { dialect: 'auto'; lathe: boolean; rapid: number }) => GkodProgrami;
  tStation: (T: number, m: Tezgah, heid: boolean | undefined) => number;
  SAMPLE_HEID: string;
  SAMPLE_ISO: string;
}
export interface OmurKarti { st: string; parts: number; partsTot: number; spare?: number | null; [alan: string]: unknown }
export interface OmurAraclari {
  cycleOf: (m: Tezgah, arr: string[]) => unknown;
  lifeCard: (m: Tezgah, p: number, t: Kalem, mat: IsMalzemesi, arr: string[], cyc: unknown) => OmurKarti;
}
// Ham Malzeme sonucu (prototipin S.res'i; parca.ts doldurur).
export interface HamSonucu { ok: boolean; type: 'bar' | 'block'; D?: number; L?: number; S?: number[]; ID?: number; tube?: boolean; label?: string; ms?: number; [alan: string]: unknown }

let gkod: GkodAraclari | null = { gParse, tStation, SAMPLE_HEID, SAMPLE_ISO } as unknown as GkodAraclari;
let omur: OmurAraclari | null = { cycleOf, lifeCard } as unknown as OmurAraclari;
let hamSonucu: () => HamSonucu | null = () => S.res as HamSonucu | null;
export function gkodKur(a: GkodAraclari): void { gkod = a; PR.progKey = ''; }
export function omurKur(a: OmurAraclari): void { omur = a; }
export function hamKaynagiKur(f: () => HamSonucu | null): void { hamSonucu = f; }

// Prototipte bu noktalarda öteki görünümlerin bayrakları kalkar (rebuildAll, magDirty, ltDirty, PR.dirty); görünümler buradan dinler.
export type HazirlikDegisimi = 'tezgah' | 'takim' | 'program' | 'sim';
const degisimDinleyicileri = new Set<(neden: HazirlikDegisimi) => void>();
export function hazirlikDegisinceHaberVer(f: (neden: HazirlikDegisimi) => void): () => void {
  degisimDinleyicileri.add(f);
  return () => { degisimDinleyicileri.delete(f); };
}
const haberVer = (neden: HazirlikDegisimi): void => { for (const f of degisimDinleyicileri) f(neden); };

// Deneme (prototipin PRT.part && PRT.done'ı) P1'in deneme sahnesinden gelir.
let prtBitti = false;
export function denemeBitti(b: boolean): void { prtBitti = b; }

// ----- durum -----
export interface HamOlcu { bar?: number; d?: number; l?: number; x?: number; y?: number; z?: number; src: string; [alan: string]: unknown }
export interface HazirlikDurumu {
  done: Record<string, string | undefined>;
  src: string;
  qty: number | string | null;
  stk: HamOlcu | null;
  cat: Record<string, string | undefined>;
  fin: { sig: string; [alan: string]: unknown } | null;
  at: number;
  fixN?: Record<string, number | undefined>;
  [alan: string]: unknown;
}
export const PREP_DEF: HazirlikDurumu = { done: {}, src: '', qty: 10, stk: null, cat: {}, fin: null, at: 0 };
export function PS(): HazirlikDurumu {
  if (!state['prep']) state['prep'] = JSON.parse(JSON.stringify(PREP_DEF)) as HazirlikDurumu;
  const p = state['prep'] as HazirlikDurumu;
  if (!p.done) p.done = {};
  if (!p.cat) p.cat = {};
  if (p.qty == null) p.qty = 10;
  return p;
}

export interface HazirlikAdimi { key: string; g: string; T?: number }
// Prototipin PR'sinin veri kısmı; prStep'in okuduğu magP, q ve upFocus da buradadır (P1 yazar).
export const PR: {
  seq: HazirlikAdimi[]; at: number; prog: GkodProgrami | null; progKey: string;
  magP: number | null; q: Record<string, string | undefined>; upFocus: boolean;
} = { seq: [], at: 0, prog: null, progKey: '', magP: null, q: {}, upFocus: false };

export interface HazirlikGrubu { g: string; t: string; ic: string }
export const PR_GROUPS: readonly HazirlikGrubu[] = [
  { g: 'machine', t: 'Tezgâh', ic: '⚙' }, { g: 'prog', t: 'Program', ic: '▤' }, { g: 'fixture', t: 'Bağlama', ic: '⊓' },
  { g: 'jaw', t: 'Çene', ic: '‖' }, { g: 'material', t: 'Ham malzeme', ic: '▣' }, { g: 'zero', t: 'Sıfır noktası', ic: '⊕' }, { g: 'tools', t: 'Takımlar', ic: '⌀' }, { g: 'cool', t: 'Soğutma', ic: '≋' },
  { g: 'gauges', t: 'Ölçüm', ic: '◫' }, { g: 'cons', t: 'Sarf', ic: '✚' }, { g: 'final', t: 'Kontrol', ic: '✓' }, { g: 'trial', t: 'Deneme', ic: '▶' }];
export const PR_DESC: Record<string, string> = {
  machine: 'İşin yapılacağı tezgâhı seçin. Bağlama, çene, sıfırlama ve takım seçenekleri tezgâha göre gelir.',
  prog: 'Çalışacak NC programını seçin ya da dosyadan yükleyin. Programdaki takım çağrılarından (TOOL CALL / T…M6) takım listesi, BLK FORM satırından ham ölçü çıkarılır.',
  material: 'Ham parçayı bağlayın: malzemeyi seçin, ham ölçüyü doğrulayın. Ağırlık malzeme yoğunluğundan hesaplanır.',
  fixture: 'Parçayı tablaya / aynaya bağlayacak aparat. Depo adedi kütüphaneden gelir.',
  jaw: 'Aparata takılacak çene ya da destek.',
  zero: 'Parça sıfırının nasıl bulunacağı ve hangi preset / iş koordinatına yazılacağı.',
  tools: 'Programdaki her takım için magazin cebini doğrulayın. Ömür ve depodaki yedek, parti adedine göre kontrol edilir.',
  mag: 'Program seçilmedi: magazindeki takımları ömürleriyle birlikte gözden geçirip onaylayın.',
  cool: 'Soğutma şekli. Malzemeye göre öneri gösterilir.',
  gauges: 'Tezgâh başında bulunacak ölçüm aletleri. Kartı tıklayın ya da Boşluk tuşuna basın: ekle / çıkar.',
  cons: 'Sarf malzemeleri. Kartı tıklayın ya da Boşluk tuşuna basın: ekle / çıkar.',
  trial: 'Hazırlanan tezgâhta programı gerçekten çalıştırın: takım ham parçadan talaş kaldırır, kesme süresi takımı aşındırır. Parti boyunca hangi takımın ne zaman değişeceğini ve yedeklerin yetip yetmediğini görün.',
  final: 'Tüm adımların son kontrolü. Kırmızı madde kalmadığında hazırlığı tamamlayın; form yazdırılabilir.',
};
export function prGroup(g: string): HazirlikGrubu {
  for (const x of PR_GROUPS) if (x.g === g) return x;
  return PR_GROUPS[0] as HazirlikGrubu;
}

// ----- program -----
interface GsimMetni { name: string; text: string }
const gsimText = (): GsimMetni | undefined => state['gsimText'] as GsimMetni | undefined;

export function prSrcText(): GsimMetni | null {
  let s = PS().src;
  const g = gsimText();
  if (!s) { s = PS().src = g && g.text ? 'cur' : 'sh'; }
  if (s === 'cur' && g && g.text) return { name: g.name, text: g.text };
  if (s === 'cur') { PS().src = 'sh'; s = 'sh'; }
  if (s === 'sh') return { name: 'ORNEK.H (Heidenhain örnek)', text: gkodAraci().SAMPLE_HEID };
  if (s === 'si') return { name: 'O1001 (ISO örnek)', text: gkodAraci().SAMPLE_ISO };
  return null;
}
function gkodAraci(): GkodAraclari {
  if (gkod === null) throw new Error('G-kod ayrıştırıcısı bağlanmadı.');
  return gkod;
}
export function prProg(): GkodProgrami | null {
  const src = prSrcText(), m = machine();
  if (!src) return null;
  const key = `${src.name}|${String(src.text.length)}|${m.type}`;
  if (PR.progKey === key) return PR.prog;
  let p: GkodProgrami;
  try { p = gkodAraci().gParse(src.text, { dialect: 'auto', lathe: m.type === 'lathe', rapid: 30000 }); p.name = src.name; }
  catch (e) { p = { err: (e as Error).message, name: src.name, tools: [], warn: [], lines: [] }; }
  PR.progKey = key; PR.prog = p;
  return p;
}
export function prProgOk(): boolean { const p = prProg(); return !!(p && !p.err && p.tools.length); }
const numaraMi = (T: number | string): boolean => typeof T === 'number' || /^\d+$/.test(String(T));
export function prTs(): number[] {
  const p = prProg(), m = machine(), out: number[] = [];
  if (p && !p.err) {
    p.tools.forEach((T) => {
      if (!numaraMi(T)) return;
      const stn = gkodAraci().tStation(Number(T), m, p.heid);
      if (!out.includes(stn)) out.push(stn);
    });
  }
  return out;
}
export function prRawTs(stn: number): number[] {
  const p = prProg(), m = machine();
  return p && !p.err ? p.tools.filter((T) => numaraMi(T) && gkodAraci().tStation(Number(T), m, p.heid) === stn).map(Number) : [];
}
export interface TakimSuresi { t: number; len: number; S: number }
export function prPerTool(stn: number): TakimSuresi | null {
  const p = prProg();
  if (!p || p.err) return null;
  let o: TakimSuresi | null = null;
  prRawTs(stn).forEach((T) => {
    const st = (p.stat as NonNullable<GkodProgrami['stat']>).perTool[T];
    if (!st) return;
    if (!o) o = { t: 0, len: 0, S: 0 };
    o.t += st.t; o.len += st.len;
    if (st.S) o.S = o.S || st.S;
  });
  return o;
}
export function prNamedTs(): string[] {
  const p = prProg();
  return p && !p.err ? p.tools.filter((T) => !numaraMi(T)).map(String) : [];
}
export function prToolNote(T: number): string {
  const p = prProg();
  if (!p || p.err || !p.lines) return '';
  const raw = prRawTs(T)[0] || T;
  const re = p.heid ? new RegExp(`TOOL\\s+CALL\\s+0*${String(raw)}\\b`, 'i') : new RegExp(`(^|[^A-Z0-9.])T0*${String(raw)}(\\D|$)`, 'i');
  for (let i = 0; i < p.lines.length; i++) {
    const l = (p.lines[i] ?? '').replace(/^\s*N?\d+\s+/, '');
    if (/^\s*[;(]/.test(l)) continue;
    if (!re.test(l)) continue;
    for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
      const c = (p.lines[j] ?? '').replace(/^\s*N?\d+\s+/, '');
      const mm = c.match(/^\s*;\s*-*\s*(.*?)\s*-*\s*$/) || c.match(/^\s*\((.*)\)\s*$/);
      if (mm && mm[1]) return mm[1].replace(/^-+|-+$/g, '').trim();
    }
    const tail = l.match(/[;(]\s*(.+?)\)?\s*$/);
    return tail ? (tail[1] ?? '') : '';
  }
  return '';
}
export function prExportSim(): void {
  const p = prProg(), m = machine(), arr = tools();
  if (!p || p.err) return;
  const per: Record<number, { t: number; id: string | null; name: string; S: number; F: number }> = {};
  prTs().forEach((T) => {
    const st = prPerTool(T);
    if (!st) return;
    const i = T - 1, id = arr[i], t = i >= 0 && i < arr.length && id !== 'empty' ? toolById(id as string) : null;
    per[T] = { t: st.t, id: t ? t.id : null, name: t ? t.name : `T${String(T)}`, S: st.S, F: st.t > 0 ? st.len / st.t : 0 };
  });
  state.gsim = { name: p.name, machine: m.id, total: p.total, feedT: p.stat?.feedT, perTool: per };
  const src = prSrcText();
  if (src) state['gsimText'] = src.text.length < 600000 ? { name: src.name, text: src.text } : state['gsimText'];
  haberVer('sim');
}

// ----- ham ölçü -----
export function prLathe(): boolean { return tkey(machine()) === 'lathe'; }
export function prStkAuto(): HamOlcu {
  const lathe = prLathe(), p = prProg();
  if (p && !p.err && p.blk) {
    const b = p.blk, sx = Math.abs(b.max.x - b.min.x), sy = Math.abs(b.max.y - b.min.y), sz = Math.abs(b.max.z - b.min.z);
    if (sx > 0 && sy > 0 && sz > 0) return lathe ? { bar: 1, d: Math.max(sx, sy), l: sz, src: 'prog' } : { x: sx, y: sy, z: sz, src: 'prog' };
  }
  const r = hamSonucu();
  if (r && r.ok) {
    if (r.type === 'bar') return lathe ? { bar: 1, d: r.D, l: r.L, src: 'ham' } : { x: r.L, y: r.D, z: r.D, src: 'ham' };
    const S = r.S ?? [];
    return lathe ? { bar: 1, d: Math.max(S[0] ?? Number.NaN, S[1] ?? Number.NaN), l: S[2], src: 'ham' } : { x: S[0], y: S[1], z: S[2], src: 'ham' };
  }
  return lathe ? { bar: 1, d: 50, l: 100, src: 'def' } : { x: 120, y: 80, z: 30, src: 'def' };
}
export function prStk(): HamOlcu { const s = PS().stk, lathe = prLathe(); if (s && !!s.bar === lathe) return s; return prStkAuto(); }
export const STK_SRC: Record<string, string> = { prog: 'programdaki BLK FORM', ham: 'Ham Malzeme sayfası', def: 'varsayılan', man: 'elle girildi' };
// Eksik ölçü prototipte NaN verir (undefined * n); burada da öyle.
const o = (v: number | undefined): number => v ?? Number.NaN;
export function prStkVol(s: HamOlcu): number { return s.bar ? Math.PI * o(s.d) * o(s.d) / 4 * o(s.l) : o(s.x) * o(s.y) * o(s.z); }
const olcu = (v: number | undefined): string => fmtN(v, o(v) % 1 ? 1 : 0);
export function prStkLabel(s: HamOlcu): string {
  return s.bar ? `Ø${olcu(s.d)} × ${olcu(s.l)} mm` : `${[s.x, s.y, s.z].map(olcu).join(' × ')} mm`;
}
export function prStkKg(s: HamOlcu): number { return prStkVol(s) * (material().rho || 7.85) / 1e6; }

// ----- adımlar -----
export function prSeq(): HazirlikAdimi[] {
  const s: HazirlikAdimi[] = [{ key: 'machine', g: 'machine' }, { key: 'prog', g: 'prog' }, { key: 'fixture', g: 'fixture' }, { key: 'jaw', g: 'jaw' }, { key: 'material', g: 'material' }, { key: 'zero', g: 'zero' }];
  const Ts = prTs();
  if (Ts.length) Ts.forEach((T) => { s.push({ key: `T${String(T)}`, g: 'tools', T }); }); else s.push({ key: 'mag', g: 'tools' });
  s.push({ key: 'cool', g: 'cool' }, { key: 'gauges', g: 'gauges' }, { key: 'cons', g: 'cons' }, { key: 'final', g: 'final' }, { key: 'trial', g: 'trial' });
  return s;
}
export function prFixList(): Kalem[] { const m = machine(), tk = tkey(m); return D.FIX[tk].concat(cust('fix', tk)).filter((f) => !f.only || f.only === m.id); }
export function prJawList(): Kalem[] { const tk = tkey(machine()); return D.JAWS[tk].concat(cust('jaw', tk)); }
export function prZeroList(): Kalem[] {
  const zg = machine().type === 'mill' ? 'mill' : 'lathe';
  return D.ZERO[zg].concat(cust('meas', zg).filter((c) => c.kind.startsWith('z_')));
}
export interface AdimSecenegi { id: string; name: string; code?: string; icon?: string; [alan: string]: unknown }
export function prMatItem(mt: IsMalzemesi): AdimSecenegi { return Object.assign({}, mt, { icon: 'mat', code: (mt.code || '') }); }
export const PROG_IT: Record<string, () => AdimSecenegi | null> = {
  p_cur: () => { const g = gsimText(); return g && g.text ? { id: 'p_cur', name: g.name, code: 'Son yüklenen program', icon: 'prog' } : null; },
  p_sh: () => ({ id: 'p_sh', name: 'Örnek Heidenhain', code: 'ORNEK.H · 6 takım · Klartext', icon: 'prog' }),
  p_si: () => ({ id: 'p_si', name: 'Örnek ISO', code: 'O1001 · 3 takım · G-kod', icon: 'prog' }),
  p_up: () => ({ id: 'p_up', name: 'Dosyadan yükle…', code: '.H · .NC · .TAP · .MPF · .TXT', icon: 'up' }),
  p_none: () => ({ id: 'p_none', name: 'Programsız', code: 'Yalnız magazin kontrolü', icon: 'none' }),
};
export function prFirstPk(): number { const arr = tools(); for (let i = 0; i < arr.length; i++) if (arr[i] !== 'empty') return i; return 0; }
export function prPk(st: HazirlikAdimi): number { return st.T ? st.T - 1 : clamp(PR.magP == null ? prFirstPk() : PR.magP, 0, machine().pockets - 1); }
export function prToolMatch(t: Kalem, q: string): boolean {
  if (!q) return true;
  const hay = lc([t.name, t.code, t.tags, t.d ? `ø${String(t.d)} d${String(t.d)}` : ''].join(' '));
  return lc(q).split(/\s+/).every((w) => !w || hay.includes(w.replace(',', '.')) || hay.includes(w));
}
export function prToolOpts(pk: number, mag: boolean): Kalem[] {
  const m = machine(), arr = tools(), cur = arr[pk], ct = cur && cur !== 'empty' ? toolById(cur) : null, ck = `p${String(pk)}`;
  let lib = toolLib(m).filter((t) => t.kind !== 'empty' && (mag || t.kind !== 'probe'));
  let cat = PS().cat[ck];
  if (cat == null) cat = ct && ct.kind !== 'probe' ? (ct.cat || '*') : '*';
  const q = (PR.q[ck] || '').trim();
  if (q) lib = lib.filter((t) => prToolMatch(t, q));
  else if (cat && cat !== '*') { const f = lib.filter((t) => t.cat === cat); if (f.length) lib = f; }
  if (ct && !byId(lib, ct.id) && !q) lib = [ct].concat(lib);
  if (mag) lib = [D.EMPTY].concat(lib);
  return lib;
}
const SUG_KW: readonly [RegExp, readonly string[]][] = [[/ALIN|FACE/, ['facemill', 'facemill45', 'shoulder', 'hfmi']], [/KABA|ROUGH/, ['rougher', 'endmill', 'shoulder']], [/PARMAK|END ?MILL|FREZE/, ['endmill', 'rougher', 'bullnose']], [/K[UÜ]RESEL|BALL/, ['ball', 'taperball']],
  [/PUNTA|CENTER|SPOT|MERKEZ/, ['spot', 'center']], [/MATKAP|DRILL|DEL/, ['drill', 'stepdrill', 'idrill']], [/KILAVUZ|TAP/, ['tap']], [/RAYBA|REAM/, ['reamer']], [/PAH|CHAMF/, ['chamfer', 'backchamfer', 'csink']], [/D[IİI]Ş FREZE|THREAD ?MILL/, ['threadmill']],
  [/BARA|BORING/, ['boring', 'boring2']], [/D[IİI]Ş ?[CÇ]AP|OD/, ['lt_ext']], [/[IİI][CÇ] ?[CÇ]AP|ID\b/, ['lt_bore']], [/KANAL|GROOV/, ['lt_groove', 'lt_igroove', 'lt_facegroove']], [/KESME|PART/, ['lt_part']], [/VIDA|D[IİI]Ş A[CÇ]/, ['lt_thread', 'lt_ithread']], [/U ?MATKAP/, ['lt_udrill']]];
export interface TakimOnerisi { t: Kalem; sc: number; why: string[] }
export function prSuggest(T: number): TakimOnerisi[] {
  const note = upTR(prToolNote(T) || ''), out: TakimOnerisi[] = [];
  if (!note) return out;
  const dm = note.match(/(?:\bD|Ø|⌀)\s*(\d+(?:[.,]\d+)?)/), d = dm ? Number.parseFloat((dm[1] ?? '').replace(',', '.')) : null, th = note.match(/\bM(\d+(?:[.,]\d+)?)/);
  let kinds: string[] = [];
  SUG_KW.forEach((k) => { if (k[0].test(note)) kinds = kinds.concat(k[1]); });
  if (th && !kinds.includes('tap') && /KILAVUZ|TAP/.test(note)) kinds.push('tap');
  const lib = toolLib(machine()).filter((t) => t.kind !== 'empty' && t.kind !== 'probe');
  lib.forEach((t) => {
    let sc = 0;
    const why: string[] = [];
    const ki = kinds.indexOf(t.kind);
    if (ki >= 0) { sc += 4 - Math.min(2, ki * 0.3); why.push('tip'); }
    if (d && t.d) { const df = Math.abs(t.d - d); if (df < 0.051) { sc += 4; why.push(`Ø${fmtN(d, d % 1 ? 1 : 0)}`); } else if (df <= 1) sc += 1; }
    if (th && t.kind === 'tap' && new RegExp(`M${(th[1] ?? '').replace('.', '[.,]')}\\b`, 'i').test(`${t.name} ${String(t.code)}`)) { sc += 4; why.push(`M${th[1] ?? ''}`); }
    if (sc >= 4) out.push({ t, sc, why });
  });
  out.sort((a, b) => b.sc - a.sc);
  return out.slice(0, 4);
}

export type AdimSecimi =
  | { kind: 'single'; opts: AdimSecenegi[]; T?: number; pk?: number; get: () => string | null; set: (id: string) => void }
  | { kind: 'multi'; opts: Kalem[]; list: () => string[] }
  | { kind: 'none'; opts: [] };
// Liste boşsa prototip burada TypeError verir (L0[0].id); aynı kalır.
const ilkId = (L0: readonly Kalem[]): string => (L0[0] as Kalem).id;
export function prStep(st: HazirlikAdimi | null | undefined): AdimSecimi | null {
  const m = machine();
  if (!st) return null;
  switch (st.g) {
    case 'machine': return { kind: 'single', opts: allMachines(), get: () => state.machine, set: (id) => { if (id !== state.machine) { state.machine = id; prMachineChanged(); } } };
    case 'prog': return {
      kind: 'single', opts: ['p_cur', 'p_sh', 'p_si', 'p_up', 'p_none'].map((k) => (PROG_IT[k] as () => AdimSecenegi | null)()).filter((x): x is AdimSecenegi => !!x),
      get: () => { prSrcText(); const s = PS().src; return `p_${s || 'none'}`; },
      set: (id) => {
        if (id === 'p_up') { PR.upFocus = true; return; }
        PR.upFocus = false;
        const s = id.slice(2);
        if (s !== PS().src) { PS().src = s; PR.progKey = ''; haberVer('program'); }
      },
    };
    case 'material': return { kind: 'single', opts: allMaterials().map(prMatItem), get: () => state.material, set: (id) => { state.material = id; } };
    case 'fixture': return { kind: 'single', opts: prFixList(), get: () => { const L0 = prFixList(); if (!byId(L0, bt().fixture)) bt().fixture = ilkId(L0); return bt().fixture; }, set: (id) => { bt().fixture = id; } };
    case 'jaw': return { kind: 'single', opts: prJawList(), get: () => { const L0 = prJawList(); if (!byId(L0, bt().jaw)) bt().jaw = ilkId(L0); return bt().jaw; }, set: (id) => { bt().jaw = id; } };
    case 'zero': return { kind: 'single', opts: prZeroList(), get: () => { const L0 = prZeroList(); if (!byId(L0, bt().zero)) bt().zero = ilkId(L0); return bt().zero; }, set: (id) => { bt().zero = id; } };
    case 'tools': {
      const pk = prPk(st), mag = st.key === 'mag';
      return {
        kind: 'single', T: st.T, pk, opts: pk < m.pockets ? prToolOpts(pk, mag) : [],
        get: () => { const a = tools()[pk]; return a && (mag || a !== 'empty') ? a : null; },
        set: (id) => { if (pk >= m.pockets) return; tools()[pk] = id; prToolsChanged(); },
      };
    }
    case 'cool': return { kind: 'single', opts: D.COOL, get: () => state.coolant, set: (id) => { state.coolant = id; } };
    case 'gauges': return { kind: 'multi', opts: allGauges(), list: () => state.gauges };
    case 'cons': return { kind: 'multi', opts: allCons(), list: () => state.cons };
    case 'final': case 'trial': return { kind: 'none', opts: [] };
    default: return null;
  }
}
// prSig'in varsayılan dalı ve zero dalı seçimi `get()`ten alır; seçimsiz adımda prototip TypeError verir.
const secim = (st: HazirlikAdimi): string | null => (prStep(st) as Extract<AdimSecimi, { kind: 'single' }>).get();
export function prSig(st: HazirlikAdimi): string {
  const m = machine(), b = `${m.id}|`;
  switch (st.g) {
    case 'machine': return m.id;
    case 'prog': { const t = prSrcText(); return `${b}${PS().src}|${t ? `${t.name}:${String(t.text.length)}` : ''}`; }
    case 'material': return `${b}${state.material}|${prStkLabel(prStk())}`;
    case 'zero': return `${b}${String(secim(st))}|${String(state.wcs[m.ctrl])}`;
    case 'tools': {
      if (st.key === 'mag') return b + tools().join(',');
      const s2 = prSrcText();
      return `${b}${s2 ? s2.name : ''}|${String(st.T)}|${tools()[o(st.T) - 1] || ''}`;
    }
    case 'gauges': return b + state.gauges.join(',');
    case 'cons': return b + state.cons.join(',');
    case 'final': return 'final';
    case 'trial': return 'trial';
    default: return `${b}${String(secim(st))}${st.g === 'fixture' ? `|${String(prFixN())}` : ''}`;
  }
}
export function prAllSig(): string { return `${PR.seq.filter((s) => s.g !== 'final' && s.g !== 'trial').map(prSig).join('#')}#${String(PS().qty)}`; }
export function prIsDone(st: HazirlikAdimi): boolean {
  if (st.g === 'trial') return prtBitti;
  if (st.g === 'final') { const f = PS().fin; return !!(f && f.sig === prAllSig()); }
  return PS().done[st.key] === prSig(st);
}
export function prFinalDone(): boolean { const f = PR.seq.filter((x) => x.g === 'final')[0]; return !!(f && prIsDone(f)); }
export function prProgress(): { n: number; d: number; pct: number } {
  let n = 0, d = 0;
  PR.seq.forEach((s) => { if (s.g === 'trial') return; n++; if (prIsDone(s)) d++; });
  return { n, d, pct: n ? d / n : 0 };
}

export function prInfo(m?: Tezgah): Record<string, unknown> { const t = m || machine(); return Object.assign({}, t.info || {}); }
export function prFixCap(m: Tezgah): number { return clamp(Math.round(num(prInfo(m)['fixCap'], 1)), 1, 8); }
export function prFixN(): number {
  const m = machine();
  if (prLathe()) return 1;
  const f = PS().fixN || {};
  return clamp(Math.round(num(f[m.id], 1)), 1, prFixCap(m));
}
export function prMachMain(m: Tezgah): string {
  const I = prInfo(m), b = I['model'] ? [I['marka'] || I['marka0'], I['model']].filter(Boolean).join(' ') : (m.baseName || m.name);
  return (m.no ? `${m.no} · ` : '') + b;
}
export function prMachineChanged(): void { PR.progKey = ''; PS().stk = null; dirtyUsage(); haberVer('tezgah'); }
export function prToolsChanged(): void { dirtyUsage(); haberVer('takim'); save(); }

// ----- takım değerlendirmesi -----
export interface TakimDegerlendirmesi {
  T: number; lvl: 'ok' | 'warn' | 'err'; msgs: string[]; t?: Kalem;
  cutT?: number | null; S?: number | null; F?: number | null; c?: OmurKarti; need?: number;
}
export function prToolEval(T: number): TakimDegerlendirmesi {
  const m = machine(), arr = tools(), qty = Math.max(1, Math.round(num(PS().qty, 1))), r: TakimDegerlendirmesi = { T, lvl: 'ok', msgs: [] };
  if (T > m.pockets) { r.lvl = 'err'; r.msgs.push(`Tezgâhta T${String(T)} cebi yok (${String(m.pockets)} cep)`); return r; }
  const id = arr[T - 1];
  if (!id || id === 'empty') { r.lvl = 'err'; r.msgs.push('Cep boş — takım seçin'); return r; }
  const t = toolById(id);
  r.t = t;
  if (t.kind === 'probe') { r.lvl = 'err'; r.msgs.push('Bu cepte prob var, kesici takım değil'); return r; }
  const st = prPerTool(T);
  r.cutT = st ? st.t : null; r.S = st ? st.S : null; r.F = st && st.t > 0 ? st.len / st.t : null;
  // Prototipte ömür hesabı hata verirse uyarı atlanır (try/catch); ömür bağlanmadıysa da atlanır.
  try {
    if (omur !== null) {
      const mat = material(), c = omur.lifeCard(m, T - 1, t, mat, arr, omur.cycleOf(m, arr));
      r.c = c;
      if (c.st !== 'na') {
        if (c.st === 'over') { r.lvl = 'err'; r.msgs.push('Ömrü dolmuş — işe başlamadan değiştirin'); }
        if (c.parts < qty) {
          const need = Math.ceil((qty - c.parts) / Math.max(1, c.partsTot));
          r.need = need;
          if (c.spare == null) { if (r.lvl === 'ok') r.lvl = 'warn'; r.msgs.push(`Ömrü ≈${fmtN(c.parts)} parçaya yeter; ${String(qty)} adet için ${String(need)} yedek gerekir (stok girilmemiş)`); }
          else if (c.spare >= need) { if (r.lvl === 'ok') r.lvl = 'warn'; r.msgs.push(`Parti ortasında ${String(need)} kez değişim · depoda ${String(c.spare)} yedek var`); }
          else { r.lvl = 'err'; r.msgs.push(`Yedek yetersiz: ${String(need)} gerekli, depoda ${String(c.spare)}`); }
        } else r.msgs.push(`Ömür yeterli: ≈${fmtN(c.parts)} parça kaldı`);
      }
    }
  } catch { /* prototipteki gibi: ömür kartı kurulamazsa değerlendirme ömürsüz sürer */ }
  const cd: KesmeOnerisi | null = cutData(t, material(), m);
  if (cd && cd.warn) { if (r.lvl === 'ok') r.lvl = 'warn'; r.msgs.push(cd.warn); }
  const ss = stockOf(invKey(t));
  if (ss.st === 'short') { if (r.lvl === 'ok') r.lvl = 'warn'; r.msgs.push('Depo kaydı eksik görünüyor'); }
  const hk = holderIdFor(t, m);
  if (hk && stockOf(hk).st === 'short') { if (r.lvl === 'ok') r.lvl = 'warn'; r.msgs.push('Tutucu stoğu yetersiz'); }
  return r;
}

// ----- son kontrol -----
export function prPendOk(): HazirlikAdimi[] {
  return PR.seq.filter((s) => {
    if (s.g === 'final' || s.g === 'trial' || prIsDone(s)) return false;
    if (s.T) return !!prToolEval(s.T).t;
    if (s.key === 'prog') { const p = prProg(); return !(p && p.err); }
    return true;
  });
}
// go: adımın sıradaki yeri; adım sırada yoksa prototipteki gibi tanımsız.
export interface KontrolMaddesi { lvl: 'ok' | 'warn' | 'err'; txt: string; go: number | null | undefined }
export function prChecks(): KontrolMaddesi[] {
  const out: KontrolMaddesi[] = [], m = machine(), p = prProg(), seqIdx: Record<string, number> = {};
  PR.seq.forEach((s, i) => { seqIdx[s.key] = i; });
  const add = (lvl: KontrolMaddesi['lvl'], txt: string, key: string | null): void => { out.push({ lvl, txt, go: key != null ? seqIdx[key] : null }); };
  const pend = PR.seq.filter((s) => s.g !== 'final' && s.g !== 'trial' && !prIsDone(s));
  if (pend.length) {
    add('err', `${String(pend.length)} adım seçili ama Enter ile onaylanmadı: ${pend.slice(0, 6).map((s) => {
      const S0 = prStep(s);
      return (s.T ? `T${String(s.T)}` : prGroup(s.g).t) + (S0 && S0.kind === 'multi' ? ` (${String(S0.list().length)} seçili)` : '');
    }).join(', ')}${pend.length > 6 ? '…' : ''}`, (pend[0] as HazirlikAdimi).key);
  } else add('ok', 'Tüm adımlar onaylandı', null);
  if (p && p.err) add('err', `Program okunamadı: ${p.err}`, 'prog');
  else if (p) {
    if (p.heid && m.ctrl !== 'heid') add('err', `Heidenhain programı seçildi ama ${m.name} ISO kontrollü`, 'prog');
    else if (!p.heid && m.ctrl === 'heid') add('warn', 'ISO program Heidenhain tezgâhta: kontrolde ISO modunun açık olduğundan emin olun', 'prog');
    else add('ok', 'Program dili tezgâh kontrolüyle uyumlu', null);
    const nm = prNamedTs();
    if (nm.length) add('warn', `İsimle çağrılan takımlar (${nm.join(', ')}) magazinde elle doğrulanmalı`, 'prog');
    if (p.blk && !prLathe()) {
      const s = prStk(), b = p.blk, need = [Math.abs(b.max.x - b.min.x), Math.abs(b.max.y - b.min.y), Math.abs(b.max.z - b.min.z)] as const;
      if (o(s.x) + 0.01 < need[0] || o(s.y) + 0.01 < need[1] || o(s.z) + 0.01 < need[2]) {
        add('err', `Ham ölçü (${prStkLabel(s)}) programdaki bloktan küçük (${need.map((v) => fmtN(v, v % 1 ? 1 : 0)).join(' × ')})`, 'material');
      }
    }
  } else add('warn', 'Program seçilmedi — takım listesi programla doğrulanmadı', 'prog');
  let bad = 0, wn = 0;
  prTs().forEach((T) => {
    const e = prToolEval(T);
    if (e.lvl === 'err') { bad++; add('err', `T${String(T)}: ${e.msgs.join(' · ')}`, `T${String(T)}`); }
    else if (e.lvl === 'warn') { wn++; add('warn', `T${String(T)}: ${e.msgs.filter((x) => !x.includes('Ömür yeterli')).join(' · ')}`, `T${String(T)}`); }
  });
  if (prTs().length && !bad && !wn) add('ok', `${String(prTs().length)} takım hazır, ömürler ${String(PS().qty)} adet için yeterli`, null);
  ([['fixture', prFixList(), bt().fixture], ['jaw', prJawList(), bt().jaw]] as const).forEach(([key, list, sec]) => {
    const it = byId(list, sec);
    if (!it) return;
    if (stockOf(invKey(it)).st === 'short') add('warn', `${it.name}: depo adedi yetersiz`, key);
  });
  const hint = coolHint(material());
  if (hint && hint !== state.coolant) { const hc = byId(D.COOL, hint); add('warn', `Soğutma: ${material().name} için önerilen ${hc ? hc.name : hint}`, 'cool'); }
  if (!state.gauges.length) add('warn', 'Ölçüm aleti seçilmedi', 'gauges');
  return out;
}

// Oto-CAM'in "Hazırlığa gönder"i (prototipin camToPrep'i): program Hazırlık'ın kaynağı olur. Görünüm geçişi ve program adımına
// gidiş çağıranındır: `git('prep', { adim: 'prog' })`; Hazırlık açılışta gecisSecenegiAl('prep') ile adımı alır (prGo).
export function hazirligaGonder(metin: string, ad: string): void {
  state['gsimText'] = { name: ad, text: metin };
  PS().src = 'cur';
  PR.progKey = '';
  save();
  haberVer('program');
}
