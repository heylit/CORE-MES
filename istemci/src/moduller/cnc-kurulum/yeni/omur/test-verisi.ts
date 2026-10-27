import { vi } from 'vitest';
import type { CarkSatiri } from './takip.ts';
import type { AsinmaKaydi, DepoKarti, IsMalzemesi, KesmeParametresi, OmurAyari, OmurHesabi, OmurKarti, OmurModeli, Takim, Tezgah } from './tipler.ts';

// Testlerin sahte çekirdeği: biçim işlevleri prototipteki gibi, ömür modeli sabit ve öngörülebilir. Veri sentetiktir.

export const fmtN = (x: number | null | undefined, d = 0): string =>
  x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const num = (v: unknown, d: number): number => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? d : x; };
export const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const upTR = (s: string): string => s.toLocaleUpperCase('tr-TR');
export const fmtDur = (h: number | null | undefined): string => (h == null ? '' : h < 1 ? fmtN(h * 60, 0) + ' dk' : fmtN(h, 1) + ' sa');
export const fmtDay = (d: number | null | undefined): string => (d == null ? '' : d < 1 ? 'bugün içinde' : d < 2 ? 'yarın' : '≈ ' + fmtN(d, 1) + ' gün');
export const fmtT = (dk: number | null | undefined): string => (dk == null ? '—' : fmtN(dk, 1) + ' dk');

export const LIFE_DEF: OmurAyari = {
  sel: '', mat: '', cool: '', vc: '', f: '', ap: '', ae: '', ld: 3, vb: 0.3, rel: 90, tp: '', batch: 100, price: '', uses: '', tc: 1, rate: 1500,
  cal: {}, mode: 'track', trel: 80, perDay: '', psel: 0,
};
export const REL_TXT: Record<number, string> = { 50: 'Ortalama ömür', 80: 'Güvenli (%80)', 95: 'Çok güvenli (%95)' };
export const ST_TXT = { ok: 'İyi', warn: 'Yarılandı', crit: 'Yakında değiştir', over: 'Ömrü doldu', na: 'Takip yok' } as const;
export const STK_TXT = { ok: 'Yeterli', low: 'Kritik', short: 'Eksik', none: 'Stok yok' } as const;
export const DEF_TP: Record<string, number> = { endmill: 1.2, facemill: 0.6, drill: 0.25 };
export const DEPOT_G = [{ k: 'd_mill', t: 'Depo · Frezeler', f: () => true }];

export const TAKIMLAR: Takim[] = [
  { id: 'em10', name: 'Karbür parmak freze Ø10', kind: 'endmill', tm: 'K', d: 10, z: 4, cut: { fz: 0.05 } },
  { id: 'fm50', name: 'Uçlu alın frezesi Ø50', code: 'SEKN 1203 · 5 uç', kind: 'facemill', tm: 'I', d: 50, z: 5, cut: { fz: 0.15 } },
  { id: 'dr8', name: 'Karbür matkap Ø8', kind: 'drill', tm: 'K', d: 8, cut: { fr: 0.15 } },
  { id: 'probe', name: 'Ölçüm probu', kind: 'probe', cut: {} },
];
export const TEZGAH: Tezgah = { id: 'm1', name: 'Deneme tezgâhı', code: 'T-1', type: 'mill', ctrl: 'iso', taper: 'BT40', pockets: 4, rpm: 10000, kind: 'm_5ax' };
export const MALZEME: IsMalzemesi = {
  id: 'c45', name: 'Deneme çeliği', code: 'ISO P', iso: 'P', vcK: 180, vcH: 26, fk: 0.9, color: 0, isoCol: '', col: '', kind: 'mat', desc: '', tags: '',
};

interface SahteDurum {
  life: OmurAyari;
  wear: Record<string, Record<string, AsinmaKaydi>>;
  wearLog: unknown[];
  inv: Record<string, { qty: number; min?: number; loc?: string; demo?: 1 }>;
  machine: string;
  coolant: string;
  gsim: null;
  ptime?: Record<string, Record<string, { id: string; tp: number }>>;
  lifeDemo?: string;
  tools: Record<string, string[]>;
}

