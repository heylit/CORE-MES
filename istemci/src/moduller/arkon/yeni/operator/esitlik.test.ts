import { beforeAll, describe, expect, it, vi } from 'vitest';
import { sayi, sure } from '../cekirdek/bicim.ts';
import type { Plant } from '../cekirdek/tipler.ts';
import { CAGRI_ASAMALARI, HAZIRLIK_MADDELERI, hazirlikSayisi, ilkParcaKalemleri, ilkParcaKapisi, kontrolTakvimi, siradakiGorev, simgeSec, tonAdi } from './kurallar.ts';
import type { IlkParcaDurumu, Is, Pkg } from './tipler.ts';

// Taşınan hesaplar eski ekranınkiyle aynı sonucu vermeli. Eski modül (operator-parcalar.ts) gerçek haliyle yüklenir; yalnız arayüz,
// çizim ve veri katmanı bağımlılıkları sahtedir. Eski renk değişkeni ton adına, eski simge adı ortak simgeye çevrilip karşılaştırılır.
// Değerler uydurmadır.

const TESIS: Plant = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const VARDIYA_BASI = new Date(2026, 9, 24, 7, 0).getTime();
const SIMDI = VARDIYA_BASI + 3 * 3600e3;
const iki = (n: number) => String(n).padStart(2, '0');
const eskiSure = (s: number) => { const x = Math.max(0, Math.floor(s)); return `${iki(Math.floor(x / 3600))}:${iki(Math.floor(x / 60) % 60)}:${iki(x % 60)}`; };
const eskiSayi = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), DB: { get: async () => undefined }, Bus: {}, Pkg: {}, Folder: {}, Auth: { current: () => null }, Log: { add: () => {} } },
}));
vi.mock('../../../../../../arkon/web/src/app/temel.ts', () => ({
  html: () => null, I: () => null, Fragment: () => null, fmt: eskiSayi, useEffect: () => {}, useState: () => [null, () => {}], useRef: () => ({}),
  useNow: () => 0, useCallback: (f: unknown) => f, useMemo: (f: () => unknown) => f(), ST: {}, CALLS: [], REASONS: [], SCRAPS: [], STEPS0: [], pad: iki, pl: () => ({}),
  alpha: () => '', dur: eskiSure, isPlannedReason: () => false, reasonOf: () => null,
}));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ LS: { get: () => null, set: () => {} }, FEAT: {}, b64bytes: () => new Uint8Array(), loadLib: async () => {}, download: () => {} }));
vi.mock('../../../../../../arkon/web/src/app/ortak-ayarlar.ts', async () => {
  const t = await import('../cekirdek/tesis.ts');
  return {
    PLANT: TESIS, POLICY: { approval: false }, MEU: () => null, ME: () => 'Deneme', can: () => true, canSee: () => true, allowed: () => true, audit: () => {},
    machineOf: (id: string) => t.istasyonBul(TESIS, id), stationList: (h?: boolean) => t.istasyonListesi(TESIS, h), mcOf: (id: string) => t.makineBul(TESIS, id),
    wcOf: (id: string) => t.isMerkeziBul(TESIS, id), userInWc: () => true, APPMODE: { demo: false }, ROLE_L: {}, initials: () => '',
    currentShift: () => ({ s: VARDIYA_BASI }), downNext: () => null, downNow: () => null, downWindows: () => [], oeeCalc: () => null,
  };
});
vi.mock('../../../../../../arkon/web/src/app/teknik-resim.ts', () => ({ methOf: (b: { m?: string; tool?: string }) => b.m || (b.tool === 'CMM' ? 'cmm' : 'man'), BlueprintM: () => null }));
vi.mock('../../../../../../arkon/web/src/app/model-3b.ts', () => ({ Step3D: () => null, processModel: async () => ({}), MODEL_KEYS: [], fileHash: async () => '' }));
vi.mock('../../../../../../arkon/web/src/app/pdf.ts', () => ({ LOOK_KEYS: [], PDF_KEYS: [], RCFG: {}, cfgFix: (c: unknown) => c, cfgSig: () => '' }));
vi.mock('../../../../../../arkon/web/src/app/bilesenler.ts', () => ({ MiniRing: () => null }));
vi.mock('../../../../../../arkon/web/src/app/neden-kaynagi.ts', () => ({ onerileriSuz: () => [] }));
vi.mock('../../../../../../arkon/web/src/app/baslat.ts', () => ({ Brand: () => null, navGo: () => {}, useMob: () => false, useTheme: () => ['dark', () => {}] }));
vi.mock('../../../../../../arkon/web/src/app/gomulu.ts', () => ({ gomuluMu: () => true }));
vi.mock('../../../../../../arkon/web/src/app/cizim-merkezi.ts', () => ({ MerkezRozeti: () => null, MerkezSecici: () => null, merkezVar: () => true, useMerkezUyarilari: () => ({}) }));

