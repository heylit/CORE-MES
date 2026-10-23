import { state } from '../depo.ts';
import { LIFE_DEF, type OmurAyari } from '../durum.ts';
import { clamp, fmtN, num } from '../bicim.ts';
import {
  allCons, allGauges, allLathe, allMachines, allMaterials, allMill, byId, cust, dirtyUsage, invKey, machine, material, stockOf, toolById,
  toolLib, tools, usage, type KalemStokOzeti, type Kullanim,
} from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import { isLatheTool } from '../veri/takim-turu.ts';
import type { IsMalzemesi, Kalem, Tezgah } from '../veri/tipler.ts';
import { matBeh } from './malzeme-davranisi.ts';

// Varsayılan ayar ve açılış birleşimi (life, wear, wearLog) durum.ts'tedir: görünüm açılmadan da geçerlidir.
export { LIFE_DEF, type OmurAyari };

// Prototipin TAKIM ÖMRÜ bölümünün modeli ve veri kısmı (magazin takibi, tek takım analizi, depo kartları). Görünüm, 3B
// tambur ve örnek veri yükleme (seedDemo, 210.1: kendiliğinden yazılmaz) Takım Ömrü görünümündedir.

// Cepteki takımın aşınma kaydı; `lf` elle düzeltilmiş ömür çarpanıdır.
export interface AsinmaKaydi { id: string; used: number; parts: number; since: number | null; lf?: number; [alan: string]: unknown }
// G-Kod simülasyonunun tezgâha bağlı özeti (perTool T numarasıyla: cep + 1).
export interface ProgramTakimi { S: number; F: number; t: number; [alan: string]: unknown }
export interface GkodOzeti { machine: string; total: number; perTool?: Record<string, ProgramTakimi | undefined>; [alan: string]: unknown }
interface ElleSure { id: string; tp: number }

// Durum alanları çekirdekte geniş tiplidir; bu bölümün alanları burada daralır.
const omurAyari = (): OmurAyari => state.life;
const asinma = (): Record<string, Record<string, AsinmaKaydi | undefined> | undefined> => state['wear'] as Record<string, Record<string, AsinmaKaydi | undefined> | undefined>;
const gsim = (): GkodOzeti | null => state.gsim as GkodOzeti | null;

export const COOLF: Record<string, Record<string, number>> = {
  bor5: { P: 1, M: 1, K: 1, N: 1, S: 1, H: 0.9 }, bor8: { P: 1.02, M: 1.05, K: 1, N: 1.05, S: 1.02, H: 0.9 },
  oil: { P: 1.1, M: 1.15, K: 1, N: 1.05, S: 1.2, H: 0.95 }, mql: { P: 0.9, M: 0.8, K: 1.05, N: 1.1, S: 0.7, H: 1.05 },
  air: { P: 0.75, M: 0.6, K: 1.05, N: 0.6, S: 0.45, H: 1.15 }, tsc: { P: 1.2, M: 1.25, K: 1.1, N: 1.15, S: 1.45, H: 1.0 },
};
export const DRILLK = ['drill', 'spot', 'reamer', 'tap', 'lt_udrill', 'boring', 'center', 'csink', 'stepdrill', 'idrill', 'boring2'];

