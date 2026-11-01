// Finans analiz motoru: prototipin ENGINE-START / ENGINE-END bloğunun tipli karşılığı; saf işlevdir. Ekran ve sunucu aynı
// kodu koşar (1456 b: günlük skoru sunucu yazar). Sayılar prototiple birebir aynı olmalı; istemcideki `esitlik.test.ts` iki motoru aynı girdiyle koşturur.
// Bu yüzden veri alan adları ve işlev adları prototipteki gibidir (satır satır karşılaştırma için) ve işlem sırası
// değiştirilmez: kayan nokta toplamları sıraya bağlıdır. Motor DOM'a, ağa ve saate dokunmaz (`at` ve `ms` dışında).

export type IslemTuru = 'gelir' | 'gider';
export type IslemDurumu = 'acik' | 'odendi' | 'cek';
export type CekYonu = 'alinan' | 'verilen';

export interface Islem {
  id: string;
  type: IslemTuru;
  cat: string;
  party: string;
  date: string;
  due: string;
  amount: number;
  kdv?: number;
  status: IslemDurumu;
  paidDate?: string | null;
  // Açılış bakiyesi ya da avans: kâr/zarara ve KDV'ye girmez.
  np?: boolean;
  recId?: string;
  desc?: string;
  _belgeId?: number;
  _odemeId?: number;
  paraBirimi?: string;
}

export interface Cek {
  id: string;
  dir: CekYonu;
  kind: string;
  party: string | null;
  bank?: string;
  no?: string;
  date?: string;
  due: string;
  amount: number;
  status: string;
  _cekId?: number;
}

export interface DuzenliOdeme {
  id: string;
  name: string;
  cat: string;
  amount: number;
  day: number;
  kdv?: number;
  _duzenliId?: number;
}

export interface Agirliklar {
  likidite: number;
  nakit: number;
  karlilik: number;
  verimlilik: number;
  borcluluk: number;
}

export interface MotorAyarlari {
  sector: string;
  riskTol: number;
  sims: number;
  chequeRisk: number;
  writeOffDays: number;
  anomalyZ: number;
  weights: Agirliklar;
}

export interface Senaryo {
  delay: number;
  growth: number;
  collect: number;
  chequeRisk: number;
  newBiz: boolean;
}

export interface Bilanco {
  donen: number;
  stok: number;
  kvb: number;
  toplamBorc: number;
  ozkaynak: number;
  birikmisKar: number;
}

export interface SkorGecmisi {
  d: string;
  score: number;
  cash: number;
  pNeg?: number | null;
  minP50?: number | null;
  src: string;
}

export interface MotorDurumu {
  v: number;
  demo: boolean;
  company: { name: string; openingCash: number; openingDate: string; threshold: number; expSales: number; expTerm: number };
  settings: MotorAyarlari;
  tx: Islem[];
  cheques: Cek[];
  recurring: DuzenliOdeme[];
  budget: Record<string, number>;
  revenueTarget: number;
  cashChecks: unknown[];
  setupDone: boolean;
  balance: Bilanco;
  closing: Record<string, Record<string, boolean>>;
  reco: Record<string, { st: string; until: string | null }>;
  history: SkorGecmisi[];
  serverReport: unknown;
  scen: Senaryo;
  tools: {
    be: { fixed: number; price: number; varCost: number; units: number };
    inv: { cost: number; cash: number; years: number; rate: number; salvage: number };
    loan: { amount: number; rate: number; months: number };
  };
  // Ay (yyyy-mm) başına amortisman, TL; yalnız sunucudan gelir.
  amort?: Record<string, number>;
}

export interface SiparisKalemi {
  id?: number;
  siparisNo?: string;
  firmaAdi?: string;
  vade: string;
  tutarTl?: string | null;
  tahminTl?: string | null;
  paraBirimi?: string;
  tutar?: string;
}

