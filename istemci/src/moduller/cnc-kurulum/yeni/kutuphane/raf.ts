// Kütüphanenin veri ve kural kısmı (prototip 17883-18304): raflar, süzgeç, stok işlemleri, özel kalem, Stok CSV.
// Durum prototipteki gibi yerinde değişir ve save() ile yazılır; çizim bileşenlerdedir.
import { save, state } from '../depo.ts';
import { D } from '../durum.ts';
import { allCons, allGauges, allLathe, allMachines, allMill, byId, cust, dirtyUsage, invKey, stockOf, usage } from '../secici.ts';
import { fmt, lc } from '../bicim.ts';
import type { KalemStogu } from '../durum.ts';
import type { Kalem } from '../veri/tipler.ts';

export type StokDurumu = 'none' | 'ok' | 'low' | 'short';

export type { Kalem };

export interface Raf {
  key: string;
  title: string;
  items: Kalem[];
}

export interface Suzgec {
  q: string;
  mach: string;
  low: boolean;
}

// Raf renkleri tasarım değişkenidir; 3B etiket ve liste aynı adı okur.
const RAF_RENGI: Record<string, string> = {
  mill: '--sahne3b-turuncu', lathe: '--sahne3b-mavi', h_hsk: '--grafik-2', h_bt40: '--grafik-2', h_capto: '--grafik-2',
  fix: '--run', jaw: '--run', meas: '--hazard', cons: '--hold',
};
const ZPHYS = ['z_edge', 'z_dial', 'z_pin', 'z_arm', 'z_optic', 'z_laser', 'z_tset'];

export function rafRengi(k: string): string {
  return RAF_RENGI[k] ?? (/^tm_/.test(k) ? '--sahne3b-turuncu' : /^tl_/.test(k) ? '--sahne3b-mavi' : /^h_/.test(k) ? '--grafik-2' : k === 'ins' ? '--hazard' : '--sahne3b-vurgu');
}

function zeroPhys(): Kalem[] {
  const out: Kalem[] = [];
  const seen: Record<string, 1> = {};
  D.ZERO.mill.concat(D.ZERO.lathe).forEach((z) => { if (ZPHYS.includes(z.id) && !seen[z.id]) { seen[z.id] = 1; out.push(z); } });
  return out;
}

export function allShelves(): Raf[] {
  const H = (k: string): Kalem[] => D.HOLDERS.filter((h) => h.shelf === 'h_' + k).concat(cust('h_' + k));
  const tools = allMill().concat(allLathe());
  const out: Raf[] = [];
  D.TOOL_CATS.forEach((c) => {
    out.push({ key: c.k, title: (c.lib === 'mill' ? 'Freze · ' : '') + c.t, items: tools.filter((t) => t.cat === c.k) });
  });
  out.push({ key: 'ins', title: 'Kesici uçlar (sarf)', items: D.INSERTS.concat(cust('ins')) });
  D.TAPERS.forEach((tp) => { out.push({ key: 'h_' + tp.k, title: 'Tutucular · ' + tp.t, items: H(tp.k) }); });
  out.push({ key: 'h_lathe', title: 'Torna takım tutucuları (VDI / BMT)', items: D.LHOLD.concat(cust('h_lathe')) });
  out.push({ key: 'fix', title: 'Bağlama Aparatları', items: D.FIX.mill.concat(D.FIX.lathe, cust('fix')) });
  out.push({ key: 'jaw', title: 'Çeneler ve Destekler', items: D.JAWS.mill.concat(D.JAWS.lathe, cust('jaw')) });
  out.push({
    key: 'meas', title: 'Ölçüm ve Sıfırlama',
    items: zeroPhys().concat(cust('meas').filter((c) => c.kind !== 'gauge'), allGauges()),
  });
  out.push({ key: 'cons', title: 'Sarf Malzemeleri', items: allCons() });
  return out;
}

export function matches(it: Kalem, f: Suzgec): boolean {
  if (f.q) {
    const hay = lc([it.name, it.code, it.tags, it.desc].join(' '));
    for (const p of lc(f.q).split(/\s+/)) if (p && !hay.includes(p)) return false;
  }
  const key = invKey(it);
  if (f.mach) { const b = usage()[key]?.by[f.mach]; if (!b || !(b.mag + b.man)) return false; }
  if (f.low) { const st = stockOf(key).st; if (st !== 'low' && st !== 'short') return false; }
  return true;
}