// ---------- model ----------
export interface TakimAilesi { tref: number; beta: number; n: number; name: string }
export function famOf(t: Kalem): TakimAilesi {
  const k = t.kind;
  if (t.tm === 'H') return k === 'tap' ? { tref: 60, beta: 2.4, n: 0.14, name: 'HSS kılavuz' } : { tref: 45, beta: 2.4, n: 0.14, name: 'HSS takım' };
  if (isLatheTool(t) && k !== 'lt_udrill') return { tref: 15, beta: 3.5, n: 0.25, name: 'Torna kesici ucu' };
  if (k === 'lt_udrill' || k === 'idrill') return { tref: 25, beta: 3.5, n: 0.25, name: 'U-matkap ucu' };
  if (['facemill', 'facemill45', 'shoulder', 'hfmi', 'roundins', 'disc', 'longedge'].indexOf(k) >= 0) return { tref: 25, beta: 3.5, n: 0.25, name: 'Uçlu freze' };
  if (k === 'boring' || k === 'boring2') return { tref: 40, beta: 3.5, n: 0.25, name: 'Baralama ucu' };
  if (['drill', 'spot', 'center', 'csink', 'stepdrill'].indexOf(k) >= 0) return { tref: 45, beta: 3, n: 0.25, name: 'Karbür matkap' };
  if (k === 'reamer') return { tref: 60, beta: 3, n: 0.25, name: 'Karbür rayba' };
  return { tref: 35, beta: 3, n: 0.25, name: 'Karbür freze' };
}
export interface IslemTuru { turning: boolean; drilling: boolean; milling: boolean }
export function lifeKind(t: Kalem): IslemTuru {
  const turning = isLatheTool(t) && !t.d, drilling = DRILLK.indexOf(t.kind) >= 0;
  return { turning, drilling, milling: !turning && !drilling };
}
// Takım tipine göre önerilen (optimum) kavrama [ap, ae]: pozitif = × Ø, negatif = mm.
export const LIFE_ENG: Record<string, [number, number]> = {
  facemill: [-2, 0.7], facemill45: [-2.5, 0.7], hfmi: [0.08, 0.7], shoulder: [0.25, 0.5], roundins: [0.2, 0.6], endmill: [1, 0.3],
  rougher: [1, 0.5], longneck: [0.2, 0.15], bullnose: [0.5, 0.3], ball: [0.1, 0.1], taperball: [0.1, 0.1], lollipop: [0.1, 0.1],
  barrel: [0.1, 0.1], chamfer: [-0.5, -0.5], backchamfer: [-0.5, -0.5], engrave: [-0.2, -0.2], threadmill: [1.5, 0.1], tslot: [0.15, 0.3],
  keyseat: [0.15, 0.3], disc: [0.15, 0.3],
};
// Karşılaştırmalar prototipteki gibi: alan yoksa (undefined < n) yanlış sayılır.
const ilerleme = (t: Kalem): number => t.cut?.fr ?? Number.NaN;

export function lifeOpt(t: Kalem): { vb: number; ld: number; uses: number } {
  const k = t.kind;
  const fin = /ball|taperball|lollipop|barrel|engrave|reamer|chamfer|threadmill|lt_thread|lt_ithread|boring/.test(k) || (k === 'lt_ext' && !!t.cut && ilerleme(t) < 0.2) || /finiş/i.test(t.name);
  const rough = /rougher|facemill|hfmi|roundins|idrill|lt_udrill/.test(k) || (k === 'lt_ext' && !!t.cut && ilerleme(t) >= 0.2) || /kaba/i.test(t.name);
  return {
    vb: fin ? 0.2 : rough ? 0.4 : 0.3,
    ld: /5×D|5xD/i.test(t.name) ? 5 : k === 'spot' || k === 'center' || k === 'csink' ? 1 : k === 'tap' ? 2 : 3,
    uses: t.tm === 'I' ? 2 : 3,
  };
}
export interface OmurReferansi { vref: number; fref: number; apRef: number; aeRef: number; K: IslemTuru; hss: boolean; fz: boolean; pitch: number | undefined }
export function lifeRefs(t: Kalem, mat: IsMalzemesi): OmurReferansi {
  const cut = t.cut ?? {};
  const hss = t.tm === 'H', base = hss ? mat.vcH : mat.vcK, K = lifeKind(t);
  const vref = base ? base * (t.vm || 1) : 0, fref = cut.fz ? cut.fz * mat.fk : cut.fr ? cut.fr * mat.fk : (cut.pitch || 0.1);
  const EN = LIFE_ENG[t.kind] || [1, 0.5], d = t.d || 10;
  const apRef = K.milling ? Number((EN[0] < 0 ? -EN[0] : EN[0] * d).toFixed(2)) : K.turning ? ((cut.fr ?? Number.NaN) >= 0.2 ? 2 : 0.5) : 0;
  const aeRef = K.milling ? Number((EN[1] < 0 ? -EN[1] : EN[1] * d).toFixed(2)) : 0;
  return { vref, fref, apRef, aeRef, K, hss, fz: !!cut.fz, pitch: cut.pitch };
}
export function vbShape(s: number): number { return 0.25 * (1 - Math.exp(-12 * s)) + 0.45 * s + 0.30 * Math.pow(s, 6); }

