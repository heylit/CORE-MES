import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ayarlariOku, type ArkonAyarlari } from '../cekirdek/ayarlar.ts';
import type { Plant, PlannedDown, Shift } from '../cekirdek/tipler.ts';
import { cagrilariTopla, istasyonGorunumu, takvimle, terminCoz, uygunDilimler } from './kurallar.ts';
import { planliNedenMi } from '../cekirdek/ayarlar.ts';

// A3 hesapları eski ekranın hesaplarıyla aynı sonucu vermeli. Eski modül (arkon/web/src/app/pano-planlama.ts) gerçek haliyle yüklenir;
// yalnız arayüz ve veri katmanı bağımlılıkları sahtedir. Ayarlar iki tarafa aynı sahte depodan okunur. Adlar uydurmadır.

const kv: Record<string, unknown> = {};
const depolar: Record<string, unknown[]> = {};
const ESKI = '../../../../../../arkon/web/src/app';

vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: {
    status: () => ({ mode: 'server' }), onStatus: () => () => {},
    DB: { get: async (_s: string, k: string) => kv[k], all: async (s: string) => depolar[s] ?? [] },
    Auth: { current: () => null }, Log: { add: () => {}, query: async () => [] },
  },
}));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ LS: { get: () => null, set: () => {} }, download: () => {} }));
vi.mock('../../../../../../arkon/web/src/app/operator-parcalar.ts', () => ({ beep: () => {}, VardiyaTanimsiz: () => null, pctS: String, PreviewOv: () => null }));
vi.mock('../../../../../../arkon/web/src/app/hazirlik.ts', () => ({ Bus: { send: () => {}, on: () => () => {} }, PSTAT: {}, PlanChip: () => null, apPending: () => false, uidg: () => 'x', DB: {} }));
vi.mock('../../../../../../arkon/web/src/app/baslat.ts', () => ({ Brand: () => null, useTheme: () => ['dark', () => {}], navGo: () => {}, useMob: () => false }));
vi.mock('../../../../../../arkon/web/src/app/istasyonlar.ts', () => ({ OPTYPES: {}, StationSelect: () => null, opOf: () => 'cnc' }));
vi.mock('../../../../../../arkon/web/src/app/teknik-resim.ts', () => ({ methOf: (b: { m?: string; tool?: string }) => b.m || (b.tool === 'CMM' ? 'cmm' : 'man'), BlueprintM: () => null, METH: {} }));
vi.mock('../../../../../../arkon/web/src/app/olcum-aleti-secimi.ts', () => ({ AletSecimi: () => null, olcumAletiBul: () => null, useOlcumAletleri: () => [] }));
vi.mock('../../../../../../arkon/web/src/app/ayarlar-uretim.ts', () => ({}));

interface Eski {
  loadCfg(): Promise<void>;
  callsFrom(r: unknown): unknown;
  stLook(s: string, r: string | null, p: boolean | null): { c: string; l: string };
  parseDue(t: unknown, b?: number): number | null;
  availSlots(st: string, f: number): unknown;
  schedule(st: string, l: { ms: number }[], f: number): unknown;
}
let eski: Eski;
beforeAll(async () => {
  const ayar = (await import(/* @vite-ignore */ `${ESKI}/ortak-ayarlar.ts`)) as { loadCfg(): Promise<void> };
  const pano = (await import(/* @vite-ignore */ `${ESKI}/pano-planlama.ts`)) as Omit<Eski, 'loadCfg'>;
  eski = { ...pano, loadCfg: ayar.loadCfg };
}, 30000);

const SA = 3_600_000;
const GUN = 24 * SA;
const gun0 = new Date(2026, 2, 9).getTime();
let tohum = 11;
const rastgele = (): number => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; };

