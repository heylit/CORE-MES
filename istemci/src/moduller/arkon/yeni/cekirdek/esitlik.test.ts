import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ayarlariOku } from './ayarlar.ts';
import { oeeHesapla } from './oee.ts';
import { istasyonBul, istasyonListesi, tabletIstasyonu } from './tesis.ts';
import type { Plant, PlannedDown, Role, Shift } from './tipler.ts';
import {
  anlikVardiya, birlesimSuresi, durusGerceklesmeleri, durusPencereleri, siradakiDurus, suankiDurus, vardiyaPencereleri,
} from './vardiya.ts';
import { ilkSayfa, sayfaGorunur, yetkiMatrisi, yetkiVar } from './yetki.ts';

// Taşınan hesaplar eski ekranın hesaplarıyla aynı sonucu vermeli (davranış birebir). Eski modül (arkon/web/src/app/ortak-ayarlar.ts)
// gerçek haliyle yüklenir; yalnız arayüz ve veri katmanı bağımlılıkları sahtedir. Ayarlar iki tarafa aynı sahte depodan okunur.

const kv: Record<string, unknown> = {};
const depolar: Record<string, unknown[]> = {};
let oturumKisisi: { id: string; name: string; role: Role; wcs?: string[]; st?: string | null; sts?: string[] } | null = null;
let istasyonKaydi: string | null = null;
const PLANLI = new Set(['D-07', 'D-08', 'P-1']);

vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: {
    status: () => ({ mode: 'server' }),
    DB: { get: async (_s: string, k: string) => kv[k], all: async (s: string) => depolar[s] ?? [] },
    Auth: { current: () => oturumKisisi },
    Log: { add: () => {} },
  },
}));
vi.mock('../../../../../../arkon/web/src/app/temel.ts', () => ({
  REASONS: [], REASONS0: [], SCRAPS: [], SCRAPS0: [], isPlannedReason: (k: string) => PLANLI.has(k), reasonColor: () => '', setREASONS: () => {}, setSCRAPS: () => {},
}));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ LS: { get: (k: string) => (k === 'station' ? istasyonKaydi : null), set: () => {} } }));
vi.mock('../../../../../../arkon/web/src/app/operator-parcalar.ts', () => ({ beep: () => {} }));
vi.mock('../../../../../../arkon/web/src/app/bakim-raporlar.ts', () => ({ GAUGES: [], setGAUGES: () => {} }));

interface Eski {
  loadCfg(): Promise<void>;
  permsFrom(v: unknown): unknown;
  can(k: string): boolean;
  canSee(h: string): boolean;
  firstPage(): string;
  userInWc(u: unknown, wc: unknown): boolean;
  currentShift(t: number): unknown;
  shiftWindows(f: number, t: number): unknown;
  expandDown(d: PlannedDown, f: number, t: number): unknown;
  downWindows(st: string, f: number, t: number): unknown;
  downNow(st: string, t: number): unknown;
  downNext(st: string, t: number, w?: number): unknown;
  unionMs(l: { s: number; e: number }[], a: number, b: number): number;
  oeeCalc(g: unknown): unknown;
  stationList(all?: boolean): unknown;
  machineOf(id: string): unknown;
  myStation(): string;
  SHIFTS: Shift[]; PLANT: Plant; PERMM: unknown; POLICY: unknown; DOWNS: PlannedDown[]; APPMODE: unknown;
}
const YOL = '../../../../../../arkon/web/src/app/ortak-ayarlar.ts';
let eski: Eski;
beforeAll(async () => { eski = (await import(/* @vite-ignore */ YOL)) as Eski; });

const SA = 3_600_000;
const GUN = 24 * SA;
const gun0 = new Date(2026, 2, 9).getTime();
// Tekrarlanabilir sözde rastgele sayı.
let tohum = 7;
const rastgele = (): number => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; };