// Kesme koşulu: katalogdan (catParams) ya da programdan (progParams) gelir, analizde elle girilir.
export interface KesmeKosulu { vc: number; f: number; ap: number; ae: number; ld: number; cool: string; vb: number; rel: number; cal: number; key?: string }
export interface OmurModeli {
  err?: undefined;
  R: OmurReferansi; P: { n: number; xf: number; xap: number; xae: number; Tref: number; beta: number; fam: string };
  T03: number; Tm: number; TR: number; eta: number; capped: boolean; lowV: boolean;
  f: { V: number; F: number; ap: number; ae: number; ld: number; cool: number; cal: number };
}
export interface OmurHatasi { err: string }

export function lifeModel(t: Kalem | null | undefined, mat: IsMalzemesi, p: KesmeKosulu): OmurModeli | OmurHatasi {
  if (!t || t.kind === 'probe' || t.kind === 'empty') return { err: 'Ölçüm probu / boş cep — aşınma takibi yapılmaz' };
  const R = lifeRefs(t, mat);
  if (!R.vref) return { err: 'Bu malzemede HSS takım önerilmez (Vc tanımsız)' };
  const fam = famOf(t);
  const P = { n: Number((fam.n * matBeh(mat).nk).toFixed(3)), xf: R.hss ? 2.0 : 1.6, xap: R.hss ? 0.6 : 0.45, xae: R.hss ? 0.4 : 0.35, Tref: fam.tref, beta: fam.beta, fam: fam.name };
  const c = (x: number): number => clamp(x, 0.02, 50);
  let fV = c(Math.pow(R.vref / p.vc, 1 / P.n)), fF = R.pitch ? 1 : c(Math.pow(R.fref / p.f, P.xf));
  const fAp = (R.K.milling || R.K.turning) && p.ap > 0 && R.apRef > 0 ? c(Math.pow(R.apRef / p.ap, P.xap)) : 1;
  const fAe = R.K.milling && p.ae > 0 && R.aeRef > 0 ? c(Math.pow(R.aeRef / p.ae, P.xae)) : 1;
  const fLd = R.K.drilling && t.kind !== 'spot' ? c(Math.pow(3 / Math.max(0.5, p.ld || 3), 0.5)) : 1;
  let cf = (COOLF[p.cool] || COOLF['bor5'] || {})[mat.iso] || 1;
  if (R.hss) cf = 1 + (cf - 1) * 1.5;
  if (R.K.drilling && p.cool === 'tsc') cf *= 1.15;
  let capped = fV > 4 || fF > 4;
  fV = Math.min(fV, 4); fF = Math.min(fF, 4);
  const raw = fV * fF * fAp * fAe * fLd * cf, mult = Math.min(raw, 6);
  capped = capped || raw > 6;
  const T03 = P.Tref * mult * (p.cal || 1);
  const target = (p.vb || 0.3) / 0.3;
  let lo = 0.05, hi = 3;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (vbShape(mid) < target) lo = mid; else hi = mid; }
  const Tm = T03 * (lo + hi) / 2, eta = Tm / Math.pow(Math.LN2, 1 / P.beta), TR = eta * Math.pow(-Math.log((p.rel || 50) / 100), 1 / P.beta);
  return { R, P, T03, Tm, TR, eta, capped, lowV: p.vc < R.vref * 0.55, f: { V: fV, F: fF, ap: fAp, ae: fAe, ld: fLd, cool: cf, cal: p.cal || 1 } };
}
export function weibull(eta: number, beta: number): number { return eta * Math.pow(-Math.log(1 - Math.random()), 1 / beta); }
export function catParams(t: Kalem, mat: IsMalzemesi): KesmeKosulu {
  const R = lifeRefs(t, mat), O = lifeOpt(t), key = `${t.id}|${mat.id}`;
  return { vc: R.vref, f: R.fref, ap: R.apRef, ae: R.aeRef, ld: O.ld, cool: state.coolant, vb: O.vb, rel: 50, cal: omurAyari().cal[key] || 1, key };
}
export function progFor(m: Pick<Tezgah, 'id'>, p: number): ProgramTakimi | null {
  const g = gsim();
  if (!g || g.machine !== m.id || !g.perTool) return null;
  return g.perTool[p + 1] || null;
}
export function progParams(t: Kalem, g: ProgramTakimi | null | undefined, q: KesmeKosulu): boolean {
  if (!g || !(g.S > 0) || !t.d || (isLatheTool(t) && !t.d)) return false;
  const cut = t.cut ?? {};
  q.vc = Math.PI * t.d * g.S / 1000;
  if (cut.fz && t.z && g.F > 0) q.f = g.F / (g.S * t.z); else if (cut.fr && g.F > 0) q.f = g.F / g.S;
  return true;
}
export function lifeMat(): IsMalzemesi {
  const L0 = allMaterials();
  return byId(L0, omurAyari().mat || state.material) || (L0[0] as IsMalzemesi);
}