// Süzgece uyan raflar; boş raf gösterilmez.
export function suzulmusRaflar(f: Suzgec): Raf[] {
  return allShelves().map((s) => ({ key: s.key, title: s.title, items: s.items.filter((it) => matches(it, f)) })).filter((s) => s.items.length > 0);
}

export function itemById(id: string): Kalem | null {
  for (const s of allShelves()) { const o = byId(s.items, id); if (o) return o; }
  return null;
}

/* ---------- stok işlemleri ---------- */
// Kalemin stok kaydı; `loc` prototipin serbest alanıdır (durum şemasında açık uçlu).
export type StokKaydi = KalemStogu & { loc?: string };

export function ivOf(key: string): StokKaydi {
  return (state.inv[key] ?? (state.inv[key] = { qty: null, min: 0, loc: '' })) as StokKaydi;
}
function stockChanged(): void { dirtyUsage(); save(); }
export function bumpQty(key: string, d: number): void { const iv = ivOf(key); iv.qty = Math.max(0, (iv.qty ?? 0) + d); stockChanged(); }
export function bumpMin(key: string, d: number): void { const iv = ivOf(key); iv.min = Math.max(0, (iv.min || 0) + d); stockChanged(); }
// Boş metin "stok girilmedi"dir (null); sayı olmayan yazım sıfır olur (prototip).
export function setQty(key: string, v: string): void { const t = v.trim(); ivOf(key).qty = t === '' ? null : Math.max(0, parseInt(t, 10) || 0); stockChanged(); }
export function setMin(key: string, v: string): void { ivOf(key).min = Math.max(0, parseInt(v.trim(), 10) || 0); stockChanged(); }
export function setLoc(key: string, v: string): void { ivOf(key).loc = v; save(); }
export function setActive(mid: string, key: string, d: number): void {
  const a = state.active[mid] ?? (state.active[mid] = {});
  a[key] = Math.max(0, (a[key] ?? 0) + d);
  if (!a[key]) delete a[key];
  stockChanged();
}

/* ---------- özel kalem ---------- */
export function toolTags(o: Kalem): string | undefined {
  if (!o.isTool || !o.d) return o.tags;
  const p = ['Ø' + fmt(o.d)];
  if (o.z) p.push('Z' + String(o.z));
  const tm = (D.TM as Record<string, string>)[o.tm ?? ''];
  if (tm) p.push(tm);
  return p.join(' · ');
}

function grpOf(base: Kalem, shelf: string): string | null {
  if (base.grp) return base.grp;
  if (shelf === 'fix') return byId(D.FIX.mill, base.id) ? 'mill' : 'lathe';
  if (shelf === 'jaw') return byId(D.JAWS.mill, base.id) ? 'mill' : 'lathe';
  if (shelf === 'meas' && (base.kind ?? '').indexOf('z_') === 0) return byId(D.ZERO.mill, base.id) ? 'mill' : 'lathe';
  return null;
}

export interface Duzenleme { mode: 'new' | 'edit'; base: Kalem; shelf?: string }
export interface DuzenlemeAlanlari { name: string; code: string; desc: string; d: string; z: string; qty: string }