const VARDIYALAR: Shift[] = [
  { name: 'A', start: '07:00', end: '15:00', breaks: [{ at: '10:00', min: 15 }, { at: '12:30', min: 30 }] },
  { name: 'B', start: '15:00', end: '23:00', breaks: [{ at: '19:00', min: 30 }] },
  { name: 'C', start: '23:00', end: '07:00', breaks: [{ at: '03:00', min: 30 }] },
];
const TESIS: Plant = {
  wcs: [{ id: 'W1', name: 'Talaşlı' }, { id: 'W2', name: 'Montaj', active: false }],
  sts: [{ id: 'S1', name: 'Torna', wc: 'W1', t: 'cnc' }, { id: 'S2', name: 'Freze', wc: 'W1', t: 'cnc' }, { id: 'S3', name: 'Hat', wc: 'W2', t: 'montaj', active: false }],
  mcs: [{ id: 'M1', name: 'Tezgah', st: 'S1' }, { id: 'M2', name: 'Pasif', st: 'S1', active: false }],
};
const DURUSLAR: PlannedDown[] = [
  { id: 'd1', title: 'Bakım', reason: 'D-07', scope: 'st', target: 'S1', from: gun0 + 9 * SA, to: gun0 + 10 * SA, rep: 'none' },
  { id: 'd2', title: 'Toplantı', reason: 'D-09', scope: 'wc', target: 'W1', from: gun0 - 3 * GUN + 13 * SA, to: gun0 - 3 * GUN + 13.5 * SA, rep: 'daily' },
  { id: 'd3', title: 'Haftalık', reason: 'D-07', scope: 'all', target: '', from: gun0 - 7 * GUN + 16 * SA, to: gun0 - 7 * GUN + 17 * SA, rep: 'weekly', days: [1, 3], until: gun0 + 5 * GUN },
  { id: 'd4', title: 'Kapalı', reason: 'D-07', scope: 'all', target: '', from: gun0, to: gun0 + SA, rep: 'none', active: false },
  // Saniyeli başlangıç: tekrarlar dakika başına yuvarlanır, ilk gün yine sayılır.
  { id: 'd5', title: 'Saniyeli', reason: 'D-08', scope: 'st', target: 'S2', from: gun0 + 11 * SA + 60_500, to: gun0 + 11.5 * SA, rep: 'daily' },
];

function ayarYaz(): void {
  Object.assign(kv, {
    shifts: VARDIYALAR, mode: { demo: true }, plant: TESIS, policy: { idleLock: 10 }, reasons: null, scraps: null,
    perms: { plan: ['page.op', 'page.board'], _known: ['page.op', 'page.board'] }, holidays: { '2026-03-11': { type: 'tatil', name: 'Bayram' } },
  });
  depolar['downs'] = DURUSLAR;
  depolar['gauges'] = [{ id: 'g1', no: 'K-1', type: 'Kumpas', interval: 12, status: 'ok' }];
}

beforeEach(async () => { ayarYaz(); await eski.loadCfg(); });

const kaynak = { DB: { get: async (_s: string, k: string) => kv[k], all: async (s: string) => depolar[s] ?? [] }, status: () => ({ mode: 'server' as const }) };