// ---------- magazin takibi ----------
export const REL_TXT: Record<number, string> = { 50: 'Ortalama ömür', 80: 'Güvenli (%80)', 95: 'Çok güvenli (%95)' };
// Stok durumu metni (prototip 20171). Renkleri (ST_HEX) görünüm sahneRengi() ile tasarım değişkeninden alır.
export const STK_TXT: Record<string, string> = { ok: 'Yeterli', low: 'Kritik', short: 'Eksik', none: 'Stok yok' };
export type OmurDurumu = 'ok' | 'warn' | 'crit' | 'over' | 'na';
export const ST_TXT: Record<OmurDurumu, string> = { ok: 'İyi', warn: 'Yarılandı', crit: 'Yakında değiştir', over: 'Ömrü doldu', na: 'Takip yok' };

// Okur, durumu değiştirmez (kayıt yoksa sıfır kayıt döner).
export function wearPeek(mid: string, p: number, id: string): AsinmaKaydi {
  const W0 = asinma()[mid], r = W0 && W0[p];
  return r && r.id === id ? r : { id, used: 0, parts: 0, since: null };
}
// Kaydı yoksa ya da cepte başka takım varsa yenisini durumda kurar.
export function wearRec(mid: string, p: number, id: string): AsinmaKaydi {
  const W = asinma();
  const W0 = W[mid] || (W[mid] = {});
  let r = W0[p];
  if (!r || r.id !== id) r = W0[p] = { id, used: 0, parts: 0, since: Date.now() };
  return r;
}

export interface TakipKarti {
  p: number; t: Kalem; id: string; g?: ProgramTakimi | null; src?: 'program' | 'katalog'; q?: KesmeKosulu; M?: OmurModeli | OmurHatasi;
  w?: AsinmaKaydi; st?: OmurDurumu; TR?: number; rem?: number; pct?: number; tp?: number; parts?: number; partsTot?: number; hrs?: number; days?: number;
}
export function trackCards(): TakipKarti[] {
  const m = machine(), arr = tools(), mat = material(), l = omurAyari(), rel = num(l.trel, 80);
  const g0 = gsim(), cyc = g0 && g0.machine === m.id ? g0.total : null, perDay = num(l.perDay, 0), out: TakipKarti[] = [];
  arr.forEach((id, p) => {
    if (id === 'empty') return;
    const t = toolById(id), c: TakipKarti = { p, t, id };
    const q = catParams(t, mat); q.rel = rel;
    const g = progFor(m, p); c.g = g; c.src = progParams(t, g, q) ? 'program' : 'katalog'; c.q = q;
    const M0 = lifeModel(t, mat, q); c.M = M0;
    const w = wearPeek(m.id, p, id); c.w = w;
    if (M0.err !== undefined) { c.st = 'na'; out.push(c); return; }
    c.TR = M0.TR * (w.lf || 1); c.rem = c.TR - w.used; c.pct = clamp(c.rem / c.TR, 0, 1);
    c.st = c.rem <= 0 ? 'over' : c.pct < 0.2 ? 'crit' : c.pct < 0.5 ? 'warn' : 'ok';
    if (g && g.t > 0) {
      c.tp = g.t; c.parts = Math.max(0, Math.floor(c.rem / g.t)); c.partsTot = Math.floor(M0.TR / g.t);
      if (cyc) c.hrs = c.parts * cyc / 60;
      if (perDay > 0) c.days = c.parts / perDay;
    }
    out.push(c);
  });
  return out;
}
export function fmtDur(h: number | null | undefined): string {
  if (h == null) return '';
  if (h < 1) return `${fmtN(h * 60, 0)} dk`;
  return `${fmtN(h, 1)} sa`;
}
export function fmtDay(d: number | null | undefined): string {
  if (d == null) return '';
  if (d < 1) return 'bugün içinde';
  if (d < 2) return 'yarın';
  const dt = new Date(Date.now() + d * 864e5);
  return `≈ ${fmtN(d, d < 10 ? 1 : 0)} gün · ${dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`;
}

