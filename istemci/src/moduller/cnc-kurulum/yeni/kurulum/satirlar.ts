import { save, state } from '../depo.ts';
import { D, defaults } from '../durum.ts';
import { clamp, pad2 } from '../bicim.ts';
import { allCons, allGauges, allMachines, allMaterials, bt, byId, cust, dirtyUsage, machine, tkey, toolLib, tools } from '../secici.ts';
import type { Kalem } from '../veri/tipler.ts';
import type { RenkAdi } from './renk.ts';

// Kurulum çarkının adımları (prototip 17360-17387) ve çark durumu (17538, 17576-17594). Durum prototipteki gibi görünüm
// değişince kaybolmaz: adım ve odak modül düzeyinde tutulur, çark ve panel aynı nesneyi okur.

export interface TekliAdim {
  key: string; title: string; cat: string; col: RenkAdi; type: 'single'; options: Kalem[];
  get: () => string | null | undefined; set: (id: string) => void; pocket?: number; isTool?: boolean;
}
export interface CokluAdim { key: string; title: string; cat: string; col: RenkAdi; type: 'multi'; options: Kalem[]; list: () => string[]; isTool?: undefined; pocket?: undefined }
export type CarkAdimi = TekliAdim | CokluAdim;

// Genel adım sayısı: tezgâh, malzeme, bağlama, çene, sıfırlama, koordinat, soğutma; ardından cepler, ölçüm ve sarf.
export const GENEL_ADIM = 7;

export const K = {
  defs: [] as CarkAdimi[],
  anim: {} as Record<string, { cur: number; focus: number }>,
  active: 0,
  drumCur: 0,
  pTab: 'model' as 'model' | 'mag',
  pKey: '',
  magDirty: true,
  // Satır kimliği: tezgâh ya da tanım değişince çark yeniden kurulur.
  iz: 0,
};

// Çark sahnesi kendi satır etiketini yeniler (çoklu adımda seçili sayısı).
export const kancalar = { etiket: null as ((i: number) => void) | null };

const dinleyiciler = new Set<() => void>();
export function kurulumDinle(f: () => void): () => void { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; }
export function kurulumYenile(): void { for (const f of dinleyiciler) f(); }

function single(key: string, title: string, cat: string, col: RenkAdi, options: Kalem[], get: TekliAdim['get'], set: TekliAdim['set']): TekliAdim {
  return { key, title, cat, col, type: 'single', options, get, set };
}
function validFirst(list: readonly Kalem[], id: string | undefined): string { return byId(list, id) ? id ?? '' : list[0]?.id ?? ''; }

export function rowDefs(): CarkAdimi[] {
  const m = machine(), tk = tkey(m), b = bt(), out: CarkAdimi[] = [];
  const zg = m.type === 'mill' ? 'mill' : 'lathe';
  const fix = D.FIX[tk].concat(cust('fix', tk)).filter((f) => !f.only || f.only === m.id), jaws = D.JAWS[tk].concat(cust('jaw', tk));
  const zero = D.ZERO[zg].concat(cust('meas', zg).filter((c) => c.kind.indexOf('z_') === 0)), wcs = D.WCS[m.ctrl];
  b.fixture = validFirst(fix, b.fixture); b.jaw = validFirst(jaws, b.jaw); b.zero = validFirst(zero, b.zero); state.wcs[m.ctrl] = validFirst(wcs, state.wcs[m.ctrl]);
  out.push(single('machine', 'Tezgâh', 'TEZGÂH', 'vurgu', allMachines(), () => state.machine, (id) => { state.machine = id; }));
  out.push(single('material', 'İş Parçası Malzemesi', 'MALZEME', 'mavi', allMaterials(), () => state.material, (id) => { state.material = id; }));
  out.push(single('fixture', 'Bağlama Aparatı', 'BAĞLAMA', 'acik-mavi', fix, () => bt().fixture, (id) => { bt().fixture = id; }));
  out.push(single('jaw', 'Çene / Destek', 'ÇENE · DESTEK', 'acik-mavi', jaws, () => bt().jaw, (id) => { bt().jaw = id; }));
  out.push(single('zero', 'Sıfırlama Yöntemi', 'SIFIRLAMA', 'mor', zero, () => bt().zero, (id) => { bt().zero = id; }));
  out.push(single('wcs', m.ctrl === 'heid' ? 'Referans Noktası (Preset)' : 'İş Koordinatı', 'KOORDİNAT', 'mor', wcs, () => state.wcs[machine().ctrl], (id) => { state.wcs[machine().ctrl] = id; }));
  out.push(single('coolant', 'Soğutma', 'SOĞUTMA', 'ok', D.COOL, () => state.coolant, (id) => { state.coolant = id; }));
  const lib = toolLib(m), unit = m.type === 'lathe' ? 'Taret İstasyonu ' : 'Takım Cebi ';
  tools();
  for (let p = 0; p < m.pockets; p++) {
    const d = single(`T${String(p + 1)}`, unit + String(p + 1), `TAKIM · T${pad2(p + 1)}`, 'vurgu', lib, () => tools()[p], (id) => { tools()[p] = id; });
    d.pocket = p; d.isTool = true; out.push(d);
  }
  out.push({ key: 'gauges', title: 'Ölçüm Aletleri', cat: 'ÖLÇÜM', col: 'sari', type: 'multi', options: allGauges(), list: () => state.gauges });
  out.push({ key: 'cons', title: 'Sarf Malzemeleri', cat: 'SARF', col: 'turuncu', type: 'multi', options: allCons(), list: () => state.cons });
  return out;
}