/* ---------- Biçim ve tarih yardımcıları (bugünden bağımsız) ---------- */
const TLF = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
export const fmt = (n: number | null | undefined): string => TLF.format(Math.round(n || 0));
export const nf = (n: unknown, d = 0): string => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const fmtK = (n: number): string => {
  const a = Math.abs(n || 0);
  if (a >= 1e6) return nf(n / 1e6, 2) + ' Mn ₺';
  if (a >= 1e3) return nf(n / 1e3, 0) + ' B ₺';
  return nf(n, 0) + ' ₺';
};
export const pct = (x: number, d = 1): string => (x < 0 ? '-%' : '%') + nf(Math.abs((x || 0) * 100), d);
export const pad = (n: number): string => String(n).padStart(2, '0');
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ucParca = (s: string): [number, number, number] => s.split('-').map(Number) as [number, number, number];
export const D = (s: string): Date => { const [y, m, d] = ucParca(s); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number): string => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a: string, b: string): number => Math.round((D(a).getTime() - D(b).getTime()) / 864e5);
export const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const MONL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const fmtD = (s: string | null | undefined): string => { if (!s) return '—'; const d = D(s); return `${d.getDate()} ${MON[d.getMonth()]!}`; };
export const fmtDY = (s: string | null | undefined): string => { if (!s) return '—'; const d = D(s); return `${d.getDate()} ${MON[d.getMonth()]!} ${d.getFullYear()}`; };
const ikiParca = (ym: string): [number, number] => ym.split('-').map(Number) as [number, number];
export const ymLabel = (ym: string): string => { const [y, m] = ikiParca(ym); return MON[m - 1]! + ' ' + String(y).slice(2); };
export const ymLong = (ym: string): string => { const [y, m] = ikiParca(ym); return MONL[m - 1]! + ' ' + y; };
export const ymAdd = (ym: string, k: number): string => { const [y, m] = ikiParca(ym); return iso(new Date(y, m - 1 + k, 1)).slice(0, 7); };
export const monthEnd = (ym: string): string => { const [y, m] = ikiParca(ym); return iso(new Date(y, m, 0)); };
export function sum<T>(arr: readonly T[], f?: (x: T) => number): number {
  return arr.reduce((a, x) => a + (f ? f(x) : (x as unknown as number)), 0);
}
export const mean = (a: readonly number[]): number => (a.length ? sum(a) / a.length : 0);
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
export const median = (a: readonly number[]): number => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export const quantile = (sorted: ArrayLike<number>, q: number): number => {
  if (!sorted.length) return 0;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (p - lo);
};
// Tohumlu üreteç (mulberry32): aynı veriyle aynı simülasyon; sayılar testte sabitlenebilir.
export function rngOf(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randn(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- Kategoriler ve sektör eşikleri ---------- */
export interface Kategori { k: string; supplier?: boolean; variable?: boolean; cogs?: boolean; pnl?: boolean }
export const CATS: Record<IslemTuru, Kategori[]> = {
  gelir: [{ k: 'Ürün satışı' }, { k: 'Hizmet geliri' }, { k: 'Diğer gelir' }, { k: 'Kur farkı geliri' }],
  gider: [
    { k: 'Mal / hammadde alımı', supplier: true, variable: true, cogs: true },
    { k: 'Personel (net maaş)' }, { k: 'SGK & stopaj' },
    { k: 'Kira', supplier: true }, { k: 'Enerji & faturalar', supplier: true },
    { k: 'Lojistik', supplier: true, variable: true }, { k: 'Pazarlama', supplier: true, variable: true },
    { k: 'Finansman (faiz)' }, { k: 'Diğer gider', supplier: true, variable: true },
    { k: 'KDV / vergi ödemesi', pnl: false }, { k: 'Kredi anapara', pnl: false }, { k: 'Kur farkı gideri' },
  ],
};
export const catInfo = (type: string, k: string): Partial<Kategori> => (CATS[type as IslemTuru] ?? []).find((c) => c.k === k) ?? {};
export const isPnl = (t: Islem): boolean => !t.np && (t.type === 'gelir' || catInfo('gider', t.cat).pnl !== false);
export const real = (t: Islem): boolean => !t.np;
export const gross = (t: Islem): number => t.amount * (1 + (t.kdv || 0) / 100);
export const PNL_GIDER = CATS.gider.filter((c) => c.pnl !== false).map((c) => c.k);
export const AMORT = 'Amortisman (nakit dışı)';

export type EsikAdi = 'cari' | 'asit' | 'nakit' | 'de' | 'marj' | 'brut' | 'dso' | 'ccc' | 'faiz';
// Her gösterge için [kötü, iyi] eşikleri. Puan = (değer − kötü) / (iyi − kötü), 0–100 arasına sıkıştırılır.
export const SECTORS: Record<string, { ad: string; t: Record<EsikAdi, [number, number]> }> = {
  genel: { ad: 'Genel / karma faaliyet', t: { cari: [0.9, 1.5], asit: [0.5, 1.0], nakit: [0.03, 0.2], de: [2.5, 0.8], marj: [-0.02, 0.10], brut: [0.10, 0.35], dso: [90, 40], ccc: [150, 45], faiz: [1, 5] } },
  uretim: { ad: 'Üretim / imalat', t: { cari: [1.0, 1.6], asit: [0.5, 0.9], nakit: [0.03, 0.15], de: [2.5, 1.0], marj: [-0.02, 0.08], brut: [0.10, 0.30], dso: [100, 50], ccc: [180, 60], faiz: [1, 4] } },
  ticaret: { ad: 'Toptan / perakende ticaret', t: { cari: [0.9, 1.4], asit: [0.4, 0.8], nakit: [0.03, 0.15], de: [3, 1.2], marj: [-0.01, 0.05], brut: [0.08, 0.25], dso: [75, 30], ccc: [120, 30], faiz: [1, 4] } },
  hizmet: { ad: 'Hizmet / yazılım / danışmanlık', t: { cari: [0.9, 1.5], asit: [0.7, 1.2], nakit: [0.05, 0.3], de: [2, 0.6], marj: [0, 0.15], brut: [0.25, 0.55], dso: [75, 30], ccc: [90, 20], faiz: [1.5, 6] } },
  insaat: { ad: 'İnşaat / taahhüt', t: { cari: [0.9, 1.3], asit: [0.4, 0.8], nakit: [0.03, 0.12], de: [3.5, 1.5], marj: [-0.02, 0.08], brut: [0.08, 0.25], dso: [150, 60], ccc: [240, 90], faiz: [1, 3.5] } },
};
export const scoreOf = (v: number | null | undefined, bg: readonly [number, number]): number | null =>
  v === null || v === undefined || !isFinite(v) ? null : clamp((v - bg[0]) / (bg[1] - bg[0]), 0, 1) * 100;
export type Derece = 'neutral' | 'ok' | 'warn' | 'risk';
export const gradeOfScore = (s: number | null): Derece => (s === null ? 'neutral' : s >= 66 ? 'ok' : s >= 33 ? 'warn' : 'risk');

export type AltSkorAdi = keyof Agirliklar;
export const SUBS: [AltSkorAdi, string, string][] = [
  ['likidite', 'Likidite', 'Kısa vadeli borçları ödeme gücü'],
  ['nakit', 'Nakit riski', '13 haftalık simülasyonda nakdin yetme olasılığı'],
  ['karlilik', 'Kârlılık', 'Marjlar ve satış trendi'],
  ['verimlilik', 'Çalışma sermayesi', 'Tahsil hızı, dönüşüm süresi, alacak kaybı'],
  ['borcluluk', 'Borç yapısı', "Borçluluk, faiz yükü, Altman Z''"],
];
export const gradeName = (s: number): string => (s >= 80 ? 'Güçlü' : s >= 65 ? 'İyi' : s >= 50 ? 'Orta' : s >= 35 ? 'Zayıf' : 'Kritik');
const avgNN = (arr: (number | null | undefined)[]): number | null => {
  const v = arr.filter((x): x is number => x !== null && x !== undefined && isFinite(x));
  return v.length ? mean(v) : null;
};
export const METHOD_NAMES = { holt: 'Holt (seviye + eğilim)', ort3: 'Son 3 ayın ortalaması', naif: 'Geçen ayın tekrarı' };
export const BUCKETS = ['Vadesi gelmemiş', '1–30 gün', '31–60 gün', '61–90 gün', '90+ gün'];
export const MK_STATES = ['Vadesi gelmemiş', '1–30 gün', '31–60 gün', '61–90 gün', '91+ gün'];
const YETERSIZ_KAYIT = 20, YETERSIZ_EKSIK_ALT = 2;

export const DEFAULT_SETTINGS = (): MotorAyarlari => ({
  sector: 'genel', riskTol: 5, sims: 1000, chequeRisk: 3, writeOffDays: 180, anomalyZ: 3.5,
  weights: { likidite: 20, nakit: 25, karlilik: 20, verimlilik: 15, borcluluk: 20 },
});

export function taxDay(ym: string, d: number): string {
  const [y, m] = ikiParca(ym);
  const dim = new Date(y, m, 0).getDate();
  const dt = new Date(y, m - 1, Math.min(d, dim));
  const wd = dt.getDay();
  if (wd === 6) dt.setDate(dt.getDate() + 2);
  if (wd === 0) dt.setDate(dt.getDate() + 1);
  return iso(dt);
}
export interface KdvAyi { ym: string; h: number; i: number; carryIn: number; payable: number; carryOut: number }
export function kdvByMonth(tx: readonly Islem[]): KdvAyi[] {
  const map: Record<string, KdvAyi> = {};
  for (const t of tx) {
    if (!t.kdv || t.np) continue;
    const ym = t.date.slice(0, 7);
    const m = map[ym] = map[ym] ?? { ym, h: 0, i: 0, carryIn: 0, payable: 0, carryOut: 0 };
    if (t.type === 'gelir') m.h += t.amount * t.kdv / 100; else m.i += t.amount * t.kdv / 100;
  }
  const out = Object.values(map).sort((a, b) => (a.ym < b.ym ? -1 : 1));
  let carry = 0;
  for (const m of out) { m.carryIn = carry; const net = m.h - m.i - carry; m.payable = Math.max(0, net); carry = Math.max(0, -net); m.carryOut = carry; }
  return out;
}
export function npv(rate: number, flows: readonly number[]): number { return flows.reduce((a, c, t) => a + c / Math.pow(1 + rate, t), 0); }
export function irr(flows: readonly number[]): number | null {
  let lo = -0.99, hi = 5;
  if (npv(lo, flows) * npv(hi, flows) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo, flows) * npv(mid, flows) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
// Holt doğrusal üstel düzeltme: parametreler ızgara aramasıyla, bir adım ileri hata kareleri toplamını en aza indirerek seçilir.
export interface Ongoru { h: number; v: number; lo: number; hi: number }
export interface SatisModeli {
  alpha: number; beta: number; L: number; T: number; sse: number; fit: number[]; mape: number;
  rmse: number; fc: Ongoru[]; trendPct: number;
  method?: keyof typeof METHOD_NAMES; bt?: SatisKarnesi | null; trendReliable?: boolean;
}
export function holt(y: readonly number[]): SatisModeli | null {
  const n = y.length;
  if (n < 4 || sum(y) <= 0) return null;
  let best: Omit<SatisModeli, 'rmse' | 'fc' | 'trendPct'> | null = null;
  const k0 = Math.min(3, n - 1), T0 = (y[k0]! - y[0]!) / k0;
  for (let a = 0.05; a < 0.96; a += 0.05) for (let b = 0.05; b < 0.96; b += 0.05) {
    let L = y[0]!, T = T0, sse = 0, ape = 0;
    const fit = [y[0]!];
    for (let t = 1; t < n; t++) {
      const f = L + T; fit.push(f);
      const e = y[t]! - f; sse += e * e; ape += y[t] ? Math.abs(e / y[t]!) : 0;
      const Ln = a * y[t]! + (1 - a) * (L + T); T = b * (Ln - L) + (1 - b) * T; L = Ln;
    }
    if (!best || sse < best.sse) best = { alpha: a, beta: b, L, T, sse, fit, mape: ape / (n - 1) };
  }
  const b = best!;
  const rmse = Math.sqrt(b.sse / (n - 1));
  const fc = [1, 2, 3].map((h) => ({ h, v: Math.max(0, b.L + h * b.T), lo: Math.max(0, b.L + h * b.T - 1.2816 * rmse * Math.sqrt(h)), hi: b.L + h * b.T + 1.2816 * rmse * Math.sqrt(h) }));
  return Object.assign(b, { rmse, fc, trendPct: b.L ? b.T / b.L : 0 });
}
function matInv(A: number[][]): number[][] | null {
  const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-12) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const satir = M[c]!, d = satir[c]!;
    for (let j = 0; j < 2 * n; j++) satir[j] = satir[j]! / d;
    for (let r = 0; r < n; r++) if (r !== c) { const sr = M[r]!, f = sr[c]!; for (let j = 0; j < 2 * n; j++) sr[j] = sr[j]! - f * satir[j]!; }
  }
  return M.map((r) => r.slice(n));
}
export function spearman(a: readonly number[], b: readonly number[]): number | null {
  const rank = (v: readonly number[]): number[] => {
    const s = v.map((x, i) => [x, i] as [number, number]).sort((p, q) => p[0] - q[0]), r = new Array<number>(v.length);
    s.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  if (n < 3) return null;
  return 1 - 6 * sum(ra.map((x, i) => (x - rb[i]!) ** 2)) / (n * (n * n - 1));
}

export function emptyStateAt(today: string): MotorDurumu {
  return {
    v: 2, demo: false,
    company: { name: 'Şirketim', openingCash: 0, openingDate: today, threshold: 100000, expSales: 0, expTerm: 30 },
    settings: DEFAULT_SETTINGS(),
    tx: [], cheques: [], recurring: [], budget: {}, revenueTarget: 0, cashChecks: [], setupDone: false,
    balance: { donen: 0, stok: 0, kvb: 0, toplamBorc: 0, ozkaynak: 0, birikmisKar: 0 },
    closing: {}, reco: {}, history: [], serverReport: null,
    scen: { delay: 0, growth: 0, collect: 60, chequeRisk: 3, newBiz: true },
    tools: {
      be: { fixed: 450000, price: 1200, varCost: 780, units: 1300 },
      inv: { cost: 1500000, cash: 520000, years: 5, rate: 30, salvage: 150000 },
      loan: { amount: 1000000, rate: 3.2, months: 24 },
    },
  };
}

export interface Hafta { i: number; start: string; end: string; inflow: number; outflow: number; items: { date: string; amt: number; label: string }[]; open: number; net: number; close: number }
export interface MusteriOzeti {
  party: string | null; sales12: number; paid: { delay: number; term: number; when: string }[]; open: Islem[]; openBal: number; overdueBal: number;
  maxOverdue: number; bounced: number; bouncedAmt: number; chequeBal: number;
  avgDelay: number | null; lateShare: number | null; term: number | null; share: number; score: number; grade: string; delays: number[];
}
export interface AySatiri { ym: string; gelir: number; gider: number; cogs: number; faiz: number; cashIn: number; cashOut: number; byCat: Record<string, number>; amort?: number; net: number }
export interface OranSatiri { id: EsikAdi; k: string; v: number | null; f: (v: number) => string; t: [number, number]; what: string; todo: string; sc: number | null; s: Derece }
export type Bant = Record<'p5' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p95', number>;
export interface Bulgu {
  id: string; sev: number; area: string; title: string; why: string; impact: number | null; actions: string[]; link: string; model: string | null;
}
export interface SatisKarnesi { n: number; mape: Record<'holt' | 'ort3' | 'naif', number | null>; best: 'holt' | 'ort3' | 'naif'; rows: { ym: string; actual: number; holt: number | null; ort3: number | null }[] }

// Motor bir kapanışla kurulur: durum ve "bugün" tek örneğe aittir; testte ve ekranda ayrı örnekler birbirini bozmaz.
export function finansMotoru(baslangic?: string) {
  let TODAY = baslangic ?? iso(new Date());
  let state: MotorDurumu = emptyStateAt(TODAY);
  let stateRev = 0;
  let _cache: { key: string | null; val: Analiz | null } = { key: null, val: null };
  let _btCache: { key: string | null; val: Karne | null } = { key: null, val: null };

  function setToday(d?: string | null): void { TODAY = d || iso(new Date()); }
  const emptyState = (): MotorDurumu => emptyStateAt(TODAY);

  function normalize(s?: Partial<MotorDurumu> | null): MotorDurumu {
    const out = Object.assign(emptyState(), s ?? {});
    out.company = Object.assign(emptyState().company, out.company ?? {});
    out.settings = Object.assign(DEFAULT_SETTINGS(), out.settings ?? {});
    out.settings.weights = Object.assign(DEFAULT_SETTINGS().weights, s?.settings?.weights ?? {});
    if (!SECTORS[out.settings.sector]) out.settings.sector = 'genel';
    out.scen = Object.assign(emptyState().scen, out.scen ?? {});
    out.tools = Object.assign(emptyState().tools, out.tools ?? {});
    out.balance = Object.assign(emptyState().balance, out.balance ?? {});
    for (const k of ['tx', 'cheques', 'recurring', 'history', 'cashChecks'] as const) if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown>)[k] = [];
    for (const k of ['budget', 'closing', 'reco'] as const) if (!out[k] || typeof out[k] !== 'object') (out as unknown as Record<string, unknown>)[k] = {};
    out.v = 2;
    return out;
  }

  /* ---------- Temel hesaplar ---------- */
  function cashToday(): number {
    const c = state.company;
    let cash = Number(c.openingCash) || 0;
    for (const t of state.tx) { if (t.status !== 'odendi' || !t.paidDate || t.paidDate <= c.openingDate || t.paidDate > TODAY) continue; cash += (t.type === 'gelir' ? 1 : -1) * gross(t); }
    for (const q of state.cheques) { if (q.due <= c.openingDate || q.due > TODAY) continue; if (q.dir === 'alinan' && q.status === 'tahsil') cash += q.amount; if (q.dir === 'verilen' && q.status === 'odendi') cash -= q.amount; }
    return cash;
  }
  function monthly(n = 12, endYm = TODAY.slice(0, 7)): AySatiri[] {
    const months: string[] = [];
    for (let i = n - 1; i >= 0; i--) months.push(ymAdd(endYm, -i));
    const rows: AySatiri[] = months.map((ym) => ({ ym, gelir: 0, gider: 0, cogs: 0, faiz: 0, cashIn: 0, cashOut: 0, byCat: {}, net: 0 }));
    const idx: Record<string, number> = Object.fromEntries(rows.map((r, i) => [r.ym, i]));
    for (const t of state.tx) {
      const i = idx[t.date.slice(0, 7)];
      if (i !== undefined && isPnl(t)) {
        const r = rows[i]!;
        if (t.type === 'gelir') r.gelir += t.amount;
        else { r.gider += t.amount; r.byCat[t.cat] = (r.byCat[t.cat] || 0) + t.amount; if (catInfo('gider', t.cat).cogs) r.cogs += t.amount; if (t.cat === 'Finansman (faiz)') r.faiz += t.amount; }
      }
      if (t.status === 'odendi' && t.paidDate) { const j = idx[t.paidDate.slice(0, 7)]; if (j !== undefined) { if (t.type === 'gelir') rows[j]!.cashIn += gross(t); else rows[j]!.cashOut += gross(t); } }
    }
    for (const q of state.cheques) {
      const j = idx[q.due.slice(0, 7)];
      if (j === undefined || q.due > TODAY) continue;
      if (q.dir === 'alinan' && q.status === 'tahsil') rows[j]!.cashIn += q.amount;
      if (q.dir === 'verilen' && q.status === 'odendi') rows[j]!.cashOut += q.amount;
    }
    // Amortisman nakit dışı giderdir: kârı düşer, nakit akışına girmez.
    for (const r of rows) { const a = (state.amort ?? {})[r.ym] || 0; if (a) { r.gider += a; r.amort = a; r.byCat[AMORT] = (r.byCat[AMORT] || 0) + a; } }
    rows.forEach((r) => { r.net = r.gelir - r.gider; });
    return rows;
  }
  const completeMonths = (n: number): AySatiri[] => monthly(n, ymAdd(TODAY.slice(0, 7), -1));
  function openItems(type: IslemTuru): Islem[] { return state.tx.filter((t) => t.type === type && t.status === 'acik'); }
  function aging(type: IslemTuru): { k: string; v: number }[] {
    const b = BUCKETS.map((k) => ({ k, v: 0 }));
    for (const t of openItems(type)) { const late = diffDays(TODAY, t.due), g = gross(t); b[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4]!.v += g; }
    return b;
  }
  function workingDays() {
    const from = addDays(TODAY, -90);
    const sales90 = sum(state.tx.filter((t) => t.type === 'gelir' && real(t) && t.date > from && t.date <= TODAY), gross);
    const purch90 = sum(state.tx.filter((t) => t.type === 'gider' && real(t) && catInfo('gider', t.cat).supplier && t.date > from && t.date <= TODAY), gross);
    const ar = sum(openItems('gelir'), gross) + sum(state.cheques.filter((q) => q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status)), (q) => q.amount);
    const ap = sum(openItems('gider').filter((t) => catInfo('gider', t.cat).supplier), gross) + sum(state.cheques.filter((q) => q.dir === 'verilen' && q.status === 'bekliyor'), (q) => q.amount);
    const dso = sales90 ? ar / sales90 * 90 : 0, dpo = purch90 ? ap / purch90 * 90 : 0;
    const cogs12 = sum(monthly(12), (r) => r.cogs), dio = cogs12 ? (Number(state.balance.stok) || 0) / cogs12 * 365 : 0;
    return { dso, dpo, dio, ccc: dio + dso - dpo, ar, ap, sales90, purch90 };
  }

  // Düzenli ödeme bu ay yapıldı mı? (bağlı kayıt ya da aynı kategoride ±%20 tutarlı bir ödeme)
  function recPaidIn(r: DuzenliOdeme, ym: string): boolean {
    const a = Number(r.amount) || 0;
    return state.tx.some((t) => t.type === 'gider' && t.date.slice(0, 7) === ym && (t.recId === r.id || (!t.recId && t.cat === r.cat && Math.abs(gross(t) - a) <= a * 0.2)));
  }
  type Koy = (date: string, amt: number, label: string) => void;
  // Sabit nakit çıkışları: açık borçlar, verilen çekler, düzenli ödemeler, tahmini KDV.
  function fixedFlows(put: Koy): void {
    for (const t of openItems('gider')) put(t.due < TODAY ? TODAY : t.due, -gross(t), 'Ödeme: ' + t.party);
    for (const q of state.cheques) if (q.dir === 'verilen' && q.status === 'bekliyor' && q.due >= TODAY) put(q.due, -q.amount, 'Verilen ' + q.kind.toLowerCase() + ': ' + String(q.party));
    for (const r of state.recurring) for (let k = 0; k < 4; k++) {
      const ym = ymAdd(TODAY.slice(0, 7), k), d = ym + '-' + pad(Math.min(Number(r.day) || 1, new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate()));
      if (d > TODAY && !recPaidIn(r, ym)) put(d, -(Number(r.amount) || 0), r.name);
    }
    const kd = kdvByMonth(state.tx), kdMap: Record<string, number> = Object.fromEntries(kd.map((m) => [m.ym, m.payable]));
    const recentK = kd.filter((m) => m.ym < TODAY.slice(0, 7)).slice(-3), avgK = recentK.length ? sum(recentK, (m) => m.payable) / recentK.length : 0;
    for (let k = 0; k < 4; k++) {
      const ym = ymAdd(TODAY.slice(0, 7), k), d = taxDay(ym, 28);
      if (d <= TODAY) continue;
      const per = ymAdd(ym, -1);
      if (state.tx.some((t) => t.cat === 'KDV / vergi ödemesi' && t.date.slice(0, 7) === ym)) continue;
      const amt = per < TODAY.slice(0, 7) && kdMap[per] !== undefined ? kdMap[per] : avgK;
      if (amt > 0) put(d, -amt, 'Tahmini KDV (' + ymLong(per) + ')');
    }
  }
  function weekGrid(): Hafta[] {
    const w: Hafta[] = [];
    for (let i = 0; i < 13; i++) w.push({ i, start: addDays(TODAY, i * 7), end: addDays(TODAY, i * 7 + 6), inflow: 0, outflow: 0, items: [], open: 0, net: 0, close: 0 });
    return w;
  }
  const weekIndex = (d: string): number => Math.floor(diffDays(d < TODAY ? TODAY : d, TODAY) / 7);

  // Deterministik senaryo tahmini (Nakit planı > senaryo).
  function forecast(sc: Senaryo = state.scen) {
    const weeks = weekGrid();
    const put: Koy = (date, amt, label) => {
      const i = weekIndex(date);
      if (i > 12) return;
      const w = weeks[i]!;
      if (amt >= 0) w.inflow += amt; else w.outflow += -amt;
      w.items.push({ date: date < TODAY ? TODAY : date, amt, label });
    };
    const delay = Number(sc.delay) || 0, growth = (Number(sc.growth) || 0) / 100, collect = Number(sc.collect) / 100, risk = (Number(sc.chequeRisk) || 0) / 100;
    for (const t of openItems('gelir')) { const overdue = t.due < TODAY; put(overdue ? addDays(TODAY, 14 + delay) : addDays(t.due, delay), gross(t) * (overdue ? collect : 1), 'Tahsilat: ' + t.party); }
    for (const q of state.cheques) if (q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status) && q.due >= TODAY) put(q.due, q.amount * (1 - risk), q.kind + ' tahsili: ' + String(q.party));
    fixedFlows(put);
    if (sc.newBiz) {
      const p = salesProfile();
      const spread = (amt: number, lag: number, sign: number, label: string): void => {
        const acc = new Array<number>(13).fill(0);
        for (let j = 0; j < 13; j++) for (let k = -2; k <= 2; k++) { const t = j + lag + k; if (t >= 0 && t < 13) acc[t] = acc[t]! + amt / 5; }
        acc.forEach((v, i) => {
          if (v <= 0) return;
          const w = weeks[i]!;
          if (sign > 0) w.inflow += v; else w.outflow += v;
          w.items.push({ date: w.start, amt: sign * v, label });
        });
      };
      spread(p.wkSales * (1 + growth), Math.round((p.collectDays + delay) / 7), 1, 'Yeni satışlardan tahsilat (tahmin)');
      spread(p.wkSales * p.varRatio * (1 + growth), Math.round(p.payDays / 7), -1, 'Yeni alımlara ödeme (tahmin)');
    }
    let bal = cashToday();
    const open = bal;
    for (const w of weeks) { w.open = bal; w.net = w.inflow - w.outflow; bal += w.net; w.close = bal; }
    const min = weeks.reduce((a, w) => (w.close < a.close ? w : a), weeks[0]!);
    return { weeks, open, min, end: bal };
  }

  // Siparişten beklenen ödemeler: satın almanın siparişte girdiği plan, KDV hariç tahmin. Nakit planına ayrı satır olarak
  // girer; forecast, Monte Carlo ve skor bunları saymaz. Kuru girilmemiş kalem toplama katılmaz, sayısı ayrıca döner (tutar
  // uydurulmaz). Tutar sunucunun tahminTl'sidir (ödenmiş avans düşülmüş); vadesi geçmiş kalem ödenmiş olabilir, tahmine girmez.
  const siparisTahmini = (o: SiparisKalemi): string | null | undefined => (o.tahminTl !== undefined ? o.tahminTl : o.tutarTl);
  function siparisPlani(liste: readonly SiparisKalemi[] | null | undefined) {
    const weeks = weekGrid().map((w) => ({ i: w.i, tutar: 0, items: [] as { date: string; amt: number; label: string }[] }));
    let kursuz = 0, gecikmis = 0;
    for (const o of liste ?? []) {
      if (o.vade < TODAY) { gecikmis++; continue; }
      const i = weekIndex(o.vade);
      if (i > 12) continue;
      const t = siparisTahmini(o);
      if (t === null || t === undefined) { kursuz++; continue; }
      const tl = Number(t);
      if (!tl) continue;
      const w = weeks[i]!;
      w.tutar += tl;
      w.items.push({ date: o.vade, amt: -tl, label: 'Sipariş ' + (o.siparisNo || '') + ': ' + (o.firmaAdi || '') + ' (KDV hariç tahmin)' });
    }
    return { weeks, toplam: sum(weeks, (w) => w.tutar), kursuz, gecikmis };
  }
  // Siparişler dahil hafta sonu bakiyesi: forecast kapanışından o haftaya kadarki sipariş ödemeleri düşülür.
  function siparisDahilKapanis(f: { weeks: Hafta[] }, sp: { weeks: { tutar: number }[] }): number[] {
    let birikim = 0;
    return f.weeks.map((w, i) => { birikim += sp.weeks[i]!.tutar; return w.close - birikim; });
  }
  // 7 gün içinde siparişten beklenen ödemeler; ana sayfadaki "bu hafta ödenecek" ile aynı pencere.
  function siparisBuHafta(liste: readonly SiparisKalemi[] | null | undefined): { adet: number; tutar: number } {
    const wk = addDays(TODAY, 7);
    const l = (liste ?? []).filter((o) => o.vade >= TODAY && o.vade <= wk && Number(siparisTahmini(o) ?? 1) !== 0);
    return { adet: l.length, tutar: sum(l.filter((o) => siparisTahmini(o) !== null && siparisTahmini(o) !== undefined), (o) => Number(siparisTahmini(o))) };
  }
  // Satış ve tahsilat profili: geçmiş davranıştan çıkarılır.
  function salesProfile() {
    const from84 = addDays(TODAY, -84), from365 = addDays(TODAY, -365);
    const g12 = state.tx.filter((t) => t.type === 'gelir' && real(t) && t.date > from365 && t.date <= TODAY);
    const wkSales = sum(state.tx.filter((t) => t.type === 'gelir' && real(t) && t.date > from84 && t.date <= TODAY), gross) / 12;
    const varG = sum(state.tx.filter((t) => t.type === 'gider' && real(t) && catInfo('gider', t.cat).variable && t.date > from365 && t.date <= TODAY), gross);
    const salesG = sum(g12, gross);
    const paidS = g12.filter((t) => t.status === 'odendi' && t.paidDate);
    const paidP = state.tx.filter((t) => t.type === 'gider' && catInfo('gider', t.cat).variable && t.status === 'odendi' && t.paidDate && t.date > from365);
    const term = g12.length ? mean(g12.map((t) => diffDays(t.due, t.date))) : 30;
    const collectDays = paidS.length ? mean(paidS.map((t) => diffDays(t.paidDate!, t.date))) : term;
    const payDays = paidP.length ? mean(paidP.map((t) => diffDays(t.paidDate!, t.date))) : 30;
    const delays = paidS.map((t) => diffDays(t.paidDate!, t.due));
    // Haftalık satış oynaklığı (son 26 hafta).
    const wk = new Array<number>(26).fill(0);
    for (const t of state.tx) if (t.type === 'gelir') { const d = diffDays(TODAY, t.date); if (d >= 0 && d < 182) { const i = Math.floor(d / 7); wk[i] = wk[i]! + gross(t); } }
    const m = mean(wk), sd = Math.sqrt(mean(wk.map((x) => (x - m) ** 2)));
    // Satış geçmişi 3 aydan azsa kullanıcının girdiği "beklenen aylık satış" varsayımı kullanılır.
    const histMonths = new Set(state.tx.filter((t) => t.type === 'gelir' && real(t) && t.date <= TODAY).map((t) => t.date.slice(0, 7))).size;
    const exp = Number(state.company.expSales) || 0, lowData = histMonths < 3;
    if (lowData && exp > 0) {
      return { wkSales: exp * 1.2 / 4.345, varRatio: salesG ? varG / salesG : 0.35, term: Number(state.company.expTerm) || 30, collectDays: Number(state.company.expTerm) || 30,
        payDays: paidP.length ? payDays : 30, delays, cv: 0.35, grossFactor: 1.2, lowData, assumed: true, histMonths };
    }
    return { wkSales, varRatio: salesG ? varG / salesG : 0.35, term, collectDays, payDays, delays, cv: m ? sd / m : 0.5,
      grossFactor: g12.length ? salesG / sum(g12, (t) => t.amount) : 1.2, lowData, assumed: false, histMonths };
  }
  function taxCalendar(daysAhead = 75): { date: string; name: string; per: string; amount?: number | undefined }[] {
    const ev: { date: string; name: string; per: string; amount?: number | undefined }[] = [];
    const cur = TODAY.slice(0, 7), kd: Record<string, number> = Object.fromEntries(kdvByMonth(state.tx).map((m) => [m.ym, m.payable]));
    for (let k = -1; k <= 3; k++) {
      const ym = ymAdd(cur, k), per = ymAdd(ym, -1), m = Number(ym.slice(5, 7));
      ev.push({ date: taxDay(ym, 25), name: "KDV tevkifatı (2 no'lu) beyanı ve ödemesi", per: ymLong(per) });
      ev.push({ date: taxDay(ym, 26), name: 'Muhtasar ve prim hizmet beyannamesi', per: ymLong(per) });
      ev.push({ date: taxDay(ym, 28), name: 'KDV beyannamesi ve ödemesi', per: ymLong(per), amount: kd[per] });
      if ([2, 5, 8, 11].includes(m)) ev.push({ date: taxDay(ym, 17), name: 'Geçici vergi beyanı ve ödemesi', per: 'Önceki çeyrek' });
      if (m === 4) ev.push({ date: taxDay(ym, 30), name: 'Yıllık kurumlar vergisi beyannamesi', per: 'Önceki yıl' });
      if (m === 3) ev.push({ date: taxDay(ym, 31), name: 'Yıllık gelir vergisi beyannamesi', per: 'Önceki yıl' });
    }
    const lim = addDays(TODAY, daysAhead);
    return ev.filter((e) => e.date >= TODAY && e.date <= lim).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /* ---------- Analiz modelleri ---------- */
  // 1) Müşteri ödeme davranışı ve risk puanı.
  function customerStats() {
    const from = addDays(TODAY, -365), map: Record<string, MusteriOzeti> = {};
    const get = (p: string | null): MusteriOzeti => map[String(p)] = map[String(p)] ?? {
      party: p, sales12: 0, paid: [], open: [], openBal: 0, overdueBal: 0, maxOverdue: 0, bounced: 0, bouncedAmt: 0, chequeBal: 0,
      avgDelay: null, lateShare: null, term: null, share: 0, score: 0, grade: '', delays: [],
    };
    for (const t of state.tx) {
      if (t.type !== 'gelir') continue;
      const c = get(t.party);
      if (real(t) && t.date > from && t.date <= TODAY) c.sales12 += t.amount;
      if (t.status === 'odendi' && t.paidDate && t.date > addDays(TODAY, -540)) c.paid.push({ delay: diffDays(t.paidDate, t.due), term: diffDays(t.due, t.date), when: t.paidDate });
      if (t.status === 'acik') { const g = gross(t), late = diffDays(TODAY, t.due); c.open.push(t); c.openBal += g; if (late > 0) { c.overdueBal += g; c.maxOverdue = Math.max(c.maxOverdue, late); } }
    }
    for (const q of state.cheques) if (q.dir === 'alinan') {
      const c = get(q.party);
      if (q.status === 'karsiliksiz') { c.bounced++; c.bouncedAmt += q.amount; }
      if (['portfoy', 'tahsilde'].includes(q.status)) c.chequeBal += q.amount;
    }
    const totalSales = sum(Object.values(map), (c) => c.sales12);
    const allDelays = Object.values(map).flatMap((c) => c.paid.map((p) => p.delay));
    for (const c of Object.values(map)) {
      // Yakın tarihli ödemelere daha fazla ağırlık (yarı ömür 180 gün).
      let wsum = 0, wdel = 0, lateW = 0;
      for (const p of c.paid) { const w = Math.pow(0.5, diffDays(TODAY, p.when) / 180); wsum += w; wdel += w * Math.max(0, p.delay); if (p.delay > 15) lateW += w; }
      c.avgDelay = wsum ? wdel / wsum : null;
      c.lateShare = wsum ? lateW / wsum : null;
      c.term = c.paid.length ? mean(c.paid.map((p) => p.term)) : null;
      c.share = totalSales ? c.sales12 / totalSales : 0;
      let s = c.paid.length ? 100 : 75;
      if (c.avgDelay !== null) s -= Math.min(40, c.avgDelay * 0.6);
      if (c.lateShare !== null) s -= 25 * c.lateShare;
      s -= Math.min(25, c.maxOverdue * 0.2);
      s -= Math.min(40, c.bounced * 30);
      c.score = clamp(Math.round(s), 0, 100);
      c.grade = c.score >= 80 ? 'A' : c.score >= 65 ? 'B' : c.score >= 45 ? 'C' : 'D';
      c.delays = c.paid.map((p) => p.delay);
    }
    const list = Object.values(map).filter((c) => c.sales12 > 0 || c.openBal > 0 || c.bounced).sort((a, b) => b.openBal - a.openBal || b.sales12 - a.sales12);
    const hhi = sum(list, (c) => (c.share * 100) ** 2);
    return { list, byParty: map, hhi, allDelays, totalSales };
  }

  // 3) Alacak tahsil süreci için yutucu Markov zinciri (Cyert–Davidson–Thompson yaklaşımı).
  function markovAR() {
    const wo = Number(state.settings.writeOffDays) || 180;
    const bucket = (late: number): number => (late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : late <= wo ? 4 : 6);
    const C = Array.from({ length: 5 }, () => new Array<number>(7).fill(0));
    let obs = 0;
    const lastMe = monthEnd(ymAdd(TODAY.slice(0, 7), -1));
    for (const t of state.tx) {
      if (t.type !== 'gelir' || t.status === 'cek' || t.date < addDays(TODAY, -730)) continue;
      let ym = t.date.slice(0, 7);
      for (let guard = 0; guard < 30; guard++) {
        const me = monthEnd(ym), nx = monthEnd(ymAdd(ym, 1));
        if (nx > lastMe && nx > TODAY) break;
        if (t.status === 'odendi' && t.paidDate && t.paidDate <= me) break;
        const s = bucket(diffDays(me, t.due));
        if (s === 6) break;
        const ns = t.status === 'odendi' && t.paidDate && t.paidDate <= nx ? 5 : bucket(diffDays(nx, t.due));
        const satir = C[s]!;
        satir[ns] = satir[ns]! + 1; obs++;
        if (ns >= 5) break;
        ym = ymAdd(ym, 1);
      }
    }
    // Zayıf ön bilgi (Laplace düzeltmesi): her durumdan tahsil ve bir sonraki yaşa geçiş için küçük sahte gözlemler.
    const prior = [[0.5, 0.5, 0, 0, 0, 1, 0], [0, 0, 0.5, 0, 0, 1, 0], [0, 0, 0, 0.5, 0, 0.7, 0.1], [0, 0, 0, 0, 0.5, 0.5, 0.2], [0, 0, 0, 0, 1, 0.3, 0.3]];
    const P = C.map((row, i) => { const r = row.map((v, j) => v + prior[i]![j]!); const s = sum(r); return r.map((v) => v / s); });
    const Q = P.map((r) => r.slice(0, 5)), R = P.map((r) => r.slice(5));
    const IQ = Q.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - v));
    const N = matInv(IQ);
    if (!N) return null;
    const B = N.map((r) => [0, 1].map((k) => sum(r.map((v, j) => v * R[j]![k]!)))) as [number, number][];
    const tAbs = N.map((r) => sum(r));
    const bal = new Array<number>(5).fill(0);
    let written = 0;
    for (const t of openItems('gelir')) { const s = bucket(diffDays(TODAY, t.due)); if (s === 6) written += gross(t); else bal[s] = bal[s]! + gross(t); }
    const loss = sum(bal.map((b, i) => b * B[i]![1])) + written;
    return { P, C, B, N, tAbs, bal, written, loss, collect: sum(bal.map((b, i) => b * B[i]![0])), obs, wo, totalOpen: sum(bal) + written };
  }

  // 4) Monte Carlo nakit simülasyonu (Cash-Flow-at-Risk).
  function monteCarlo(mk: Markov | null, cs: MusteriIstatistigi, hf: SatisModeli | null) {
    const S = state.settings, N = clamp(Number(S.sims) || 1000, 200, 5000), r = rngOf(424242);
    const th = Number(state.company.threshold) || 0, p = salesProfile();
    const base = new Array<number>(13).fill(0);
    fixedFlows((d, a) => { const i = weekIndex(d); if (i <= 12) base[i] = base[i]! + a; });
    const bounce = (Number(S.chequeRisk) || 0) / 100;
    const recv = openItems('gelir').map((t) => {
      const c = cs.byParty[String(t.party)], late = diffDays(TODAY, t.due);
      const bk = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
      const pLoss = late > (mk ? mk.wo : 180) ? 0.9 : mk ? mk.B[bk]![1] : 0.05;
      const own = c && c.delays.length >= 3 ? c.delays : null;
      const pool = own ?? (cs.allDelays.length ? cs.allDelays : [0, 5, 10, 20]);
      return { amt: gross(t), due: t.due, late, pLoss, pool, tail: late > 0 ? pool.filter((v) => v > late) : null };
    });
    const chq = state.cheques.filter((q) => q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status) && q.due >= TODAY);
    const nextMonth = hf && !p.assumed ? hf.fc[0]!.v * p.grossFactor / 4.345 : p.wkSales;
    const wkMean = Math.max(0, nextMonth || p.wkSales), sig = Math.sqrt(Math.log(1 + Math.min(p.cv, 1.5) ** 2));
    const startCash = cashToday();
    const closes = Array.from({ length: 13 }, () => new Float64Array(N)), mins = new Float64Array(N);
    for (let s = 0; s < N; s++) {
      const f = base.slice();
      for (const x of recv) {
        if (r() < x.pLoss * (x.late > 0 ? 1 : 0.6)) continue;
        let d: number;
        if (x.late > 0) d = x.tail!.length ? x.tail![Math.floor(r() * x.tail!.length)]! : x.late + 7 + r() * 35;
        else d = x.pool[Math.floor(r() * x.pool.length)]! + (r() - 0.5) * 6;
        const i = weekIndex(addDays(x.due, Math.round(d)));
        if (i <= 12) f[i] = f[i]! + x.amt;
      }
      for (const q of chq) if (r() >= bounce) { const i = weekIndex(q.due); if (i <= 12) f[i] = f[i]! + q.amount; }
      for (let j = 0; j < 13; j++) {
        const sale = wkMean * Math.exp(sig * randn(r) - sig * sig / 2);
        const lag = p.collectDays + (r() - 0.5) * 21;
        const ci = j + Math.round(lag / 7);
        if (ci <= 12) f[ci] = f[ci]! + sale;
        const pi = j + Math.round((p.payDays + (r() - 0.5) * 10) / 7);
        if (pi <= 12) f[pi] = f[pi]! - sale * p.varRatio;
      }
      let bal = startCash, mn = Infinity;
      for (let i = 0; i < 13; i++) { bal += f[i]!; closes[i]![s] = bal; if (bal < mn) mn = bal; }
      mins[s] = mn;
    }
    const qs = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
    const bands = closes.map((arr) => { const s = Array.from(arr).sort((a, b) => a - b); return Object.fromEntries(qs.map((q) => ['p' + Math.round(q * 100), quantile(s, q)])) as Bant; });
    const ms = Array.from(mins).sort((a, b) => a - b);
    const pNeg = ms.filter((v) => v < 0).length / N, pBelow = ms.filter((v) => v < th).length / N;
    const lo = ms[0]!, hi = ms[ms.length - 1]!, bins = 24, w = (hi - lo) / bins || 1;
    const hist = Array.from({ length: bins }, (_, i) => ({ x: lo + w * (i + 0.5), n: 0 }));
    for (const v of ms) hist[Math.min(bins - 1, Math.floor((v - lo) / w))]!.n++;
    const dipWeek = bands.reduce((a, b, i) => (b.p50 < bands[a]!.p50 ? i : a), 0);
    return { N, bands, pNeg, pBelow, cfar5: quantile(ms, 0.05), cfar10: quantile(ms, 0.10), minP50: quantile(ms, 0.5), hist, dipWeek, startCash, th, wkMean, sig, profile: p };
  }

  // 5) Altman Z'' (özel ve imalat dışı şirketler; gelişmekte olan piyasa sabiti ayrıca gösterilir) ve DuPont.
  function altman(R: Oranlar) {
    const b = state.balance, n = (x: unknown): number => Number(x) || 0;
    const TA = n(b.toplamBorc) + n(b.ozkaynak);
    if (!TA || !n(b.toplamBorc)) return null;
    const x1 = (n(b.donen) - n(b.kvb)) / TA, x2 = n(b.birikmisKar) / TA, x3 = (R.net + R.faiz) / TA, x4 = n(b.ozkaynak) / n(b.toplamBorc);
    const parts = [6.56 * x1, 3.26 * x2, 6.72 * x3, 1.05 * x4], z = sum(parts);
    return { x: [x1, x2, x3, x4], parts, z, zEM: z + 3.25, zone: (z > 2.6 ? 'ok' : z >= 1.1 ? 'warn' : 'risk') as Derece, TA };
  }
  function dupont(R: Oranlar) {
    const b = state.balance, TA = (Number(b.toplamBorc) || 0) + (Number(b.ozkaynak) || 0), E = Number(b.ozkaynak) || 0;
    if (!TA || !E || !R.gelir) return null;
    const m = R.net / R.gelir, at = R.gelir / TA, em = TA / E;
    return { margin: m, turnover: at, multiplier: em, roe: m * at * em };
  }

  // 6) Anomali tespiti: Iglewicz–Hoaglin değiştirilmiş z-puanı ve kayıt bazında IQR kuralı.
  type Anomali =
    | { kind: 'ay'; cat: string; ym: string; value: number; median: number; z: number; diff: number }
    | { kind: 'kayit'; cat: string; id: string; date: string; party: string; value: number; median: number; limit: number };
  function anomalies(): Anomali[] {
    const k = Number(state.settings.anomalyZ) || 3.5, out: Anomali[] = [];
    const months = completeMonths(12);
    if (months.filter((m) => m.gelir || m.gider).length < 6) return out;
    const last = months[11]!, hist = months.slice(0, 11);
    for (const cat of PNL_GIDER) {
      const series = hist.map((m) => m.byCat[cat] || 0), x = last.byCat[cat] || 0;
      if (series.filter((v) => v > 0).length < 5) continue;
      const med = median(series), mad = median(series.map((v) => Math.abs(v - med)));
      const z = mad > 0 ? 0.6745 * (x - med) / mad : (mean(series.map((v) => Math.abs(v - mean(series)))) > 0 ? (x - med) / (1.253314 * mean(series.map((v) => Math.abs(v - mean(series))))) : 0);
      if (Math.abs(z) > k && Math.abs(x - med) > 2000) out.push({ kind: 'ay', cat, ym: last.ym, value: x, median: med, z, diff: x - med });
    }
    const from = addDays(TODAY, -365), recent = addDays(TODAY, -60);
    const byCat: Record<string, Islem[]> = {};
    for (const t of state.tx) if (t.type === 'gider' && isPnl(t) && t.date > from) (byCat[t.cat] = byCat[t.cat] ?? []).push(t);
    for (const [cat, arr] of Object.entries(byCat)) {
      if (arr.length < 8) continue;
      const s = arr.map((t) => t.amount).sort((a, b) => a - b), q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), lim = q3 + 3 * (q3 - q1);
      for (const t of arr) if (t.date > recent && t.amount > lim && q3 > q1) out.push({ kind: 'kayit', cat, id: t.id, date: t.date, party: t.party, value: t.amount, median: median(s), limit: lim });
    }
    return out;
  }

  // 7) Oranlar (sektör eşikleriyle).
  function ratios() {
    const b = state.balance, m = monthly(12), w = workingDays(), T = SECTORS[state.settings.sector]!.t;
    const gelir = sum(m, (r) => r.gelir), gider = sum(m, (r) => r.gider), cogs = sum(m, (r) => r.cogs), faiz = sum(m, (r) => r.faiz), net = gelir - gider, cash = cashToday();
    const n = (x: unknown): number => Number(x) || 0, div = (a: number, c: number): number | null => (c ? a / c : null);
    const satir = (x: Omit<OranSatiri, 'sc' | 's'>): OranSatiri => ({ ...x, sc: null, s: 'neutral' });
    const list: OranSatiri[] = [
      satir({ id: 'cari', k: 'Cari oran', v: div(n(b.donen), n(b.kvb)), f: (v) => nf(v, 2), t: T.cari, what: 'Bir yıl içinde nakde dönecek varlıkların, bir yıl içinde ödenecek borçları kaç kez karşıladığı.', todo: 'Kısa vadeli borçları uzun vadeye yaymayı, atıl stoku eritmeyi ve tahsilatı hızlandırmayı değerlendirin.' }),
      satir({ id: 'asit', k: 'Asit-test oranı', v: div(n(b.donen) - n(b.stok), n(b.kvb)), f: (v) => nf(v, 2), t: T.asit, what: 'Stoklar satılamasa bile kısa vadeli borçların ödenebilme gücü.', todo: 'Likidite stoğa bağımlı. Stok devir hızını artırın, hazır nakit tamponu oluşturun.' }),
      satir({ id: 'nakit', k: 'Nakit oranı', v: div(cash, n(b.kvb)), f: (v) => nf(v, 2), t: T.nakit, what: 'Yalnızca kasa ve bankadaki parayla kısa vadeli borçların ne kadarının ödenebildiği.', todo: 'Nakit tamponu ince. Eşik altına düşülebilecek haftaları önceden planlayın.' }),
      satir({ id: 'de', k: 'Borç / özkaynak', v: div(n(b.toplamBorc), n(b.ozkaynak)), f: (v) => nf(v, 2), t: T.de, what: 'Şirketin ne kadarının borçla, ne kadarının ortak sermayesiyle finanse edildiği.', todo: 'Yeni borç yerine kârın şirkette bırakılmasını veya sermaye artırımını değerlendirin.' }),
      satir({ id: 'marj', k: 'Net kâr marjı (12 ay)', v: div(net, gelir), f: (v) => pct(v), t: T.marj, what: "Her 100 ₺'lik satıştan, tüm giderler sonrası kalan kâr (vergi öncesi).", todo: 'Fiyatlamayı ve en büyük gider kalemlerini Bütçe ekranında gözden geçirin.' }),
      satir({ id: 'brut', k: 'Brüt marj (yaklaşık)', v: div(gelir - cogs, gelir), f: (v) => pct(v), t: T.brut, what: 'Satıştan mal ve hammadde alımları düşüldükten sonra kalan pay; alımlar maliyet kabul edilerek yaklaşık hesaplanır.', todo: 'Tedarikçi fiyatlarını, fire oranlarını ve satış fiyatı güncellemelerini kontrol edin.' }),
      satir({ id: 'dso', k: 'Ortalama tahsil süresi', v: w.dso || null, f: (v) => nf(v) + ' gün', t: T.dso, what: 'Bir satışın paraya dönmesi ortalama kaç gün sürüyor (çekler dahil).', todo: 'Geç ödeyen müşterilere vade kısaltın, teminat isteyin veya erken ödeme iskontosu verin.' }),
      satir({ id: 'ccc', k: 'Nakit dönüşüm süresi', v: w.dio || w.dso ? w.ccc : null, f: (v) => nf(v) + ' gün', t: T.ccc, what: 'Tedarikçiye ödeme yapıldıktan sonra paranın satış yoluyla kasaya dönmesine kadar geçen süre.', todo: 'Stok süresini kısaltmak, tahsilatı hızlandırmak ve tedarikçi vadelerini uzatmak süreyi kısaltır.' }),
      satir({ id: 'faiz', k: 'Faiz karşılama', v: faiz ? (net + faiz) / faiz : null, f: (v) => nf(v, 1) + ' kat', t: T.faiz, what: 'Faiz öncesi kârın faiz giderini kaç kez karşıladığı.', todo: 'Yüksek maliyetli kredileri kapatmayı veya yeniden yapılandırmayı değerlendirin.' }),
    ];
    for (const x of list) { x.sc = scoreOf(x.v, x.t); x.s = gradeOfScore(x.sc); }
    const by = Object.fromEntries(list.map((x) => [x.id, x])) as Record<EsikAdi, OranSatiri>;
    return { list, by, gelir, gider, net, cogs, faiz, w, cash };
  }

  // Operasyonel uyarılar (bu hafta yapılacaklar).
  function alerts(): { s: Derece; t: string; d: string; go: string }[] {
    const a: { s: Derece; t: string; d: string; go: string }[] = [], od = openItems('gelir').filter((t) => t.due < TODAY);
    if (od.length) a.push({ s: 'risk', t: `${od.length} faturanın tahsilatı gecikti`, d: `Toplam ${fmt(sum(od, gross))}. En eskisi ${Math.max(...od.map((t) => diffDays(TODAY, t.due)))} gün gecikmiş.`, go: 'cari' });
    const wk = addDays(TODAY, 7);
    const qOut = state.cheques.filter((q) => q.dir === 'verilen' && q.status === 'bekliyor' && q.due >= TODAY && q.due <= wk);
    const qIn = state.cheques.filter((q) => q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status) && q.due >= TODAY && q.due <= wk);
    if (qOut.length) a.push({ s: 'warn', t: `Bu hafta ${qOut.length} verilen çekin vadesi doluyor`, d: `Hesapta ${fmt(sum(qOut, (q) => q.amount))} bulunmalı.`, go: 'cek' });
    if (qIn.length) a.push({ s: 'ok', t: `Bu hafta ${qIn.length} çek/senet tahsile gelecek`, d: `${fmt(sum(qIn, (q) => q.amount))}. Bankaya tahsile verildiğinden emin olun.`, go: 'cek' });
    const pay = openItems('gider').filter((t) => t.due <= addDays(TODAY, 7));
    if (pay.length) a.push({ s: 'warn', t: `7 gün içinde ${pay.length} tedarikçi ödemesi`, d: `Toplam ${fmt(sum(pay, gross))}.`, go: 'cari' });
    for (const e of taxCalendar(10)) a.push({ s: 'warn', t: e.name, d: `Son gün ${fmtDY(e.date)} (${diffDays(e.date, TODAY)} gün kaldı). Dönem: ${e.per}.`, go: 'vergi' });
    const order: Record<string, number> = { risk: 0, warn: 1, ok: 2 };
    return a.sort((x, y) => order[x.s]! - order[y.s]!);
  }

  /* ---------- Sağlık skoru ve otomatik danışman ---------- */
  // Satış tahmin yöntemi otomatik seçilir: geçmişte bir ay sonrasını en iyi tahmin eden yöntem kullanılır.
  function selectSalesModel(h: SatisModeli | null, ys: readonly number[]): SatisModeli | null {
    if (!h) return null;
    const bt = backtestSales();
    if (!bt || bt.best === 'holt' || bt.n < 4) return Object.assign(h, { method: 'holt' as const, bt });
    const v = bt.best === 'ort3' ? mean(ys.slice(-3)) : ys[ys.length - 1]!, e = bt.mape[bt.best]! * v;
    return Object.assign({}, h, {
      method: bt.best, bt, trendReliable: bt.mape.holt !== null && bt.mape.holt <= bt.mape[bt.best]! * 1.15,
      fc: [1, 2, 3].map((k) => ({ h: k, v, lo: Math.max(0, v - 1.2816 * e * Math.sqrt(k)), hi: v + 1.2816 * e * Math.sqrt(k) })),
    });
  }
  function runAnalysis(force?: boolean): Analiz {
    const key = String(stateRev) + '|' + TODAY + '|' + JSON.stringify(state.settings) + '|' + String(state.company.threshold);
    if (!force && _cache.key === key) return _cache.val!;
    const t0 = Date.now();
    const R = ratios(), cs = customerStats();
    const series = completeMonths(12).map((m) => m.gelir);
    const ys = series.slice(series.findIndex((v) => v > 0) >= 0 ? series.findIndex((v) => v > 0) : 0);
    const hf = selectSalesModel(holt(ys), ys);
    const mk = markovAR();
    const mc = state.tx.length ? monteCarlo(mk, cs, hf) : null;
    const alt = altman(R), dp = dupont(R), an = anomalies(), prof = salesProfile();
    const arTotal = mk ? mk.totalOpen : 0;
    const subs: Record<AltSkorAdi, number | null> = {
      likidite: avgNN([R.by.cari.sc, R.by.asit.sc, R.by.nakit.sc]),
      nakit: mc ? Math.round(100 * (1 - mc.pNeg) * (1 - 0.6 * mc.pBelow)) : null,
      karlilik: avgNN([R.by.marj.sc, R.by.brut.sc, hf ? scoreOf(hf.trendPct, [-0.04, 0.02]) : null]),
      verimlilik: avgNN([R.by.dso.sc, R.by.ccc.sc, mk && arTotal ? scoreOf(mk.loss / arTotal, [0.12, 0.01]) : null]),
      borcluluk: avgNN([R.by.de.sc, R.by.faiz.sc, alt ? scoreOf(alt.z, [0.5, 3.5]) : null]),
    };
    const W = state.settings.weights;
    let ws = 0, tot = 0;
    for (const [k] of SUBS) { const sk = subs[k]; if (sk !== null) { const w = Math.max(0, Number(W[k]) || 0); ws += w; tot += w * sk; } }
    const score = ws ? Math.round(tot / ws) : null;
    const A: Analiz = {
      at: new Date().toISOString(), today: TODAY, R, cs, hf, mk, mc, alt, dp, an, subs, score, grade: score === null ? '—' : gradeName(score), prof,
      findings: [], prelim: false, summary: '', yetersiz: false, yetersizNeden: '', ms: 0,
    };
    A.findings = findings(A);
    A.prelim = !!prof.lowData;
    A.summary = (A.prelim ? 'Ön değerlendirme: kayıt geçmişi 3 aydan az olduğu için skor değişkendir. ' : '') + summarize(A);
    if (A.prelim && A.score !== null) A.grade = 'Ön değerlendirme';
    // Puan hesabı değişmez; az kayıtla ya da boş bilançoyla çıkan puanın yanına yalnız "Yetersiz veri" yazılır.
    const kayitSayisi = state.tx.filter(real).length, eksikAlt = SUBS.filter(([k]) => subs[k] === null).length;
    A.yetersiz = score !== null && (kayitSayisi < YETERSIZ_KAYIT || eksikAlt >= YETERSIZ_EKSIK_ALT);
    A.yetersizNeden = [kayitSayisi < YETERSIZ_KAYIT ? `${kayitSayisi} kayıt var (en az ${YETERSIZ_KAYIT} gerekir)` : '', eksikAlt >= YETERSIZ_EKSIK_ALT ? `${eksikAlt} alt skor hesaplanamadı (bilanço eksik olabilir)` : ''].filter(Boolean).join('; ');
    A.ms = Date.now() - t0;
    _cache = { key, val: A };
    return A;
  }

  function findings(A: Analiz): Bulgu[] {
    const F: Bulgu[] = [], { R, cs, hf, mk, mc, alt, an, prof } = A, S = state.settings, th = Number(state.company.threshold) || 0;
    const add = (id: string, sev: number, area: string, title: string, why: string, impact: number | null, actions: string[], link: string, model: string | null): void => {
      F.push({ id, sev, area, title, why, impact, actions, link, model });
    };
    const sales12g = R.gelir * (prof.grossFactor || 1.2);
    if (!state.tx.length) return F;

    // Nakit
    if (mc) {
      const tol = (Number(S.riskTol) || 5) / 100, dip = mc.bands[mc.dipWeek];
      if (mc.pNeg >= tol) {
        const need = Math.max(0, th - mc.cfar5);
        const risky = cs.list.filter((c) => c.overdueBal > 0).sort((a, b) => b.overdueBal - a.overdueBal).slice(0, 3);
        add('cash-neg', 3, 'Nakit', `Önümüzdeki 13 haftada nakdin eksiye düşme olasılığı ${pct(mc.pNeg, 0)}`,
          `${nf(mc.N)} senaryoluk simülasyonda en kötü %5'lik dilimde en düşük bakiye ${fmt(mc.cfar5)}. Belirlediğiniz risk toleransı ${pct(tol, 0)}.`,
          need, [
            `Şimdiden en az ${fmt(need)} tutarında kredi limiti veya kısa vadeli finansman ayarlayın.`,
            risky.length ? `Gecikmiş tahsilatı öne çekin: ${risky.map((c) => String(c.party) + ' (' + fmt(c.overdueBal) + ')').join(', ')}.` : 'Vadesi yaklaşan alacaklar için müşterileri önceden arayın.',
            `${dip ? fmtD(addDays(TODAY, mc.dipWeek * 7)) : 'En düşük'} haftasından önceki ertelenebilir ödemeleri belirleyin.`], 'nakit', 'mc');
      } else if (mc.pBelow >= 0.25) {
        add('cash-th', 2, 'Nakit', `Nakdin güvenlik eşiğinin altına inme olasılığı ${pct(mc.pBelow, 0)}`,
          `Eşik ${fmt(th)}. Simülasyonun ortanca senaryosunda en düşük nokta ${mc.dipWeek + 1}. hafta (${fmtD(addDays(TODAY, mc.dipWeek * 7))}), ${fmt(dip!.p50)}. Eksiye düşme olasılığı ${pct(mc.pNeg, 1)}.`,
          Math.max(0, th - mc.cfar10), [
            `${mc.dipWeek + 1}. haftadan önce tahsil edilebilecek faturaları önceliklendirin.`,
            'Bu haftadaki büyük tedarikçi ödemelerinde vade uzatımı isteyin.',
            'Portföydeki çeklerden vadesi uygun olanları iskontoya vermeyi değerlendirin.'], 'nakit', 'mc');
      }
      const idle = mc.bands.reduce((a, b) => Math.min(a, b.p10), Infinity) - 1.5 * th;
      if (mc.pBelow < 0.05 && idle > Math.max(200000, th * 0.5)) {
        add('cash-idle', 1, 'Fırsat', `Yaklaşık ${fmtK(idle)} nakit 13 hafta boyunca atıl kalıyor`,
          "Kötümser senaryoda (%10'luk dilim) bile bakiye eşiğin 1,5 katının üzerinde kalıyor.", idle,
          ['Bu tutarı vadeli mevduat, para piyasası fonu veya yüksek maliyetli borcun erken kapatılması için değerlendirin.', 'Tedarikçilerden peşin ödeme iskontosu isteyin; iskonto oranı mevduat getirisinden yüksekse avantajlıdır.'], 'nakit', 'mc');
      }
    }
    // Alacaklar ve müşteriler
    const sektor = SECTORS[S.sector]!;
    const tgt = sektor.t.dso[1];
    if (R.w.dso > tgt + 5) {
      const freed = (R.w.dso - tgt) * sales12g / 365;
      add('dso', R.w.dso > sektor.t.dso[0] ? 3 : 2, 'Alacak', `Tahsil süresi ${nf(R.w.dso)} gün, sektör hedefi ${tgt} gün`,
        `Tahsil süresini hedefe indirmek, yıllık ${fmtK(sales12g)} ciroda yaklaşık ${fmt(freed)} nakdi serbest bırakır (gün farkı × günlük satış).`, freed,
        ['Yeni satışlarda vadeyi 15 gün kısaltın veya 10 günde ödemeye %1–2 iskonto önerin.', 'Vadesi geçen faturalar için 3, 15 ve 30. günlerde otomatik hatırlatma düzeni kurun.', 'D notlu müşterilere yeni sevkiyatı teminat (çek, teminat mektubu) karşılığı yapın.'], 'cari', 'cust');
    }
    const bad = cs.list.filter((c) => (c.grade === 'D' || c.grade === 'C') && c.openBal + c.chequeBal > 0);
    if (bad.length) {
      const expo = sum(bad, (c) => c.openBal + c.chequeBal);
      add('cust-risk', bad.some((c) => c.grade === 'D') ? 3 : 2, 'Alacak', `${bad.length} müşteri yüksek riskli, açık risk ${fmtK(expo)}`,
        bad.slice(0, 4).map((c) => `${String(c.party)}: not ${c.grade}, puan ${c.score}${c.avgDelay !== null ? ', ağırlıklı ort. gecikme ' + nf(c.avgDelay) + ' gün' : ''}${c.bounced ? ', ' + c.bounced + ' karşılıksız çek' : ''}`).join('. ') + '.', expo,
        bad.filter((c) => c.grade === 'D').length
          ? [`${bad.filter((c) => c.grade === 'D').map((c) => c.party).join(', ')} için açık hesap satışı durdurun; peşin veya teminatlı çalışın.`, 'Bu müşterilere kredi limiti tanımlayın ve limit aşımında sevkiyatı onaya bağlayın.', 'Mutabakat yapıp borcu yazılı olarak teyit ettirin; gerekirse ödeme planına bağlayın.']
          : ['Bu müşterilere kredi limiti tanımlayın ve vadeyi kısaltın.', "Ödeme performansını aylık takip edin; not D'ye düşerse teminat isteyin."], 'modeller', 'cust');
    }
    if (cs.hhi > 2500 || (cs.list[0] && cs.list.slice().sort((a, b) => b.share - a.share)[0]!.share > 0.3)) {
      const top = cs.list.slice().sort((a, b) => b.share - a.share)[0]!;
      add('conc', 2, 'Alacak', `Müşteri yoğunlaşması yüksek (HHI ${nf(cs.hhi)})`,
        `En büyük müşteri ${String(top.party)}, son 12 ay satışların ${pct(top.share, 0)}'ini oluşturuyor. HHI 2.500'ün üzeri yüksek yoğunlaşma kabul edilir.`, top.sales12 * (prof.grossFactor || 1.2) / 12,
        ['Bu müşterinin bir aylık ödemesi gecikirse nakde etkisini Senaryo planlayıcıda test edin.', 'Yeni müşteri kazanımı için satış hedefi koyun; tek müşteriye bağımlılık banka kredilendirmesinde de olumsuz değerlendirilir.'], 'modeller', 'cust');
    }
    if (mk && mk.totalOpen > 0 && mk.loss / mk.totalOpen > 0.03) {
      add('ar-loss', mk.loss / mk.totalOpen > 0.08 ? 3 : 2, 'Alacak', `Beklenen alacak kaybı ${fmt(mk.loss)} (açık alacağın ${pct(mk.loss / mk.totalOpen, 1)}'i)`,
        `Markov tahsil modeline göre her yaş grubundaki alacağın batık olma olasılığı geçmiş ödeme davranışından hesaplandı. ${mk.wo} günü aşan ${fmt(mk.written)} doğrudan kayıp sayıldı.`, mk.loss,
        ['Bu tutar kadar şüpheli alacak karşılığı ayırmayı mali müşavirinizle değerlendirin.', `${mk.wo} günü aşan alacaklar için icra veya hukuki takip başlatın.`, '90 günü aşan her alacak için sorumlu kişi ve takip tarihi belirleyin.'], 'modeller', 'markov');
    }
    // Çekler
    for (const q of state.cheques.filter((x) => x.status === 'karsiliksiz')) {
      const left = diffDays(addDays(q.due, 90), TODAY);
      add('chq-' + q.id, left < 30 ? 3 : 2, 'Çek', `${String(q.party)} çeki karşılıksız, ${fmt(q.amount)}`,
        `Çek hamili, karşılıksızlığı öğrendiği tarihten itibaren 3 ay içinde şikâyet hakkını kullanmalıdır. Vade tarihinden sayıldığında yaklaşık ${left > 0 ? String(left) + ' gün kaldı' : 'süre dolmuş olabilir'}.`, q.amount,
        ['Avukatınızla şikâyet ve icra takibi sürecini hemen başlatın.', 'Bu keşideciden alınmış diğer çeklerin vadelerini kontrol edin.', 'Müşterinin notu otomatik olarak düşürüldü; yeni satışları peşine çevirin.'], 'cek', 'cust');
    }
    const chq = state.cheques.filter((q) => q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status)), chqT = sum(chq, (q) => q.amount);
    if (chq.length >= 3) {
      const by: Record<string, number> = {};
      for (const q of chq) by[String(q.party)] = (by[String(q.party)] || 0) + q.amount;
      const [p, v] = Object.entries(by).sort((a, b) => b[1] - a[1])[0]!;
      if (v / chqT > 0.4) add('chq-conc', 1, 'Çek', `Çek portföyünün ${pct(v / chqT, 0)}'i tek keşideciye bağlı`, `${p}: ${fmt(v)}.`, v, ['Bu keşidecinin çeklerini Risk Merkezi üzerinden (bankanız aracılığıyla) sorgulatın.', 'Yeni çek kabulünde keşideci başına üst limit belirleyin.'], 'cek', 'cust');
    }
    // Kârlılık ve satış
    if (hf) {
      const next = hf.fc[0]!;
      if (hf.trendPct < -0.015 && (hf.method === 'holt' || hf.trendReliable)) {
        add('sales-trend', 2, 'Satış', `Satış trendi aylık ${pct(hf.trendPct, 1)} düşüşte`,
          `Holt modeli son 12 ayın seviyesini ${fmt(hf.L)}, aylık eğilimi ${fmt(hf.T)} olarak tahmin ediyor. Gelecek ay beklenen satış ${fmt(next.v)} (%80 aralık ${fmtK(next.lo)}–${fmtK(next.hi)}).`, -hf.T * 3,
          ['Düşüşün kaynağını müşteri bazında inceleyin (Analiz modelleri > müşteri tablosu).', 'Kaybedilen veya azalan müşterilerle görüşme planlayın.', 'Bütçeyi düşük senaryoya göre güncelleyin.'], 'modeller', 'holt');
      }
      const tgtR = Number(state.revenueTarget) || 0;
      if (tgtR && next.hi < tgtR) add('sales-target', 2, 'Satış', 'Gelecek ay satış hedefine ulaşma olasılığı düşük',
        `Hedef ${fmt(tgtR)}, modelin iyimser sınırı bile ${fmt(next.hi)}.`, tgtR - next.v, ['Hedefi gerçekçi düzeye çekin veya hedefe ulaşmak için somut satış aksiyonları tanımlayın.'], 'butce', 'holt');
    }
    const cm = completeMonths(12), r3 = cm.slice(9), p9 = cm.slice(0, 9);
    const m3 = sum(r3, (m) => m.gelir) ? sum(r3, (m) => m.net) / sum(r3, (m) => m.gelir) : null, m9 = sum(p9, (m) => m.gelir) ? sum(p9, (m) => m.net) / sum(p9, (m) => m.gelir) : null;
    if (m3 !== null && m9 !== null && m9 - m3 > 0.05) {
      add('margin-drop', 2, 'Kârlılık', `Net marj son 3 ayda ${nf((m9 - m3) * 100, 1)} puan geriledi`,
        `Önceki 9 ay ortalaması ${pct(m9)}, son 3 ay ${pct(m3)}.`, (m9 - m3) * sum(r3, (m) => m.gelir),
        ['Son 3 ayda en çok artan gider kalemlerini Bütçe ekranında kontrol edin.', 'Maliyet artışlarının satış fiyatlarına yansıtılıp yansıtılmadığını gözden geçirin.'], 'butce', 'ratio');
    }
    if (R.by.marj.s === 'risk') add('margin-low', 3, 'Kârlılık', `Net kâr marjı ${R.by.marj.v === null ? '—' : pct(R.by.marj.v)}, sektör alt sınırının altında`, R.by.marj.what, null, [R.by.marj.todo], 'oran', 'ratio');
    // Bütçe ve anomaliler
    const last = cm[11]!;
    const over: [string, number][] = [];
    for (const [k, b] of Object.entries(state.budget)) if (b > 0 && (last.byCat[k] || 0) > b * 1.1) over.push([k, last.byCat[k]! - b]);
    if (over.length) add('budget', 1, 'Gider', `${ymLong(last.ym)} ayında ${over.length} kalem bütçeyi %10'dan fazla aştı`, over.map(([k, v]) => `${k}: +${fmt(v)}`).join(', ') + '.', sum(over, (o) => o[1]), ['Aşımların kalıcı mı tek seferlik mi olduğunu not edin; kalıcıysa bütçeyi güncelleyin.'], 'butce', 'anom');
    for (const x of an) {
      if (x.kind === 'ay') {
        add('anom-' + x.cat + x.ym, Math.abs(x.z) > 6 ? 2 : 1, 'Gider', `${x.cat} ${ymLong(x.ym)} ayında olağan dışı ${x.diff > 0 ? 'yüksek' : 'düşük'}`,
          `${fmt(x.value)} harcandı; son 11 ayın ortancası ${fmt(x.median)}. Değiştirilmiş z-puanı ${nf(x.z, 1)} (eşik ${S.anomalyZ}).`, Math.abs(x.diff), ['Faturaları kontrol edin: mükerrer kayıt, yanlış kategori veya tek seferlik bir harcama olabilir.'], 'modeller', 'anom');
      } else {
        add('anom-tx-' + x.id, 1, 'Veri', `${x.party} kaydı ${x.cat} kategorisi için olağan dışı büyük`, `${fmtD(x.date)} tarihli ${fmt(x.value)}; bu kategorideki kayıtların ortancası ${fmt(x.median)}.`, x.value - x.median, ['Tutarda yazım hatası (fazla sıfır) olup olmadığını kontrol edin.'], 'islem', 'anom');
      }
    }
    // Borç yapısı
    if (alt && alt.zone !== 'ok') {
      add('altman', alt.zone === 'risk' ? 3 : 2, 'Borç', `Altman Z'' skoru ${nf(alt.z, 2)}: ${alt.zone === 'risk' ? 'sıkıntı bölgesi' : 'gri bölge'}`,
        `Z'' 2,6'nın üzerinde güvenli, 1,1–2,6 arası gri, 1,1'in altında finansal sıkıntı bölgesi kabul edilir. En zayıf bileşen: ${['işletme sermayesi', 'birikmiş kâr', 'faaliyet kârı', 'özkaynak/borç'][alt.parts.indexOf(Math.min(...alt.parts))]!}.`, null,
        ['Kâr dağıtımını sınırlayıp özkaynağı güçlendirin.', 'Kısa vadeli borçları uzun vadeye çevirerek işletme sermayesini artırın.'], 'modeller', 'altman');
    }
    if (R.by.faiz.s === 'risk') add('interest', 2, 'Borç', `Faiz karşılama oranı ${R.by.faiz.f(R.by.faiz.v ?? 0)}`, R.by.faiz.what, R.faiz, [R.by.faiz.todo], 'oran', 'ratio');
    if (R.w.dso - R.w.dpo > 25 && R.w.dpo > 0) {
      add('dpo', 1, 'Fırsat', `Müşterilere ${nf(R.w.dso)} gün vade verip tedarikçilere ${nf(R.w.dpo)} günde ödüyorsunuz`,
        `Aradaki ${nf(R.w.dso - R.w.dpo)} günü şirket kendi nakdiyle finanse ediyor. Tedarikçi vadesini 15 gün uzatmak yaklaşık ${fmt(R.w.purch90 / 90 * 15)} nakit serbest bırakır.`, R.w.purch90 / 90 * 15,
        ['En büyük 2–3 tedarikçiyle vade uzatımı görüşün.', 'Tedarikçi finansmanı veya doğrudan borçlandırma sistemi seçeneklerini bankanıza sorun.'], 'cari', 'ratio');
    }
    // Veri kalitesi ve süreç
    const lastTx = state.tx.reduce((a, t) => (t.date > a ? t.date : a), '');
    if (lastTx && diffDays(TODAY, lastTx) > 14) add('stale', 2, 'Veri', `Son kayıt ${diffDays(TODAY, lastTx)} gün önce`, 'Analizlerin güvenilirliği kayıtların güncelliğine bağlı.', null, ['Son iki haftanın faturalarını ve ödemelerini girin veya CSV ile içe aktarın.'], 'islem', null);
    const prevYm = ymAdd(TODAY.slice(0, 7), -1), done = state.closing[prevYm] ?? {};
    if (Number(TODAY.slice(8, 10)) > 10 && Object.values(done).filter(Boolean).length < 6) add('closing', 1, 'Süreç', `${ymLong(prevYm)} ay sonu kapanışı tamamlanmadı`, 'Banka mutabakatı yapılmadan nakit rakamları sapabilir.', null, ['Süreç ekranındaki kapanış listesini tamamlayın.'], 'surec', null);
    const order = (a: Bulgu, b: Bulgu): number => b.sev - a.sev || (Math.abs(b.impact || 0) - Math.abs(a.impact || 0));
    return F.sort(order);
  }

  function summarize(A: Analiz): string {
    if (A.score === null) return 'Analiz için yeterli veri yok.';
    const top = A.findings.find((f) => f.sev === 3) ?? A.findings[0];
    const weak = SUBS.filter(([k]) => A.subs[k] !== null).sort((a, b) => A.subs[a[0]]! - A.subs[b[0]]!)[0]!;
    return `Genel finansal sağlık ${A.score}/100 (${A.grade}). En zayıf alan ${weak[1].toLowerCase()} (${Math.round(A.subs[weak[0]]!)}).` + (top ? ` Öncelik: ${top.title.charAt(0).toLowerCase() + top.title.slice(1)}.` : '');
  }

  // Sunucu raporu: özet nesne (bildirim ve geçmiş için).
  function compactReport(A: Analiz) {
    return {
      at: A.at, day: TODAY, score: A.score, grade: A.grade, subs: Object.fromEntries(Object.entries(A.subs).map(([k, v]) => [k, v === null ? null : Math.round(v)])),
      cash: Math.round(cashToday()), pNeg: A.mc ? A.mc.pNeg : null, pBelow: A.mc ? A.mc.pBelow : null, minP50: A.mc ? Math.round(A.mc.minP50) : null, summary: A.summary,
      top: A.findings.slice(0, 5).map((f) => ({ id: f.id, sev: f.sev, title: f.title, impact: f.impact })),
    };
  }
  function recordHistory(A: Analiz, src: string): boolean {
    if (A.score === null) return false;
    const h = state.history, ex = h.find((x) => x.d === TODAY);
    const row: SkorGecmisi = { d: TODAY, score: A.score, cash: Math.round(cashToday()), pNeg: A.mc ? +A.mc.pNeg.toFixed(3) : null, minP50: A.mc ? Math.round(A.mc.minP50) : null, src };
    if (ex) { if (ex.score === row.score && ex.cash === row.cash) return false; Object.assign(ex, row); } else h.push(row);
    h.sort((a, b) => (a.d < b.d ? -1 : 1));
    if (h.length > 400) h.splice(0, h.length - 400);
    return true;
  }

  /* ---------- Tahmin karnesi: modeller geçmişe dönük sınanır ----------
     Sistem geçmiş bir tarihe "geri sarılır", o gün bilinenlerle tahmin üretilir ve gerçekleşenle karşılaştırılır. */
  function cashAt(d: string): number {
    const c = state.company;
    let cash = Number(c.openingCash) || 0;
    for (const t of state.tx) { if (t.status !== 'odendi' || !t.paidDate || t.paidDate <= c.openingDate || t.paidDate > d) continue; cash += (t.type === 'gelir' ? 1 : -1) * gross(t); }
    for (const q of state.cheques) { if (q.due <= c.openingDate || q.due > d) continue; if (q.dir === 'alinan' && q.status === 'tahsil') cash += q.amount; if (q.dir === 'verilen' && q.status === 'odendi') cash -= q.amount; }
    return cash;
  }
  // T tarihinde bilinen durum yeniden kurulur: sonradan olan ödemeler ve çek sonuçları silinir.
  function snapshotAt(T: string): MotorDurumu {
    const s = JSON.parse(JSON.stringify(state)) as MotorDurumu;
    const chqBy: Record<string, string[]> = {};
    for (const q of s.cheques) if (q.date !== undefined && q.date <= T) (chqBy[String(q.party)] = chqBy[String(q.party)] ?? []).push(q.date);
    s.tx = s.tx.filter((t) => t.date <= T).map((t) => {
      if (t.status === 'odendi' && t.paidDate != null && t.paidDate > T) { t.status = 'acik'; t.paidDate = null; }
      if (t.status === 'cek' && !(chqBy[t.party] ?? []).some((d) => d >= t.date)) t.status = 'acik';
      return t;
    });
    s.cheques = s.cheques.filter((q) => q.date !== undefined && q.date <= T).map((q) => {
      if (q.dir === 'alinan' && ['tahsil', 'karsiliksiz', 'ciro'].includes(q.status) && q.due > T) q.status = 'portfoy';
      if (q.dir === 'verilen' && q.status === 'odendi' && q.due > T) q.status = 'bekliyor';
      return q;
    });
    s.history = []; s.reco = {}; s.cashChecks = [];
    return s;
  }
  function asOf<T>(T: string, fn: () => T): T {
    const S0 = state, T0 = TODAY, R0 = stateRev, C0 = _cache;
    state = snapshotAt(T); setToday(T); stateRev = -1 - Math.random(); _cache = { key: null, val: null };
    try { return fn(); } finally { state = S0; setToday(T0); stateRev = R0; _cache = C0; }
  }
  function salesCandidates(y: readonly number[]): Record<'holt' | 'ort3' | 'naif', number | null> {
    return {
      holt: y.length >= 4 ? holt(y)?.fc[0]?.v ?? null : null,
      ort3: y.length >= 3 ? mean(y.slice(-3)) : null,
      naif: y.length ? y[y.length - 1]! : null,
    };
  }
  function backtestSales(): SatisKarnesi | null {
    const m = completeMonths(24), first = m.findIndex((r) => r.gelir > 0);
    if (first < 0) return null;
    const y = m.slice(first).map((r) => r.gelir), err: Record<'holt' | 'ort3' | 'naif', number[]> = { holt: [], ort3: [], naif: [] }, rows: SatisKarnesi['rows'] = [];
    for (let k = Math.max(4, 3); k < y.length; k++) {
      const c = salesCandidates(y.slice(0, k));
      for (const key of Object.keys(err) as ('holt' | 'ort3' | 'naif')[]) { const ck = c[key]; if (ck !== null && y[k]! > 0) err[key].push(Math.abs(ck - y[k]!) / y[k]!); }
      rows.push({ ym: m[first + k]!.ym, actual: y[k]!, holt: c.holt, ort3: c.ort3 });
    }
    const mape = Object.fromEntries(Object.entries(err).map(([k, v]) => [k, v.length ? mean(v) : null])) as SatisKarnesi['mape'];
    const avail = (Object.entries(mape) as ['holt' | 'ort3' | 'naif', number | null][]).filter((x): x is ['holt' | 'ort3' | 'naif', number] => x[1] !== null);
    if (!avail.length) return null;
    const best = avail.sort((a, b) => a[1] - b[1])[0]![0];
    return { n: err.holt.length || err.ort3.length, mape, best, rows };
  }
  function backtestCash() {
    const origins = [13, 16, 19, 22, 25, 28].map((w) => addDays(TODAY, -7 * w)).filter((T) => T > addDays(state.company.openingDate, 120));
    const runs: { T: string; actual: number[]; bands: Bant[]; plan: number[]; in80: number; in50: number; errMed: number; errNaive: number; errPlan: number }[] = [];
    for (const T of origins) {
      const pred = asOf(T, () => {
        if (!state.tx.length) return null;
        const s0 = state.settings.sims;
        state.settings.sims = 400;
        const cs = customerStats(), series = completeMonths(12).map((r) => r.gelir), i0 = series.findIndex((v) => v > 0);
        const hf = holt(series.slice(i0 >= 0 ? i0 : 0)), mk = markovAR(), mc = monteCarlo(mk, cs, hf), plan = forecast(emptyState().scen);
        state.settings.sims = s0;
        return { mc, plan: plan.weeks.map((w) => w.close), start: cashToday() };
      });
      if (!pred) continue;
      const actual = pred.mc.bands.map((_, i) => cashAt(addDays(T, i * 7 + 6)));
      const in80 = actual.filter((a, i) => a >= pred.mc.bands[i]!.p10 && a <= pred.mc.bands[i]!.p90).length;
      const in50 = actual.filter((a, i) => a >= pred.mc.bands[i]!.p25 && a <= pred.mc.bands[i]!.p75).length;
      const scale = mean(actual.map(Math.abs)) || 1;
      const errMed = mean(actual.map((a, i) => Math.abs(a - pred.mc.bands[i]!.p50))) / scale;
      const errNaive = mean(actual.map((a) => Math.abs(a - pred.start))) / scale;
      const errPlan = mean(actual.map((a, i) => Math.abs(a - pred.plan[i]!))) / scale;
      runs.push({ T, actual, bands: pred.mc.bands, plan: pred.plan, in80, in50, errMed, errNaive, errPlan });
    }
    if (!runs.length) return null;
    const N = runs.length * 13;
    return { runs, cov80: sum(runs, (r) => r.in80) / N, cov50: sum(runs, (r) => r.in50) / N, errMed: mean(runs.map((r) => r.errMed)), errNaive: mean(runs.map((r) => r.errNaive)), errPlan: mean(runs.map((r) => r.errPlan)) };
  }
  function backtestAR() {
    const T = addDays(TODAY, -180);
    if (T <= addDays(state.company.openingDate, 120)) return null;
    const pred = asOf(T, () => { const mk = markovAR(); if (!mk) return null; return { ids: openItems('gelir').map((t) => t.id), loss: mk.loss, open: mk.totalOpen }; });
    if (!pred || !pred.open) return null;
    let paid = 0, open = 0;
    const byId = Object.fromEntries(state.tx.map((t) => [t.id, t]));
    for (const id of pred.ids) { const t = byId[id]; if (!t) continue; const g = gross(t); if (t.status === 'acik') open += g; else paid += g; }
    const tot = paid + open;
    if (!tot) return null;
    return { T, predLossPct: pred.loss / pred.open, actualOpenPct: open / tot, total: tot, count: pred.ids.length };
  }
  function backtestCustomers() {
    const T = addDays(TODAY, -180);
    if (T <= addDays(state.company.openingDate, 120)) return null;
    const scores: Record<string, number> = asOf(T, () => Object.fromEntries(customerStats().list.filter((c) => c.paid.length >= 2).map((c) => [String(c.party), c.score])));
    const after: Record<string, number[]> = {};
    for (const t of state.tx) if (t.type === 'gelir' && t.status === 'odendi' && t.paidDate != null && t.paidDate > T) (after[t.party] = after[t.party] ?? []).push(Math.max(0, diffDays(t.paidDate, t.due)));
    const parties = Object.keys(scores).filter((p) => (after[p] ?? []).length >= 2);
    if (parties.length < 3) return null;
    const rho = spearman(parties.map((p) => scores[p]!), parties.map((p) => -mean(after[p]!)));
    return { T, rho, n: parties.length, rows: parties.map((p) => ({ party: p, score: scores[p]!, laterDelay: mean(after[p]!) })).sort((a, b) => b.score - a.score) };
  }
  function backtestAll(): Karne {
    const key = String(stateRev) + '|' + TODAY + '|' + JSON.stringify(state.settings);
    if (_btCache.key === key) return _btCache.val!;
    const t0 = Date.now();
    const val: Karne = { cash: backtestCash(), sales: backtestSales(), ar: backtestAR(), cust: backtestCustomers(), ms: 0 };
    val.ms = Date.now() - t0;
    _btCache = { key, val };
    return val;
  }

  // İç tiplere dışarıdan ad verilebilsin diye çıkarım burada sabitlenir.
  type Markov = NonNullable<ReturnType<typeof markovAR>>;
  type MusteriIstatistigi = ReturnType<typeof customerStats>;
  type Oranlar = ReturnType<typeof ratios>;
  interface Analiz {
    at: string; today: string; R: Oranlar; cs: MusteriIstatistigi; hf: SatisModeli | null; mk: Markov | null; mc: ReturnType<typeof monteCarlo> | null;
    alt: ReturnType<typeof altman>; dp: ReturnType<typeof dupont>; an: Anomali[]; subs: Record<AltSkorAdi, number | null>; score: number | null; grade: string;
    prof: ReturnType<typeof salesProfile>; findings: Bulgu[]; prelim: boolean; summary: string; yetersiz: boolean; yetersizNeden: string; ms: number;
  }
  interface Karne {
    cash: ReturnType<typeof backtestCash>; sales: SatisKarnesi | null; ar: ReturnType<typeof backtestAR>; cust: ReturnType<typeof backtestCustomers>; ms: number;
  }

  return {
    get durum(): MotorDurumu { return state; },
    set durum(s: MotorDurumu) { state = s; stateRev++; },
    get bugun(): string { return TODAY; },
    // Durum yerinde değiştiyse önbellek bu çağrıyla düşer.
    degisti(): void { stateRev++; },
    setToday, emptyState, normalize,
    cashToday, monthly, completeMonths, openItems, aging, workingDays, recPaidIn, fixedFlows, forecast, weekIndex,
    siparisPlani, siparisDahilKapanis, siparisBuHafta, salesProfile, taxCalendar,
    customerStats, markovAR, monteCarlo, altman, dupont, anomalies, ratios, alerts,
    runAnalysis, findings, summarize, compactReport, recordHistory,
    cashAt, snapshotAt, asOf, backtestSales, backtestCash, backtestAR, backtestCustomers, backtestAll,
  };
}

export type FinansMotoru = ReturnType<typeof finansMotoru>;
export type Analiz = ReturnType<FinansMotoru['runAnalysis']>;
export type Karne = ReturnType<FinansMotoru['backtestAll']>;
export type NakitPlani = ReturnType<FinansMotoru['forecast']>;