const VARDIYALAR: Shift[] = [
  { name: 'A', start: '07:00', end: '15:00', breaks: [{ at: '10:00', min: 15 }, { at: '12:30', min: 30 }] },
  { name: 'B', start: '15:00', end: '23:00', breaks: [{ at: '19:00', min: 30 }] },
];
const TESIS: Plant = {
  wcs: [{ id: 'W1', name: 'Talaşlı' }],
  sts: [{ id: 'S1', name: 'Torna', wc: 'W1', t: 'cnc' }, { id: 'S2', name: 'Freze', wc: 'W1', t: 'cnc' }],
  mcs: [{ id: 'M1', name: 'Tezgah', st: 'S1' }],
};
const DURUSLAR: PlannedDown[] = [
  { id: 'd1', title: 'Bakım', reason: 'D-07', scope: 'st', target: 'S1', from: gun0 + 9 * SA, to: gun0 + 10 * SA, rep: 'none' },
  { id: 'd2', title: 'Toplantı', reason: 'D-09', scope: 'wc', target: 'W1', from: gun0 - 3 * GUN + 13 * SA, to: gun0 - 3 * GUN + 13.5 * SA, rep: 'daily' },
  { id: 'd3', title: 'Haftalık', reason: 'D-07', scope: 'all', target: '', from: gun0 - 7 * GUN + 16 * SA, to: gun0 - 7 * GUN + 17 * SA, rep: 'weekly', days: [1, 3], until: gun0 + 9 * GUN },
];
const NEDENLER = [
  { code: 'U-01', l: 'Arıza', cat: 'u' }, { code: 'D-07', l: 'Bakım', cat: 'p' }, { code: 'D-09', l: 'Toplantı', cat: 'p' },
];
const kaynak = { DB: { get: async (_s: string, k: string) => kv[k], all: async (s: string) => depolar[s] ?? [] }, status: () => ({ mode: 'server' as const }) };
let a: ArkonAyarlari;

beforeEach(async () => {
  Object.assign(kv, { shifts: VARDIYALAR, mode: {}, plant: TESIS, policy: {}, reasons: NEDENLER, scraps: [], perms: null, holidays: { '2026-03-11': { type: 'tatil', name: 'Bayram' } } });
  depolar['downs'] = DURUSLAR;
  await eski.loadCfg();
  a = await ayarlariOku(kaynak);
});

describe('A3 hesapları eskisiyle aynı', () => {
  it('çağrılar çağrı başına toplanır; açılışı görülmeyen düşer', () => {
    const ekipler = ['bakim', 'kalite', 'amir'] as const;
    const asamalar = ['open', 'ack', 'esc', 'done', 'cancel'] as const;
    const satirlar = Array.from({ length: 120 }, (_, i) => ({
      cid: `c${i}`, callId: `k${Math.floor(rastgele() * 25)}`, team: ekipler[Math.floor(rastgele() * 3)]!, phase: asamalar[Math.floor(rastgele() * 5)]!,
      at: gun0 + Math.floor(rastgele() * GUN), machine: rastgele() < 0.5 ? 'S1' : 'S2', wc: 'W1', userName: `Kişi ${i % 4}`, note: i % 3 ? null : 'not',
    }));
    expect(cagrilariTopla(satirlar)).toEqual(eski.callsFrom(satirlar));
    expect(cagrilariTopla(null)).toEqual(eski.callsFrom(null));
  });

  it('istasyon durumu adı: planlı duruş, veri yok ve bilinen durumlar', () => {
    for (const durum of ['running', 'stopped', 'paused', 'setup', 'queued', 'done', 'none', 'bilinmeyen']) {
      for (const [neden, planli] of [[null, null], ['D-07', null], ['U-01', false], [null, true]] as const) {
        expect(istasyonGorunumu(durum, neden, planli, (k) => planliNedenMi(a, k)).etiket).toBe(eski.stLook(durum, neden, planli).l);
      }
    }
  });

  it('termin metni aynı zamana çevrilir', () => {
    const taban = gun0 + 10 * SA + 17 * 60_000;
    for (const t of ['', '14:30', '7:05', 'Yarın 16:00', 'yarin 8:00', '05.10', '5/10/27', '05.10.2026 14:00', '2026-10-05', '2026-10-05 14:00', '2026-10-05T09:30', 'bozuk', '31.02', null, 42]) {
      expect(terminCoz(t, taban)).toBe(eski.parseDue(t, taban));
    }
  });

  it('çalışılabilir dilimler ve iş tahmini (mola, planlı duruş, tatil)', () => {
    expect(uygunDilimler('S1', gun0, a).length).toBeGreaterThan(20);
    for (let i = 0; i < 30; i++) {
      const f = gun0 - GUN + Math.floor(rastgele() * 5 * GUN);
      for (const st of ['S1', 'S2', 'S9']) {
        expect(uygunDilimler(st, f, a)).toEqual(eski.availSlots(st, f));
        const isler = Array.from({ length: 6 }, () => ({ ms: Math.floor(rastgele() * 30 * SA) }));
        expect(takvimle(st, isler, f, a)).toEqual(eski.schedule(st, isler, f));
      }
    }
    kv['shifts'] = [];
    return eski.loadCfg().then(async () => {
      const bos = await ayarlariOku(kaynak);
      expect(takvimle('S1', [{ ms: SA }], gun0, bos)).toEqual(eski.schedule('S1', [{ ms: SA }], gun0));
    });
  });
});