export function selIndex(def: CarkAdimi): number {
  if (def.type !== 'single') return K.anim[def.key]?.focus ?? 0;
  const id = def.get();
  for (let i = 0; i < def.options.length; i++) if (def.options[i]?.id === id) return i;
  return 0;
}
export function isSel(def: CarkAdimi, opt: Kalem): boolean { return def.type === 'single' ? def.get() === opt.id : def.list().indexOf(opt.id) >= 0; }
export function focusIdx(i: number): number { const d = K.defs[i]; if (!d) return 0; return d.type === 'single' ? selIndex(d) : K.anim[d.key]?.focus ?? 0; }
export function etkinAdim(): CarkAdimi | undefined { return K.defs[K.active]; }

export function rebuildAll(): void {
  K.defs = rowDefs(); K.active = clamp(K.active, 0, K.defs.length - 1); K.drumCur = clamp(K.drumCur, 0, K.defs.length - 1);
  for (const d of K.defs) {
    const a = K.anim[d.key], si = selIndex(d);
    if (!a) K.anim[d.key] = { cur: si, focus: si };
    else { if (d.type === 'single') a.focus = si; a.focus = clamp(a.focus, 0, d.options.length - 1); a.cur = clamp(a.cur, 0, d.options.length - 1); }
  }
  K.magDirty = true; K.iz += 1;
}

// Kişi bir adımdan ayrılınca adım "seçildi" sayılır (kopru: cerceve-kopru.ts 753-759); dinleyici seçim modülündedir.
let ayrilinca: ((anahtar: string) => void) | null = null;
export function adimdanAyrilinca(f: ((anahtar: string) => void) | null): void { ayrilinca = f; }

export function goRow(i: number): void {
  i = clamp(Math.round(i), 0, K.defs.length - 1); if (i === K.active) return;
  const once = K.defs[K.active]?.key;
  K.active = i;
  if (once !== undefined) ayrilinca?.(once);
  kurulumYenile();
}

export function changed(def: CarkAdimi): void {
  if (def.key === 'machine') rebuildAll();
  if (def.isTool || def.key === 'machine') K.magDirty = true;
  dirtyUsage(); save(); kurulumYenile();
}

export function setOpt(k: number): void {
  const def = K.defs[K.active]; if (!def) return;
  k = clamp(Math.round(k), 0, def.options.length - 1);
  const a = K.anim[def.key];
  if (def.type === 'single') { const opt = def.options[k]; if (!opt) return; if (def.get() === opt.id) { kurulumYenile(); return; } def.set(opt.id); if (a) a.focus = k; changed(def); }
  else { if (a) a.focus = k; kurulumYenile(); }
}
export function moveOpt(d: number): void { setOpt(focusIdx(K.active) + d); }

// Çoklu adımda odaktaki kalem listeye girer ya da çıkar; tekli adımda sonraki adıma geçilir.
export function toggle(): void {
  const def = K.defs[K.active]; if (!def) return;
  if (def.type !== 'multi') { goRow(K.active + 1); return; }
  const list = def.list(), id = def.options[K.anim[def.key]?.focus ?? 0]?.id; if (id === undefined) return;
  const ix = list.indexOf(id);
  if (ix >= 0) list.splice(ix, 1); else list.push(id);
  kancalar.etiket?.(K.active); changed(def);
}

// Sıfırla: kurulum seçimleri varsayılana döner; stok ve kütüphane kayıtları korunur (prototip 17843).
export function kurulumSifirla(): void {
  const keep = { inv: state.inv, active: state.active, custom: state.custom, mo: state.mo };
  // Durum canlı bağdır: yeni nesne atanmaz, yerinde yenilenir.
  for (const k of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[k];
  Object.assign(state, defaults(), keep);
  K.anim = {}; K.active = 0; K.drumCur = 0; K.pKey = '';
  rebuildAll(); dirtyUsage(); save(); kurulumYenile();
}

// Tezgâh ayrıntısındaki cep sayısı ve devir düzeltmesi (prototip 17855-17861).
export function tezgahDuzelt(alan: 'pockets' | 'rpm', deger: string): void {
  const def = K.defs[K.active]; const opt = def?.options[focusIdx(K.active)]; if (!opt) return;
  const v = parseInt(deger, 10); if (isNaN(v)) return;
  const mo = state.mo[opt.id] ?? (state.mo[opt.id] = {});
  if (alan === 'pockets') mo.pockets = clamp(v, 1, 120); else mo.rpm = clamp(v, 100, 60000);
  if (opt.id === state.machine) rebuildAll();
  dirtyUsage(); save(); kurulumYenile();
}

export function metaYaz(alan: 'part' | 'prog' | 'op', deger: string): void { state.meta[alan] = deger; save(); kurulumYenile(); }
