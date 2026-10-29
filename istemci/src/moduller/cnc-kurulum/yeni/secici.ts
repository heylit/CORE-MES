import { degisinceTemizle, state } from './depo.ts';
import type { Baglama } from './durum.ts';
import { defaults } from './durum.ts';
import { D } from './veri/cncdata.ts';
import { htype, isLatheTool } from './veri/takim-turu.ts';
import type { Tezgah as SunucuTezgahi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { IsMalzemesi, Kalem, Kontrol, Tezgah, TezgahTuru } from './veri/tipler.ts';

// Prototipin seçici işlevleri (satır 17299-17357); adlar, sıra ve yan etkiler prototipinkidir (bt eksik bağlamayı, tools eksik
// magazini durumda kurar: prototip de okurken tamamlar, kayıt ilk kullanıcı eyleminde yazılır).

export function byId<T extends { id: string }>(list: readonly T[], id: string | null | undefined): T | null {
  for (const x of list) if (x.id === id) return x;
  return null;
}
function ilk<T>(list: readonly T[]): T {
  const x = list[0];
  if (x === undefined) throw new Error('Liste boş.');
  return x;
}

// ----- tezgâh listesi (1091 a, 1139 b, 1192) -----
// Tezgâhlar İstasyonlar'ın makine kayıtlarıdır; kabuk açılışta sunucudan okur. Makine kodu gömülü tezgâhın numarasıyla aynıysa
// (1192) gömülü kimliği alır: kayıttaki seçim, magazin, el takımları ve düzeltmeler (`mo`) ona okunur, kayıt değişmez. Öteki
// makinenin kimliği `mk<makine id>`dir. Alan sırası: gömülü değer, sunucudaki ayar, `mo` (Kurulum ve Hazırlık'taki düzeltmeler
// hâlâ kayda yazılır); kod ve ad yalnız İstasyonlar'dandır. Tip, kontrol, bağlantı, cep ya da devri bilinmeyen makine listeye
// girmez, Tanımlar'da "ayarı eksik" görünür. Liste boşsa ya da okunamadıysa gömülü liste ve elle eklenenler kullanılır.
let sunucuTezgahlari: readonly SunucuTezgahi[] | null = null;
export function tezgahlariKur(liste: readonly SunucuTezgahi[] | null): void { sunucuTezgahlari = liste; dirtyUsage(); }
export function sunucuTezgahiGuncelle(t: SunucuTezgahi): void {
  if (sunucuTezgahlari === null) return;
  sunucuTezgahlari = sunucuTezgahlari.map((x) => (x.makineId === t.makineId ? t : x));
  dirtyUsage();
}

const MODEL_VARSAYILANI: Record<TezgahTuru, string> = { mill: 'm_vmc', lathe: 'm_lathe', millturn: 'm_tf' };
const KONTROL_ADI: Record<Kontrol, string> = { heid: 'Heidenhain', iso: 'ISO' };
const TIP_ADI: Record<TezgahTuru, string> = { mill: 'Freze', lathe: 'Torna', millturn: 'Torna-freze' };
// Sunucuya taşınan alanlar; `mo` bunların dışında yalnız `info` ve öteki ayrıntıları taşır.
export const MOTOR_ALANLARI = ['type', 'ctrl', 'taper', 'pockets', 'rpm', 'spindle', 'live', 'liveRpm', 'manual', 'kind'] as const;

export const tezgahKimligi = (t: Pick<SunucuTezgahi, 'makineId' | 'kod'>): string => D.MACHINES.find((m) => m.no === t.kod)?.id ?? `mk${String(t.makineId)}`;

export interface TezgahSatiri { sunucu: SunucuTezgahi; tezgah: Partial<Tezgah> & { id: string }; tam: boolean }

function sunucudan(t: SunucuTezgahi): TezgahSatiri {
  const id = tezgahKimligi(t);
  const gomulu = D.MACHINES.find((m) => m.id === id);
  const a = t.ayar;
  const ayar: Partial<Tezgah> = {};
  if (a) {
    if (a.tur !== null) ayar.type = a.tur;
    if (a.kontrol !== null) ayar.ctrl = a.kontrol;
    if (a.konik !== null) ayar.taper = a.konik;
    if (a.cepSayisi !== null) ayar.pockets = a.cepSayisi;
    if (a.devir !== null) ayar.rpm = a.devir;
    if (a.isMiliDevri !== null) ayar.spindle = a.isMiliDevri;
    if (a.canliTakim !== null) ayar.live = a.canliTakim;
    if (a.canliDevir !== null) ayar.liveRpm = a.canliDevir;
    if (a.elle !== null) ayar.manual = a.elle;
    if (a.modelTuru !== null) ayar.kind = a.modelTuru;
  }
  const mo = state.mo[id] ?? {};
  const duzeltme: Partial<Tezgah> = {};
  for (const [k, v] of Object.entries(mo)) if (k !== 'name' && k !== 'no' && k !== 'id' && v !== undefined) (duzeltme as Record<string, unknown>)[k] = v;
  const r: Partial<Tezgah> & { id: string } = Object.assign({}, gomulu ?? {}, ayar, duzeltme, {
    id, no: t.kod, name: t.ad, makineId: t.makineId, istasyonId: t.istasyonId,
  });
  if (r.type && !r.kind) r.kind = MODEL_VARSAYILANI[r.type];
  const tam = !!(r.type && r.ctrl && r.taper && r.pockets && r.rpm);
  if (tam && !gomulu) r.code = `${TIP_ADI[r.type!]} · ${r.taper!} · ${KONTROL_ADI[r.ctrl!]}`;
  return { sunucu: t, tezgah: r, tam };
}

// Tanımlar'ın tezgâh satırları; null: liste okunamadı ya da İstasyonlar'da makine yok.
export function sunucuTezgahSatirlari(): TezgahSatiri[] | null {
  return sunucuTezgahlari === null || sunucuTezgahlari.length === 0 ? null : sunucuTezgahlari.map(sunucudan);
}
// Ayarı tam makine yoksa ekran gömülü listeyle sürer (Tanımlar'da makineler yine görünür, ayarları girilir).
export const tezgahKaynagi = (): 'sunucu' | 'gomulu' => (sunucuTezgahSatirlari()?.some((x) => x.tam) ? 'sunucu' : 'gomulu');

export function allMachines(): Tezgah[] {
  const satirlar = tezgahKaynagi() === 'sunucu' ? sunucuTezgahSatirlari() : null;
  const liste: Tezgah[] = satirlar === null
    ? D.MACHINES.concat(state.customMachines ?? []).map((m) => Object.assign({}, m, state.mo[m.id] ?? {}))
    // Pasif makine yalnız seçiliyse kalır (kurulumu açılabilsin).
    : satirlar.filter((x) => x.tam && (x.sunucu.aktif || x.tezgah.id === state.machine)).map((x) => x.tezgah as Tezgah);
  return liste.map((m) => {
    const r: Tezgah = Object.assign({}, m);
    r.baseName = r.name;
    if (r.no) r.name = `${r.no} · ${r.name}`;
    return r;
  });
}
export function machNoDup(): Record<string, 1> {
  const seen: Record<string, 1> = {}, d: Record<string, 1> = {};
  allMachines().forEach((m) => { if (!m.no) return; if (seen[m.no]) d[m.no] = 1; seen[m.no] = 1; });
  return d;
}
export function allMaterials(): IsMalzemesi[] {
  return D.MATERIALS.map((m) => { const o = state.matO[m.id]; return o ? Object.assign({}, m, o) : m; }).concat(state.customMats ?? []);
}
export function machine(): Tezgah { const L0 = allMachines(); return byId(L0, state.machine) ?? ilk(L0); }
export function material(): IsMalzemesi { const L0 = allMaterials(); return byId(L0, state.material) ?? ilk(L0); }
export function tkey(m: Pick<Tezgah, 'type'>): 'mill' | 'lathe' { return m.type === 'millturn' ? 'lathe' : m.type; }
export function bt(): Baglama {
  const m = machine();
  let b = state.byType[m.type];
  if (!b) { b = Object.assign({}, defaults().byType[m.type]); state.byType[m.type] = b; }
  return b;
}
export function cust(shelf: string, grp?: string): Kalem[] {
  return (state.custom ?? []).filter((c) => c.shelf === shelf && (!grp || c.grp === grp));
}
export function custTools(lib: 'mill' | 'lathe'): Kalem[] {
  return (state.custom ?? []).filter((c) => {
    if (!c.isTool) return false;
    const shelf = c.shelf ?? '';
    const l = c.lib ?? (shelf === 'mill' || shelf === 'lathe' ? shelf : (/^tl_/.test(shelf) ? 'lathe' : 'mill'));
    if (!c.cat) c.cat = /^t[ml]_/.test(shelf) ? shelf : (l === 'lathe' ? 'tl_ext' : 'tm_end');
    return l === lib;
  });
}
export function allMill(): Kalem[] { return D.MILL.concat(custTools('mill')); }
export function allLathe(): Kalem[] { return D.LATHE.concat(custTools('lathe')); }
export function allGauges(): Kalem[] { return D.GAUGES.concat(cust('meas').filter((c) => c.kind === 'gauge')); }
export function allCons(): Kalem[] { return D.CONS.concat(cust('cons')); }
export function toolLib(m: Pick<Tezgah, 'type' | 'live'>): Kalem[] {
  const L = [D.EMPTY];
  if (m.type === 'mill') return L.concat(allMill());
  if (m.type === 'lathe') return L.concat(allLathe(), m.live ? D.LIVE : []);
  return L.concat(allLathe(), allMill());
}
export function machineById(id: string): Tezgah { const L0 = allMachines(); return byId(L0, id) ?? ilk(L0); }

// ----- stok / kullanım -----
export function invKey(it: Pick<Kalem, 'id'>): string { return String(it.id).replace(/^lv_/, ''); }

export interface Kullanim { total: number; by: Record<string, { mag: number; man: number }> }
let usageCache: Record<string, Kullanim> | null = null;
export function dirtyUsage(): void { usageCache = null; }
degisinceTemizle(dirtyUsage);

export function holderIdFor(t: Kalem | null | undefined, m: Tezgah): string | null {
  if (!t || t.kind === 'empty' || t.live || m.type === 'lathe') return null;
  if (isLatheTool(t)) return m.type === 'millturn' ? 'h_capto_lathe' : null;
  return D.holderId(m.taper, htype(t), t.s || t.d);
}
export function usage(): Record<string, Kullanim> {
  if (usageCache) return usageCache;
  const u: Record<string, Kullanim> = {};
  const bump = (k: string, mid: string, f: 'mag' | 'man', n: number): void => {
    const e = u[k] ?? (u[k] = { total: 0, by: {} });
    const b = e.by[mid] ?? (e.by[mid] = { mag: 0, man: 0 });
    b[f] += n; e.total += n;
  };
  allMachines().forEach((m) => {
    const arr = state.tools[m.id];
    if (arr) {
      const lib = toolLib(m);
      arr.slice(0, m.pockets).forEach((id) => {
        if (id === 'empty') return;
        const t = byId(lib, id); if (!t) return;
        bump(invKey(t), m.id, 'mag', 1);
        const h = holderIdFor(t, m); if (h) bump(h, m.id, 'mag', 1);
      });
    }
    const man = state.active[m.id] ?? {};
    Object.keys(man).forEach((k) => { const n = man[k] ?? 0; if (n > 0) bump(k, m.id, 'man', n); });
  });
  return (usageCache = u);
}

export type StokDurumu = 'none' | 'short' | 'low' | 'ok';
export interface KalemStokOzeti { st: StokDurumu; used: number; qty: number | null; avail: number | null; min: number }
export function stockOf(key: string): KalemStokOzeti {
  const iv = state.inv[key], u = usage()[key], used = u ? u.total : 0;
  const qty = iv?.qty;
  if (!iv || qty == null || (qty as unknown) === '') return { st: 'none', used, qty: null, avail: null, min: iv ? iv.min || 0 : 0 };
  const avail = qty - used, st: StokDurumu = avail < 0 ? 'short' : (iv.min && avail <= iv.min) ? 'low' : 'ok';
  return { st, used, qty, avail, min: iv.min || 0 };
}
export function tools(): string[] {
  const m = machine(), lib = toolLib(m), ok: Record<string, 1> = {};
  let arr = state.tools[m.id];
  lib.forEach((t) => { ok[t.id] = 1; });
  if (!arr) {
    arr = (D.LOAD[m.type] ?? []).slice();
    if (m.type !== 'lathe') { while (arr.length < m.pockets - 1) arr.push('empty'); arr.push('probe'); }
    state.tools[m.id] = arr;
  }
  while (arr.length < m.pockets) arr.push('empty');
  if (arr.length > m.pockets) arr.length = m.pockets;
  for (let i = 0; i < arr.length; i++) if (!ok[arr[i] ?? '']) arr[i] = 'empty';
  return arr;
}
export function toolById(id: string): Kalem { return byId(toolLib(machine()), id) ?? D.EMPTY; }