// ---------- veri (bütün tezgâhlar ve depo) ----------
// Elle girilen süre yoksa tür başına tipik süre (dk).
export const DEF_TP: Record<string, number> = {
  facemill: 0.6, facemill45: 0.6, shoulder: 0.9, hfmi: 0.8, roundins: 1.2, disc: 0.5, longedge: 1.0, endmill: 1.2, rougher: 1.5, bullnose: 1.4,
  longneck: 1.5, ball: 2.0, taperball: 2.0, lollipop: 0.6, barrel: 1.5, engrave: 0.5, chamfer: 0.3, backchamfer: 0.3,
  drill: 0.25, spot: 0.1, center: 0.1, stepdrill: 0.3, idrill: 0.3, csink: 0.15, reamer: 0.2, boring: 0.4, boring2: 0.4, tap: 0.15,
  threadmill: 0.4, tslot: 0.6, keyseat: 0.4,
  lt_ext: 0.8, lt_bore: 0.6, lt_groove: 0.2, lt_igroove: 0.2, lt_facegroove: 0.2, lt_part: 0.15, lt_thread: 0.4, lt_ithread: 0.4, lt_udrill: 0.4,
  lt_knurl: 0.2,
};

// Seçili tezgâh dışındaki tezgâhın magazini (tools()'un tezgâh alan karşılığı); eksik magazini durumda kurar.
export function toolsOf(m: Tezgah): string[] {
  let arr = state.tools[m.id];
  const lib = toolLib(m), ok: Record<string, 1> = {};
  lib.forEach((t) => { ok[t.id] = 1; });
  if (!arr) {
    arr = (D.LOAD[m.type] || []).slice();
    if (m.type !== 'lathe') { while (arr.length < m.pockets - 1) arr.push('empty'); arr.push('probe'); }
    state.tools[m.id] = arr;
    dirtyUsage();
  }
  while (arr.length < m.pockets) arr.push('empty');
  if (arr.length > m.pockets) arr.length = m.pockets;
  for (let i = 0; i < arr.length; i++) if (!ok[arr[i] ?? '']) arr[i] = 'empty';
  return arr;
}
export interface SureBilgisi { tp: number; src: 'program' | 'elle' | 'varsayılan'; g?: ProgramTakimi }
export function tpInfo(m: Tezgah, p: number, t: Kalem): SureBilgisi {
  const g = progFor(m, p);
  if (g && g.t > 0) return { tp: g.t, src: 'program', g };
  const pts = state['ptime'] as Record<string, Record<string, ElleSure | undefined> | undefined> | undefined;
  const pt = pts && pts[m.id] && pts[m.id]?.[p];
  if (pt && pt.id === t.id && pt.tp > 0) return { tp: pt.tp, src: 'elle' };
  return { tp: DEF_TP[t.kind] || 0.5, src: 'varsayılan' };
}
export function cycleOf(m: Tezgah, arr: readonly string[]): number {
  const g = gsim();
  if (g && g.machine === m.id) return g.total;
  let s = 0;
  arr.forEach((id, p) => { if (id === 'empty' || id === 'probe') return; const t = byId(toolLib(m), id); if (t) s += tpInfo(m, p, t).tp; });
  return s * 1.3;
}
export interface OmurKarti {
  m: Tezgah; p: number; t: Kalem; id: string; tpi?: SureBilgisi; src?: 'program' | 'katalog'; q?: KesmeKosulu; M?: OmurModeli | OmurHatasi;
  w?: AsinmaKaydi; stock?: KalemStokOzeti; spare?: number | null; st?: OmurDurumu; TR?: number; rem?: number; pct?: number;
  tp?: number; parts?: number; partsTot?: number; hrs?: number; days?: number;
}
export function lifeCard(m: Tezgah, p: number, t: Kalem, mat: IsMalzemesi, _arr: readonly string[], cyc: number | null): OmurKarti {
  const l = omurAyari(), rel = num(l.trel, 80), perDay = num(l.perDay, 0), c: OmurKarti = { m, p, t, id: t.id };
  const q = catParams(t, mat); q.rel = rel;
  const tpi = tpInfo(m, p, t); c.tpi = tpi; c.src = progParams(t, tpi.g, q) ? 'program' : 'katalog'; c.q = q;
  const M0 = lifeModel(t, mat, q); c.M = M0; c.w = wearPeek(m.id, p, t.id);
  const s = stockOf(invKey(t)); c.stock = s; c.spare = s.st === 'none' ? null : Math.max(0, s.avail ?? Number.NaN);
  if (M0.err !== undefined) { c.st = 'na'; return c; }
  c.TR = M0.TR * (c.w.lf || 1); c.rem = c.TR - c.w.used; c.pct = clamp(c.rem / c.TR, 0, 1);
  c.st = c.rem <= 0 ? 'over' : c.pct < 0.2 ? 'crit' : c.pct < 0.5 ? 'warn' : 'ok';
  c.tp = tpi.tp; c.parts = Math.max(0, Math.floor(c.rem / c.tp)); c.partsTot = Math.floor(c.TR / c.tp);
  if (cyc) c.hrs = c.parts * cyc / 60;
  if (perDay > 0) c.days = c.parts / perDay;
  return c;
}
export function machineCards(m: Tezgah): OmurKarti[] {
  const arr = toolsOf(m), mat = material(), cyc = cycleOf(m, arr), out: OmurKarti[] = [];
  arr.forEach((id, p) => { if (id === 'empty') return; const t = byId(toolLib(m), id); if (!t) return; out.push(lifeCard(m, p, t, mat, arr, cyc)); });
  return out;
}