describe('Taşınan Arkon hesapları eskisiyle aynı', () => {
  it('ayarlar: aynı kayıtlardan aynı vardiya, tesis, yetki, kural ve duruş', async () => {
    const a = await ayarlariOku(kaynak);
    expect(a.vardiyalar).toEqual(eski.SHIFTS);
    expect(a.tesis).toEqual(eski.PLANT);
    expect(a.yetkiler).toEqual(eski.PERMM);
    expect(a.kurallar).toEqual(eski.POLICY);
    expect(a.planliDuruslar).toEqual(eski.DOWNS);
    expect(a.kip).toEqual(eski.APPMODE);
    expect(a.durusNedenleri).toEqual([]);
  });

  it('yetki matrisi, işlem ve sayfa yetkisi, ilk sayfa, iş merkezi', async () => {
    for (const kayitli of [null, {}, { plan: ['page.op'] }, { prep: 'bozuk', _known: ['page.op'] }, { operator: ['page.op', 'page.board'], _known: ['page.op', 'page.board', 'page.plan'] }]) {
      expect(yetkiMatrisi(kayitli)).toEqual(eski.permsFrom(kayitli));
    }
    const a = await ayarlariOku(kaynak);
    for (const role of ['admin', 'plan', 'prep', 'quality', 'lead', 'maint', 'operator'] as Role[]) {
      oturumKisisi = { id: 'k', name: 'Deneme', role, wcs: ['W1'] };
      for (const k of ['page.op', 'page.board', 'page.plan', 'prod.run', 'pkg.edit', 'adm.users', 'q.decide'] as const) expect(yetkiVar(oturumKisisi, a.yetkiler, k)).toBe(eski.can(k));
      for (const s of ['', 'pano', 'planlama', 'hazirlik', 'anomali', 'kalite', 'bakim', 'raporlar', 'cizim', 'ayarlar', 'onizle']) {
        expect(sayfaGorunur(s === '' ? 'operator' : s, oturumKisisi, a.yetkiler)).toBe(eski.canSee(s));
      }
      expect(ilkSayfa(oturumKisisi, a.yetkiler)).toBe(eski.firstPage() === '' ? 'operator' : eski.firstPage());
    }
    oturumKisisi = null;
    expect(yetkiVar(null, a.yetkiler, 'adm.users')).toBe(eski.can('adm.users'));
  });

  it('anlık vardiya ve vardiya pencereleri (gece vardiyası ve tatil dahil)', async () => {
    const a = await ayarlariOku(kaynak);
    // Dakika dakika: vardiya başı ve sonu sınırları da denenir.
    for (let t = gun0 - GUN; t < gun0 + 4 * GUN; t += 60_000) expect(anlikVardiya(t, a.vardiyalar, a.tatiller)).toEqual(eski.currentShift(t));
    for (let i = 0; i < 40; i++) {
      const f = gun0 + Math.floor(rastgele() * 5 * GUN);
      const t = f + Math.floor(rastgele() * 3 * GUN);
      expect(vardiyaPencereleri(f, t, a.vardiyalar, a.tatiller)).toEqual(eski.shiftWindows(f, t));
    }
    expect(anlikVardiya(gun0, [], {})).toMatchObject({ tanimsiz: true, label: 'Vardiya tanımsız' });
    // Sıra da sonuca girer: sınırdaki dakikayı listede önce gelen vardiya alır.
    kv['shifts'] = [...VARDIYALAR].reverse();
    await eski.loadCfg();
    const ters = await ayarlariOku(kaynak);
    for (let t = gun0; t < gun0 + 2 * GUN; t += 60_000) expect(anlikVardiya(t, ters.vardiyalar, ters.tatiller)).toEqual(eski.currentShift(t));
  });

  it('planlı duruş gerçekleşmeleri, istasyon pencereleri, şimdiki ve sıradaki duruş', () => {
    for (const d of DURUSLAR) {
      expect(durusGerceklesmeleri(d, gun0 - GUN, gun0 + 3 * GUN)).toEqual(eski.expandDown(d, gun0 - GUN, gun0 + 3 * GUN));
      for (let i = 0; i < 20; i++) {
        const f = gun0 - 2 * GUN + Math.floor(rastgele() * 6 * GUN);
        const t = f + Math.floor(rastgele() * 2 * GUN);
        expect(durusGerceklesmeleri(d, f, t)).toEqual(eski.expandDown(d, f, t));
      }
    }
    for (const st of ['S1', 'S2', 'S3', 'YOK']) {
      for (let t = gun0 - GUN; t < gun0 + 3 * GUN; t += 47 * 60_000) {
        expect(durusPencereleri(st, t, t + 9 * SA, DURUSLAR, TESIS)).toEqual(eski.downWindows(st, t, t + 9 * SA));
        expect(suankiDurus(st, t, DURUSLAR, TESIS)).toEqual(eski.downNow(st, t));
        expect(siradakiDurus(st, t, DURUSLAR, TESIS)).toEqual(eski.downNext(st, t));
        expect(siradakiDurus(st, t, DURUSLAR, TESIS, 2 * SA)).toEqual(eski.downNext(st, t, 2 * SA));
      }
    }
  });

  it('aralık birleşimi', () => {
    for (let i = 0; i < 200; i++) {
      const l = Array.from({ length: Math.floor(rastgele() * 6) }, () => { const s = Math.floor(rastgele() * 1000); return { s, e: s + Math.floor(rastgele() * 300) - 50 }; });
      const a = Math.floor(rastgele() * 500);
      const b = a + Math.floor(rastgele() * 800);
      expect(birlesimSuresi(l, a, b)).toBe(eski.unionMs(l, a, b));
    }
  });

  it('OEE: aynı olay ve sayımdan aynı sonuç', async () => {
    const a = await ayarlariOku(kaynak);
    const durumlar = ['running', 'setup', 'paused', 'stopped', 'running', 'done'];
    const nedenler = [null, 'D-02', 'D-07', 'P-1', 'is-degisimi', 'X-9'];
    for (let i = 0; i < 60; i++) {
      const from = gun0 + 7 * SA + Math.floor(rastgele() * GUN);
      const to = from + SA + Math.floor(rastgele() * 10 * SA);
      const ev = Array.from({ length: Math.floor(rastgele() * 12) }, () => ({
        at: from - SA + Math.floor(rastgele() * (to - from + 2 * SA)), state: durumlar[Math.floor(rastgele() * durumlar.length)] as string,
        reason: nedenler[Math.floor(rastgele() * nedenler.length)] ?? null,
      }));
      const cn = Array.from({ length: Math.floor(rastgele() * 8) }, () => ({
        kind: rastgele() < 0.8 ? 'good' : 'scrap', delta: Math.floor(rastgele() * 20) - 2, planMs: rastgele() < 0.9 ? 30_000 : 0,
        cycleMs: Math.floor(rastgele() * 60_000), reason: rastgele() < 0.5 ? 'H-01' : null,
      }));
      const windows = rastgele() < 0.3 ? null : vardiyaPencereleri(from, to, a.vardiyalar, a.tatiller);
      const st = rastgele() < 0.5 ? 'S1' : 'S2';
      const yeni = oeeHesapla({ ev, cn, from, to, windows }, {
        planliMi: (k) => PLANLI.has(k ?? ''), durusPencereleri: (f, t) => durusPencereleri(st, f, t, a.planliDuruslar, a.tesis),
      });
      const eskiSonuc = eski.oeeCalc({ ev, cn, from, to, st, ...(windows === null ? {} : { windows }) });
      expect(yeni).toEqual(eskiSonuc);
    }
  });

  it('tesis: istasyon listesi, istasyon bilgisi ve tabletin istasyonu', async () => {
    const a = await ayarlariOku(kaynak);
    expect(istasyonListesi(a.tesis)).toEqual(eski.stationList());
    expect(istasyonListesi(a.tesis, true)).toEqual(eski.stationList(true));
    for (const id of ['S1', 'S3']) expect(istasyonBul(a.tesis, id)).toEqual(eski.machineOf(id));
    expect(istasyonBul(a.tesis, 'YOK')).toMatchObject({ id: 'YOK', l: 'YOK', wc: '', mcs: [] });
    const durumlar: [string | null, { st?: string | null; sts?: string[] } | null][] = [[null, { st: 'S2', sts: [] }], ['S1', { st: 'S2' }], ['S3', { st: null, sts: ['S2'] }], [null, null]];
    for (const [kayit, kisi] of durumlar) {
      istasyonKaydi = kayit;
      oturumKisisi = kisi === null ? null : { id: 'k', name: 'D', role: 'operator', ...kisi };
      expect(tabletIstasyonu(a.tesis, kayit, oturumKisisi)).toBe(eski.myStation());
    }
    oturumKisisi = null;
    istasyonKaydi = null;
  });
});
