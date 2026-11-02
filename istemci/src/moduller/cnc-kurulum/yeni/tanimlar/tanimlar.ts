// Tanımlar penceresinin veri ve kural kısmı (prototip 18305-18432): tezgâh ayarı, iş malzemesi ekleme, düzenleme, silme.
// 1091 a: tezgâh listesi İstasyonlar'ın makineleridir; burada yalnız motorun alanları sunucuya yazılır. 1137 a: özel tezgâh
// eklenmez; kayıttaki özel tezgâhlar salt okunurdur. Sunucu listesi yoksa gömülü tezgâhın düzeltmesi eskisi gibi kayda gider.
import type { Tezgah as SunucuTezgahi, TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { save, state, yenile } from '../depo.ts';
import { D, defaults } from '../durum.ts';
import { clamp } from '../bicim.ts';
import { allMachines, allMaterials, byId, dirtyUsage, material, MOTOR_ALANLARI, sunucuTezgahiGuncelle, type TezgahSatiri } from '../secici.ts';
import { tezgahAyarYaz } from '../veri.ts';
import type { IsMalzemesi, IsoGrubu, Kontrol, Tezgah, TezgahTuru } from '../veri/tipler.ts';

export const MODEL_OPTS: readonly [string, string][] = [
  ['m_vmc', 'Dikey işleme merkezi (3 eksen)'], ['m_5ax', '5 eksen · döner-devrilir tabla'], ['m_5axh', '5 eksen · döner kafa + döner tabla'],
  ['m_gk', 'Gezer kolonlu işleme merkezi'], ['m_lathe', 'CNC torna'], ['m_tf', 'Torna-freze'], ['m_hmc', 'Yatay işleme merkezi'],
  ['m_ulathe', 'Üniversal (konvansiyonel) torna'],
];
export const TAPER_OPTS: readonly string[] = ['HSK-A63', 'HSK-A100', 'BT40', 'SK40', 'BT50', 'Capto C6', 'Taret'];
export const TIP_OPTS: readonly [string, string][] = [['mill', 'Freze / işleme merkezi'], ['lathe', 'CNC torna'], ['millturn', 'Torna-freze']];
export const KONTROL_OPTS: readonly [string, string][] = [['heid', 'Heidenhain TNC (Preset)'], ['iso', 'ISO / Fanuc / Siemens (G54)']];
export const ISO_OPTS: readonly [string, string][] = [
  ['P', 'P · Çelik'], ['M', 'M · Paslanmaz'], ['K', 'K · Dökme demir'], ['N', 'N · Alüminyum / demir dışı'], ['S', 'S · Süper alaşım / titanyum'], ['H', 'H · Sertleştirilmiş'],
];
export const TIP_ADI: Record<string, string> = { mill: 'Freze', lathe: 'Torna', millturn: 'Torna-freze' };

export type { Tezgah };
export type Malzeme = IsMalzemesi;

const customMachines = (): Tezgah[] => state.customMachines;
const customMats = (): Malzeme[] => state.customMats;
export const isCustomMachine = (id: string): boolean => !!byId(customMachines(), id);
export const isCustomMat = (id: string): boolean => !!byId(customMats(), id);

// Prototipin fv/fn'si: boş ya da sayı olmayan yazım varsayılana döner; ondalık virgül kabul edilir.
export function sayi(v: string, d: number): number {
  const n = parseFloat(v.trim().replace(',', '.'));
  return isNaN(n) ? d : n;
}

export const YENI_TEZGAH: Partial<Tezgah> = { name: 'Yeni Tezgâh', type: 'mill', kind: 'm_vmc', ctrl: 'heid', taper: 'HSK-A63', pockets: 30, rpm: 12000 };

export interface TezgahAlanlari { no: string; name: string; type: string; kind: string; ctrl: string; taper: string; pockets: string; rpm: string; spindle: string; live: boolean }

export function tezgahAlanlari(m: Partial<Tezgah>): TezgahAlanlari {
  return {
    no: m.no ?? '', name: m.baseName ?? m.name ?? '', type: m.type ?? 'mill', kind: m.kind ?? 'm_vmc', ctrl: m.ctrl ?? 'iso', taper: m.taper ?? 'HSK-A63',
    pockets: String(m.pockets ?? ''), rpm: String(m.rpm ?? ''), spindle: m.spindle ? String(m.spindle) : '', live: !!m.live,
  };
}

// Kaydedilen tezgâhın kimliği döner (önbellek bırakılsın diye). Özel tezgâhın her alanı, katalog tezgâhının yalnız no, ad,
// cep, devir ve ana iş mili devri değişir (prototipteki gibi `mo` üzerine yazılır).
export function saveMachine(mode: 'new' | 'edit', m: Partial<Tezgah>, f: TezgahAlanlari, simdi: number = Date.now()): string {
  const custom = mode === 'new' || isCustomMachine(m.id ?? '');
  const name = f.name.trim() || m.baseName || m.name || '';
  const no = f.no.trim().toUpperCase();
  const pockets = clamp(Math.round(sayi(f.pockets, m.pockets ?? 30)), 1, 120);
  const rpm = clamp(Math.round(sayi(f.rpm, m.rpm ?? 12000)), 100, 80000);
  const spindle = Math.round(sayi(f.spindle, 0)) || undefined;
  if (custom) {
    const type = (f.type || m.type || 'mill') as TezgahTuru;
    let taper = f.taper || m.taper || 'HSK-A63';
    if (type === 'lathe' && taper !== 'Taret' && taper !== 'Capto C6') taper = 'Taret';
    if (type !== 'lathe' && taper === 'Taret') taper = 'HSK-A63';
    const o: Tezgah = {
      id: mode === 'new' ? 'um_' + simdi.toString(36) : m.id!, name, type,
      kind: f.kind || (type === 'lathe' ? 'm_lathe' : type === 'millturn' ? 'm_tf' : 'm_vmc'), ctrl: (f.ctrl || 'iso') as Kontrol, taper, pockets, rpm, spindle,
      live: f.live, liveRpm: 6000, no: no || undefined,
    };
    o.code = TIP_ADI[type]! + ' · ' + taper + ' · ' + (o.ctrl === 'heid' ? 'Heidenhain' : 'ISO');
    if (mode === 'new') customMachines().push(o);
    else {
      const liste = customMachines();
      liste[liste.indexOf(byId(liste, m.id!) as Tezgah)] = o;
      delete state.mo[o.id];
    }
    if (!state.byType[type]) state.byType[type] = Object.assign({}, defaults().byType[type]);
    dirtyUsage(); save();
    return o.id;
  }
  const mo = state.mo[m.id!] ?? (state.mo[m.id!] = {});
  mo.name = name; mo.no = no; mo.pockets = pockets; mo.rpm = rpm;
  if (spindle) mo.spindle = spindle;
  dirtyUsage(); save();
  return m.id!;
}

// Sunucudaki makinenin ayarı. Cep ve devir zorunludur (motor onlarsız çalışmaz); ana iş mili devri boşsa yazılmaz. Elle kumanda
// ve canlı takım devri formda yoktur, var olan değer korunur. Yazılan alanların `mo` düzeltmesi düşer: ayar tek yerde kalır.
export const AYAR_EKSIK_ILETISI = 'Cep sayısı ve en yüksek devir girilmeli.';
export function tezgahAyari(m: Partial<Tezgah>, f: TezgahAlanlari): TezgahAyari {
  const tam = (v: string): number | null => { const n = Math.round(sayi(v, NaN)); return Number.isFinite(n) && n > 0 ? n : null; };
  const pockets = tam(f.pockets), rpm = tam(f.rpm);
  if (pockets === null || rpm === null) throw new Error(AYAR_EKSIK_ILETISI);
  const type = (f.type || m.type || 'mill') as TezgahTuru;
  let taper = f.taper || m.taper || 'HSK-A63';
  if (type === 'lathe' && taper !== 'Taret' && taper !== 'Capto C6') taper = 'Taret';
  if (type !== 'lathe' && taper === 'Taret') taper = 'HSK-A63';
  return {
    tur: type, kontrol: (f.ctrl || m.ctrl || 'iso') as Kontrol, konik: taper, cepSayisi: clamp(pockets, 1, 120), devir: clamp(rpm, 100, 80000),
    isMiliDevri: tam(f.spindle), canliTakim: f.live, canliDevir: f.live ? (m.liveRpm ?? null) : null, elle: m.manual ?? null,
    modelTuru: f.kind || m.kind || (type === 'lathe' ? 'm_lathe' : type === 'millturn' ? 'm_tf' : 'm_vmc'),
  };
}

export async function sunucuTezgahiKaydet(satir: TezgahSatiri, f: TezgahAlanlari): Promise<string> {
  const t: SunucuTezgahi = await tezgahAyarYaz(satir.sunucu, tezgahAyari(satir.tezgah, f));
  sunucuTezgahiGuncelle(t);
  const id = satir.tezgah.id, mo = state.mo[id];
  if (mo && MOTOR_ALANLARI.some((k) => k in mo)) {
    for (const k of MOTOR_ALANLARI) delete mo[k];
    save();
  } else yenile();
  return id;
}

export function deleteMachine(id: string): void {
  state.customMachines = customMachines().filter((x) => x.id !== id);
  delete state.tools[id];
  delete state.active[id];
  delete state.mo[id];
  if (state.machine === id) state.machine = D.MACHINES[0]!.id;
  dirtyUsage(); save();
}

// Tablodaki numara alanı: özel tezgâhta kendisine, katalog tezgâhında `mo`ya yazılır; büyük harfe çevrilir.
export function setMachineNo(id: string, v: string): void {
  const no = v.trim().toUpperCase();
  const cm = byId(customMachines(), id);
  if (cm) cm.no = no;
  else (state.mo[id] ?? (state.mo[id] = {})).no = no;
  dirtyUsage(); save();
}

export const BEH_ANAHTARLARI = ['eng', 'apT', 'nk', 'tune'] as const;
export interface MalzemeAlanlari { name: string; iso: string; rho: string; vcK: string; vcH: string; fk: string; hard: string; desc: string; beh: Record<string, string> }

export function malzemeAlanlari(m: Partial<Malzeme>): MalzemeAlanlari {
  const beh: Record<string, string> = {};
  BEH_ANAHTARLARI.forEach((k) => { beh[k] = m.beh?.[k] != null ? String(m.beh[k]) : ''; });
  return {
    name: m.name ?? '', iso: m.iso ?? 'P', rho: m.rho ? String(m.rho) : '', vcK: String(m.vcK ?? ''), vcH: String(m.vcH ?? 0), fk: String(m.fk ?? ''),
    hard: m.hard ?? '', desc: m.desc ?? '', beh,
  };
}

export function yeniMalzemeTaslagi(): Partial<Malzeme> {
  return Object.assign({}, material(), { name: 'Yeni Malzeme', desc: '' });
}

export function saveMat(mode: 'new' | 'edit', m: Partial<Malzeme>, f: MalzemeAlanlari, simdi: number = Date.now()): string {
  const iso = (f.iso || m.iso || 'P') as IsoGrubu;
  const o: Partial<Malzeme> = {
    name: f.name.trim() || m.name || '', iso, rho: sayi(f.rho, m.rho || 7.85), vcK: Math.round(sayi(f.vcK, m.vcK ?? 0)),
    vcH: Math.round(sayi(f.vcH, 0)), fk: sayi(f.fk, 1), desc: f.desc.trim(), hard: f.hard.trim(),
  };
  const beh: Record<string, number> = {};
  BEH_ANAHTARLARI.forEach((k) => { const v = (f.beh[k] ?? '').trim(); if (v !== '' && isFinite(+v.replace(',', '.'))) beh[k] = +v.replace(',', '.'); });
  o.beh = beh;
  o.isoCol = D.ISO[iso]; o.col = o.isoCol; o.code = 'ISO ' + iso; o.tags = 'Vc karbür ≈ ' + String(o.vcK) + ' m/dk';
  const veri = o;
  if (mode === 'new') {
    // Alan sırası prototipteki gibidir (kayıt metni aynı çıksın): kimlik, tür ve renk sonda.
    const yeni = { ...veri, id: 'ut_' + simdi.toString(36), kind: 'mat', color: 0x9aa3ad } as Malzeme;
    customMats().push(yeni);
    dirtyUsage(); save();
    return yeni.id;
  }
  if (isCustomMat(m.id!)) Object.assign(byId(customMats(), m.id!)!, veri);
  else state.matO[m.id!] = veri;
  dirtyUsage(); save();
  return m.id!;
}

export function deleteMat(id: string): void {
  state.customMats = customMats().filter((x) => x.id !== id);
  if (state.material === id) state.material = D.MATERIALS[0]!.id;
  dirtyUsage(); save();
}

export const tezgahlar = (): Tezgah[] => allMachines();
export const malzemeler = (): Malzeme[] => allMaterials();