// Kütüphane rafları (prototipin allShelves'i); depo kartları bunlardan çıkar.
export const ZPHYS = ['z_edge', 'z_dial', 'z_pin', 'z_arm', 'z_optic', 'z_laser', 'z_tset'];
export function zeroPhys(): Kalem[] {
  const out: Kalem[] = [], seen: Record<string, 1> = {};
  D.ZERO.mill.concat(D.ZERO.lathe).forEach((z) => { if (ZPHYS.indexOf(z.id) >= 0 && !seen[z.id]) { seen[z.id] = 1; out.push(z); } });
  return out;
}
export interface Raf { key: string; title: string; items: Kalem[] }
export function allShelves(): Raf[] {
  const H = (k: string): Kalem[] => D.HOLDERS.filter((h) => h.shelf === `h_${k}`).concat(cust(`h_${k}`));
  const tl = allMill().concat(allLathe()), out: Raf[] = [];
  D.TOOL_CATS.forEach((c) => { out.push({ key: c.k, title: (c.lib === 'mill' ? 'Freze · ' : '') + c.t, items: tl.filter((t) => t.cat === c.k) }); });
  out.push({ key: 'ins', title: 'Kesici uçlar (sarf)', items: D.INSERTS.concat(cust('ins')) });
  D.TAPERS.forEach((tp) => { out.push({ key: `h_${tp.k}`, title: `Tutucular · ${tp.t}`, items: H(tp.k) }); });
  out.push({ key: 'h_lathe', title: 'Torna takım tutucuları (VDI / BMT)', items: D.LHOLD.concat(cust('h_lathe')) });
  out.push({ key: 'fix', title: 'Bağlama Aparatları', items: D.FIX.mill.concat(D.FIX.lathe, cust('fix')) });
  out.push({ key: 'jaw', title: 'Çeneler ve Destekler', items: D.JAWS.mill.concat(D.JAWS.lathe, cust('jaw')) });
  out.push({ key: 'meas', title: 'Ölçüm ve Sıfırlama', items: zeroPhys().concat(cust('meas').filter((c) => c.kind !== 'gauge'), allGauges()) });
  out.push({ key: 'cons', title: 'Sarf Malzemeleri', items: allCons() });
  return out;
}