// Eski modül tipsizdir.
// Yol değişkendedir: derleyici eski modülü (tipsiz, büyük) bu projede denetlemesin.
let O: any;
const YOL = '../../../../../../arkon/web/src/app/';
beforeAll(async () => {
  O = await import(/* @vite-ignore */ YOL + 'operator-parcalar.ts');
}, 30000);

const PLAN = [
  { id: 1, nom: 'Ø60', tol: '+0.02 / −0.01', min: 59.99, max: 60.02, tool: 'Mikrometre', freq: 'İlk parça', crit: true },
  { id: 2, nom: '25', tol: '±0.1', min: 24.9, max: 25.1, tool: 'CMM', freq: 'Her 50 parça', crit: false },
  { id: 3, nom: 'M8', tol: 'Mastar', min: 0, max: 0, tool: 'Tampon', freq: 'Saatlik', gauge: true },
  { id: 4, nom: '12', tol: '±0.2', min: 11.8, max: 12.2, tool: 'Kumpas', freq: 'Vardiya başı' },
  { id: 5, nom: '8', tol: '±0.2', min: 7.8, max: 8.2, tool: 'Kumpas', freq: 'Son parça' },
];
const paket = (ek: Partial<Pkg> = {}): Pkg => ({
  id: 'pk-1', no: 'IE-1', opType: 'cnc', st: {}, partNo: 'DN-12', part: 'Deneme parça', rev: 'B', op: 'Op 10', machine: 'IST-1',
  target: 120, cycle: 40, due: '', priority: 'normal', material: '', note: '', files: [], primary: '', plan: PLAN.map((b) => ({ ...b })),
  steps: [], status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 10, by: 'Deneme', ...ek,
} as Pkg);
const is = (ek: Partial<Is> = {}): Is => ({
  no: 'IE-1', part: 'Deneme parça', op: 'Op 10', due: '—', urgent: false, target: 120, cycle: 40, state: 'running', good: 0, scrap: 0, meas: {}, pins: [], baseGood: 0,
  pkg: paket(), ...ek,
} as Is);

const TAKIMLI = paket({ rules: { prod: { tools: [{ id: 't1', name: 'T1', life: 30, warnPct: 80 }] } } } as Partial<Pkg>);
const ISLER: Is[] = [
  is({ state: 'queued' }), is({ state: 'setup' }), is({ state: 'running', good: 3 }), is({ state: 'paused', good: 60 }), is({ state: 'stopped' }), is({ state: 'done', good: 120 }),
  is({ state: 'running', good: 55, meas: { 1: { v: 60, ok: true, at: SIMDI - 1, cnt: 0 } } }),
  is({ state: 'running', good: 101, startedAt: SIMDI - 2.5 * 3600e3, meas: { 1: { v: 60, ok: true, at: 1, cnt: 0 }, 2: { v: 25, ok: true, at: 2, cnt: 100 } } }),
  is({ state: 'running', good: 119, meas: { 1: { v: 60, ok: true, at: 1, cnt: 0 }, 4: { v: 12, ok: true, at: SIMDI - 60e3, cnt: 1 } } }),
  is({ state: 'running', good: 10, meas: { 1: { v: 61, ok: false, at: 1, who: 'op' } } }),
  is({ state: 'running', good: 10, pendingReq: 'r1', pendingItems: [1, 2], pendingAt: SIMDI - 95e3 }),
  is({ state: 'running', good: 40, pkg: TAKIMLI, toolsAt: { t1: 5 } }),
  is({ state: 'running', good: 10, lastDecision: { status: 'rejected', bad: 'Ø60', note: 'Deneme', at: 1 } }),
  is({ state: 'running', good: 100, pkg: paket({ plan: [] }) }),
  is({ state: 'running', pkg: paket({ opType: 'kalite', st: { n: 2, ac: 0 }, plan: [] }), sr: { insp: [{ ok: true }, { ok: false }] } }),
  is({ state: 'running', pkg: paket({ opType: 'depo', st: { items: [{ id: 'a' }] }, plan: [] }), good: 1 }),
  is({ state: 'running', pkg: paket({ opType: 'boya', st: { cureMin: 10 }, plan: [] }), sr: { rack: { stage: 'oven', t0: SIMDI - 11 * 60e3, n: 6 } } }),
  { ...is(), empty: true } as Is,
];
const ILKLER: (IlkParcaDurumu | undefined)[] = [undefined, { acik: true, sayilan: 0 }, { acik: true, sayilan: 1 }, { acik: true, sayilan: 3, kararBekleyen: 2 }, { acik: true, yeniden: true, sayilan: 3 }];
const SIRADAKI = is({ no: 'IE-2', part: 'Deneme ikinci', state: 'queued', ready: { mat: true, prog: true } });