export const state = {} as SahteDurum;
export function durumKur(): SahteDurum {
  for (const k of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[k];
  Object.assign(state, {
    life: { ...LIFE_DEF, cal: {} }, wear: {}, wearLog: [], inv: {}, machine: 'm1', coolant: 'bor5', gsim: null, tools: { m1: ['em10', 'fm50', 'dr8', 'probe'] },
  });
  return state;
}
durumKur();

export const save = vi.fn();
export const useCncSurum = (): number => 0;
export const D = { COOL: [{ id: 'bor5', name: 'Bor yağı %5' }], INSERTS: [{ id: 'ins-sekn', name: 'SEKN 1203 AFTN' }] };
export const yetki = { yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: true, stokDusebilir: true, stokKartiBaglayabilir: false, emirGorebilir: false, saltOnay: false };
export const useCncYetkisi = () => yetki;
export const git = vi.fn();
export const useGorunum = () => ({ gorunum: 'life' as const, burada: true, git });
export const useTuslar = vi.fn();
export const gecisSecenegiAl = vi.fn((): unknown => undefined);
export const isMillTool = (t: Takim): boolean => t.kind !== 'probe' && t.kind !== 'empty';
export const isLatheTool = (): boolean => false;

export const byId = <T extends { id: string }>(l: readonly T[], id: string): T | null => l.find((x) => x.id === id) ?? null;
export const allMachines = (): Tezgah[] => [TEZGAH];
export const allMaterials = (): IsMalzemesi[] => [MALZEME];
export const allMill = (): Takim[] => TAKIMLAR;
export const allLathe = (): Takim[] => [];
export const allShelves = () => [];
export const machine = (): Tezgah => TEZGAH;
export const material = (): IsMalzemesi => MALZEME;
export const toolsOf = (m: Tezgah): string[] => state.tools[m.id] ?? [];
export const tools = (): string[] => toolsOf(TEZGAH);
export const toolById = (id: string): Takim => byId(TAKIMLAR, id)!;
export const toolLib = (): Takim[] => TAKIMLAR;
export const invKey = (t: { id: string }): string => t.id;
export const usage = () => ({ em10: { total: 1, by: { m1: { mag: 1, man: 0 } } } });
export const stockOf = (k: string) => {
  const iv = state.inv[k];
  return iv ? { st: iv.qty > 1 ? 'ok' as const : iv.qty > 0 ? 'low' as const : 'short' as const, avail: iv.qty - 1, qty: iv.qty, used: 1, min: 1 } : { st: 'none' as const, avail: null, qty: 0, used: 0, min: 0 };
};
export const dirtyUsage = vi.fn();

// Sabit model: ortalama ömür 60 dk, güvenli değişim 40 dk; prob için takip yok.
export const lifeRefs = (): OmurHesabi['R'] => ({ vref: 200, fref: 0.05, apRef: 10, aeRef: 3, K: { turning: false, drilling: false, milling: true }, hss: false, fz: true, pitch: undefined });
export const lifeOpt = (t: Takim) => ({ vb: 0.3, ld: 3, uses: t.tm === 'I' ? 2 : 3 });
export const lifeKind = (t: Takim) => ({ turning: false, drilling: t.kind === 'drill', milling: t.kind !== 'drill' });
export const lifeMat = (): IsMalzemesi => MALZEME;
export const catParams = (t: Takim, mat: IsMalzemesi): KesmeParametresi =>
  ({ vc: 200, f: 0.05, ap: 10, ae: 3, ld: 3, cool: 'bor5', vb: 0.3, rel: 50, cal: 1, key: t.id + '|' + mat.id });
export const modelHesabi = (vc = 200): OmurHesabi => ({
  R: lifeRefs(), P: { n: 0.25, xf: 1.6, xap: 0.45, xae: 0.35, Tref: 35, beta: 3, fam: 'Karbür freze' },
  T03: 60, Tm: 60 * (200 / vc), TR: 40 * (200 / vc), eta: 67, capped: false, lowV: false, f: { V: 1, F: 1, ap: 1, ae: 1, ld: 1, cool: 1, cal: 1 },
});
export const lifeModel = (t: Takim, _m: IsMalzemesi, p: KesmeParametresi): OmurModeli =>
  (t.kind === 'probe' ? { err: 'Ölçüm probu / boş cep — aşınma takibi yapılmaz' } : modelHesabi(p.vc));
export const progFor = () => null;
export const progParams = () => false;
export const weibull = (eta: number): number => eta;
export const vbShape = (s: number): number => s;
export const wearPeek = (mid: string, p: number, id: string): AsinmaKaydi => {
  const r = state.wear[mid]?.[p];
  return r && r.id === id ? r : { id, used: 0, parts: 0, since: null };
};
export const wearRec = (mid: string, p: number, id: string): AsinmaKaydi => {
  const W0 = state.wear[mid] || (state.wear[mid] = {});
  let r = W0[p];
  if (!r || r.id !== id) r = W0[p] = { id, used: 0, parts: 0, since: 1 };
  return r;
};
export const tpInfo = () => ({ tp: 1, src: 'varsayılan' as const });
export const cycleOf = () => 10;
export const lifeCard = (): OmurKarti => { throw new Error('kullanılmaz'); };
export function machineCards(m: Tezgah): OmurKarti[] {
  return toolsOf(m).flatMap((id, p): OmurKarti[] => {
    if (id === 'empty') return [];
    const t = toolById(id), M = lifeModel(t, MALZEME, catParams(t, MALZEME)), w = wearPeek(m.id, p, id), stock = stockOf(id);
    const base = { m, p, t, id, tpi: tpInfo(), src: 'katalog' as const, q: catParams(t, MALZEME), M, w, stock, spare: stock.st === 'none' ? null : Math.max(0, stock.avail ?? 0) };
    if (M.err !== undefined) return [{ ...base, st: 'na' }];
    const TR = M.TR * (w.lf || 1), rem = TR - w.used, pct = clamp(rem / TR, 0, 1);
    const st = rem <= 0 ? 'over' as const : pct < 0.2 ? 'crit' as const : pct < 0.5 ? 'warn' as const : 'ok' as const;
    return [{ ...base, st, TR, rem, pct, tp: 1, parts: Math.max(0, Math.floor(rem)), partsTot: Math.floor(TR) }];
  });
}
export const depotKartlari: { d_mill?: DepoKarti[] } = {};
export const depotCards = (): Record<string, DepoKarti[]> => depotKartlari as Record<string, DepoKarti[]>;

export const CNC3D = { isMillTool: (t: Takim) => t.kind !== 'probe', isLatheTool: () => false };

// Çekirdeğin lwDefs'i (prototip): tezgâh satırları, sonra dolu depo grupları; hiç yoksa boş depo satırı.
export function lwDefs(): CarkSatiri[] {
  const out: CarkSatiri[] = allMachines().map((m) => {
    const cards = machineCards(m), n = { over: 0, crit: 0 };
    cards.forEach((c) => { if (c.st === 'over' || c.st === 'crit') n[c.st]++; });
    return { key: m.id, m, title: m.name, cards, n };
  });
  let any = false;
  DEPOT_G.forEach((g) => {
    const cards = depotCards()[g.k];
    if (!cards || !cards.length) return;
    any = true;
    const n = { crit: 0, short: 0, low: 0, ok: 0 };
    cards.forEach((c) => { if (c.stock.st !== 'none') n[c.stock.st]++; });
    n.crit = n.short + n.low;
    out.push({ key: '__' + g.k, depot: true, title: g.t, cards, n });
  });
  if (!any) out.push({ key: '__depot', depot: true, title: 'Depo', cards: [], n: { crit: 0, short: 0, low: 0, ok: 0 } });
  return out;
}