export interface DepoGrubu { k: string; t: string; f: (k: string) => boolean }
export const DEPOT_G: readonly DepoGrubu[] = [
  { k: 'd_mill', t: 'Depo · Frezeler', f: (k) => k === 'tm_end' || k === 'tm_form' || k === 'tm_ind' || (k.indexOf('tm_') === 0 && k !== 'tm_hole' && k !== 'tm_thr') },
  { k: 'd_hole', t: 'Depo · Delme ve diş', f: (k) => k === 'tm_hole' || k === 'tm_thr' },
  { k: 'd_lathe', t: 'Depo · Torna', f: (k) => k.indexOf('tl_') === 0 },
  { k: 'd_ins', t: 'Depo · Kesici uçlar', f: (k) => k === 'ins' },
  { k: 'd_hold', t: 'Depo · Tutucular', f: (k) => k.indexOf('h_') === 0 },
  { k: 'd_fix', t: 'Depo · Bağlama ve sarf', f: () => true },
];
export function depotGroup(shKey: string): DepoGrubu {
  for (const g of DEPOT_G) if (g.f(shKey)) return g;
  return DEPOT_G[DEPOT_G.length - 1] as DepoGrubu;
}
export interface DepoKarti { depot: true; t: Kalem; id: string; key: string; stock: KalemStokOzeti; shelf: string; u: Kullanim | undefined; g: string }
export function depotCards(): Record<string, DepoKarti[]> {
  const out: Record<string, DepoKarti[]> = {}, seen: Record<string, 1> = {}, u = usage();
  allShelves().forEach((sh) => {
    const g = depotGroup(sh.key);
    sh.items.forEach((it) => {
      const k = invKey(it);
      if (seen[k]) return;
      const iv = state.inv[k];
      if (!iv || iv.qty == null) return;
      seen[k] = 1;
      (out[g.k] = out[g.k] || []).push({ depot: true, t: it, id: it.id, key: k, stock: stockOf(k), shelf: sh.title.replace('Freze · ', ''), u: u[k], g: g.k });
    });
  });
  const ord: Record<string, number> = { short: 0, low: 1, ok: 2, none: 3 };
  Object.keys(out).forEach((k) => {
    out[k]?.sort((a, b) => ((ord[a.stock.st] ?? Number.NaN) - (ord[b.stock.st] ?? Number.NaN)) || ((a.stock.avail ?? Number.NaN) - (b.stock.avail ?? Number.NaN)));
  });
  return out;
}

// Takım Ömrü tamburunun satırları: her tezgâh, sonra dolu depo grupları (hiç yoksa boş depo satırı).
export interface TamburSatiri {
  key: string; m?: Tezgah; title: string; depot?: true; cards: (OmurKarti | DepoKarti)[];
  n: Record<string, number>;
}
export function lwDefs(): TamburSatiri[] {
  const out: TamburSatiri[] = allMachines().map((m) => {
    const cards = machineCards(m), n: Record<string, number> = { over: 0, crit: 0 };
    cards.forEach((c) => { const k = c.st ?? ''; if (n[k] != null) n[k] += 1; });
    return { key: m.id, m, title: m.name, cards, n };
  });
  const dc = depotCards();
  let any = false;
  DEPOT_G.forEach((g) => {
    const cards = dc[g.k];
    if (!cards || !cards.length) return;
    any = true;
    const n: Record<string, number> = { crit: 0, short: 0, low: 0, ok: 0 };
    cards.forEach((c) => { if (n[c.stock.st] != null) n[c.stock.st] = (n[c.stock.st] ?? 0) + 1; });
    n['crit'] = (n['short'] ?? 0) + (n['low'] ?? 0);
    out.push({ key: `__${g.k}`, depot: true, title: g.t, cards, n });
  });
  if (!any) out.push({ key: '__depot', depot: true, title: 'Depo', cards: [], n: { crit: 0, short: 0, low: 0, ok: 0 } });
  return out;
}