describe('A1 kurallar eski hesaplarla aynı', () => {
  it('süre ve sayı biçimi', () => {
    for (const s of [0, 59.9, 61, 3599, 3600, 86399, -5]) expect(sure(s)).toBe(eskiSure(s));
    for (const n of [0, 7, 999, 1000, 1234567, 12.6]) expect(sayi(n)).toBe(eskiSayi(n));
  });

  it('kontrol takvimi, ilk parça kalemleri ve kapısı', () => {
    vi.useFakeTimers({ now: SIMDI });
    let dolu = 0;
    try {
      for (const o of ISLER) {
        const yeni = kontrolTakvimi(o, SIMDI, VARDIYA_BASI);
        const eski = O.dueControls(o, SIMDI);
        expect(yeni).toEqual({ due: eski.due, next: eski.next, who: eski.who, why: eski.why });
        expect(ilkParcaKalemleri(o)).toEqual(O.ilkParcaKalemleri(o));
        expect(ilkParcaKapisi(o)).toEqual(O.firstGate(o));
        if (yeni.due.length) dolu++;
      }
      expect(dolu).toBeGreaterThanOrEqual(5);
    } finally { vi.useRealTimers(); }
  });

  it('"Şimdi" kartı her iş durumunda eskisiyle aynı görevi verir', () => {
    vi.useFakeTimers({ now: SIMDI });
    const basliklar = new Set<string>();
    try {
      for (const o of ISLER) for (const ilk of ILKLER) for (const sira of [null, SIRADAKI]) {
        const D = kontrolTakvimi(o, SIMDI, VARDIYA_BASI);
        const yeni = siradakiGorev(o, D, sira, ilk, SIMDI);
        const eski = O.nextTask(o, O.dueControls(o, SIMDI), sira, ilk);
        const cevir = (g: Record<string, unknown> | null) => (g ? { ...g, tone: tonAdi(g['tone'] as string), icon: simgeSec(g['icon'] as string) } : null);
        expect(yeni).toEqual(cevir(eski));
        if (yeni) basliklar.add(yeni.t.split(' · ')[0]!);
      }
    } finally { vi.useRealTimers(); }
    expect(basliklar.size).toBeGreaterThanOrEqual(15);
  });

  it('hazırlık maddeleri ve çağrı aşamaları', () => {
    expect(HAZIRLIK_MADDELERI.map((x) => [x.k, x.l, x.d])).toEqual(O.READY.map((x: { k: string; l: string; d: string }) => [x.k, x.l, x.d]));
    for (const r of [{}, { mat: true }, { mat: true, tool: true, prog: true, draw: true }, { yok: true }] as Record<string, boolean>[]) expect(hazirlikSayisi({ ready: r })).toBe(O.readyCount({ ready: r }));
    expect([...CAGRI_ASAMALARI]).toEqual(O.CALL_STAGES);
  });
});