// Kaydedilen kalemin kimliği ve rafı döner (yeni kalem seçili olur). Zaman damgalı kimlik prototipteki biçimdir.
export function saveEdit(e: Duzenleme, f: DuzenlemeAlanlari, simdi: number = Date.now()): { id: string; shelf: string | undefined } {
  const obj: Kalem = e.mode === 'new' ? JSON.parse(JSON.stringify(e.base)) as Kalem : e.base;
  obj.name = f.name.trim() || obj.name;
  obj.code = f.code.trim();
  obj.desc = f.desc.trim();
  const d = parseFloat(f.d.trim().replace(',', '.'));
  const z = parseInt(f.z.trim(), 10);
  if (!isNaN(d) && d > 0 && obj.d) { if (!obj.s || obj.s === obj.d) obj.s = d; obj.d = d; if (obj.kind === 'holder') obj.dia = d; }
  if (!isNaN(z) && z > 0 && obj.z) obj.z = z;
  obj.tags = toolTags(obj);
  if (e.mode === 'new') {
    const shelf = e.shelf ?? '';
    // grp kayıtta prototipteki gibi null kalabilir (tip yalnız metin bilir).
    obj.id = 'u' + simdi.toString(36); obj.custom = true; obj.shelf = shelf; (obj as Record<string, unknown>).grp = grpOf(e.base, shelf); obj.base = e.base.id; delete obj.live;
    if (obj.isTool) { obj.lib = e.base.lib ?? 'mill'; obj.cat = e.base.cat ?? shelf; obj.shelf = obj.cat; }
    state.custom.push(obj);
    const q = parseInt(f.qty.trim(), 10);
    if (!isNaN(q)) state.inv[obj.id] = { qty: Math.max(0, q), min: 0, loc: '' };
    dirtyUsage(); save();
    return { id: obj.id, shelf: e.shelf };
  }
  dirtyUsage(); save();
  return { id: obj.id, shelf: undefined };
}

export function deleteCustom(it: Kalem): void {
  state.custom = state.custom.filter((c) => c.id !== it.id);
  delete state.inv[it.id];
  Object.keys(state.active).forEach((m) => { delete state.active[m]![it.id]; });
  dirtyUsage(); save();
}

/* ---------- özet ve tezgâh listesi ---------- */
export function tezgahtaAktif(mid: string): number {
  const u = usage();
  let n = 0;
  Object.keys(u).forEach((k) => { const b = u[k]!.by[mid]; if (b && b.mag + b.man) n++; });
  return n;
}

export function ozet(): { tot: number; entered: number; low: number; short: number } {
  let tot = 0, entered = 0, short = 0, low = 0;
  allShelves().forEach((s) => s.items.forEach((it) => {
    tot++;
    const st = stockOf(invKey(it)).st;
    if (st !== 'none') entered++;
    if (st === 'short') short++;
    if (st === 'low') low++;
  }));
  return { tot, entered, low, short };
}

export interface TezgahOzeti { id: string; name: string; aktif: number; yuklu: number | null }
export function tezgahOzetleri(): TezgahOzeti[] {
  return allMachines().map((m) => {
    const arr = state.tools[m.id] as string[] | undefined;
    return { id: m.id, name: m.name, aktif: tezgahtaAktif(m.id), yuklu: arr ? arr.filter((x) => x !== 'empty').length : null };
  });
}

// Kalemin kullanıldığı tezgâhlar (ad, adet); liste ve CSV aynı sırayı kullanır.
export function kalemTezgahlari(key: string): { ad: string; adet: number }[] {
  const e = usage()[key];
  if (!e) return [];
  const ms: { ad: string; adet: number }[] = [];
  Object.keys(e.by).forEach((mid) => {
    const b = e.by[mid]!;
    if (b.mag + b.man) ms.push({ ad: (byId(allMachines(), mid) ?? { name: mid }).name, adet: b.mag + b.man });
  });
  return ms;
}

/* ---------- Stok CSV (biçim prototipteki gibi: noktalı virgül, BOM, gerektiğinde tırnak) ---------- */
export function stokCsvMetni(): string {
  const L2: (string | number)[][] = [['Raf', 'Malzeme', 'Kod', 'Toplam', 'Kritik', 'Aktif', 'Depoda', 'Konum', 'Tezgâhlar']];
  allShelves().forEach((s) => s.items.forEach((it) => {
    const key = invKey(it);
    const iv = state.inv[key] as StokKaydi | undefined;
    const st = stockOf(key);
    const ms = kalemTezgahlari(key).map((m) => m.ad + ' (' + String(m.adet) + ')');
    L2.push([s.title, it.name, it.code ?? '', iv?.qty ?? '', iv?.min || '', st.used || '', st.avail ?? '', iv?.loc ?? '', ms.join(', ')]);
  }));
  const q = (v: string | number | null | undefined): string => {
    const t = String(v ?? '');
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + L2.map((r) => r.map(q).join(';')).join('\r\n');
}

export function stokCsvAdi(simdi: Date = new Date()): string {
  return 'CNC_Stok_' + simdi.toISOString().slice(0, 10) + '.csv';
}
