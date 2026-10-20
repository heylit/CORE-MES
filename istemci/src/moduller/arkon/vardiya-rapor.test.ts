import { beforeAll, describe, expect, it, vi } from 'vitest';

// Rapor ve terminal hesabı gerçek modüllerle; yalnız veri kaynağı sahte.
vi.mock('../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), DB: { get: async () => null, all: async () => [] }, Auth: { current: () => null }, Log: { on: () => () => {}, query: async () => [] } },
}));

vi.mock('../../../../arkon/web/src/app/baslat.ts', () => ({}));
vi.mock('../../../../arkon/web/src/app/bilesenler.ts', () => ({}));

interface Gun { d: number; planned: number; good: number; A: number | null; oee: number | null }
interface Rapor { days: Gun[]; tot: { planned: number; A: number | null; oee: number | null } }
interface Hesap { A: number | null; oee: number | null; planned: number; expected: number | null }
interface Ayar { setSHIFTS(v: unknown[]): void; setPLANT(v: unknown): void; currentShift(now: number): { s: number; e: number; breaks: unknown[]; name: string; label: string; tanimsiz?: boolean } }
interface Raporlar { reportCalc(d: unknown, f: unknown): Rapor }
interface Parcalar { shiftCalc(d: unknown, now: number): Hesap }
const yol = (ad: string) => `../../../../arkon/web/src/app/${ad}.ts`;
let ayar: Ayar;
let raporlar: Raporlar;
let parcalar: Parcalar;
beforeAll(async () => {
  ayar = (await import(/* @vite-ignore */ yol('ortak-ayarlar'))) as Ayar;
  raporlar = (await import(/* @vite-ignore */ yol('bakim-raporlar'))) as Raporlar;
  parcalar = (await import(/* @vite-ignore */ yol('operator-parcalar'))) as Parcalar;
});

const SA = 3_600_000;
const gun0 = new Date(2026, 0, 14).getTime();
const saat = (h: number) => gun0 + h * SA;
const istasyon = { sts: [{ id: 'ST-1', name: 'Deneme', wc: 'WC' }], wcs: [{ id: 'WC', name: 'Atölye' }], mcs: [] };
const veri = (bas: number, bit: number) => ({
  ev: [{ at: bas, state: 'running', machine: 'ST-1' }], cn: [] as unknown[], calls: [], pk: [], mt: [], from: bas, to: bit, now: bit,
});

describe('Vardiya tanımsızken rapor ve terminal hesabı', () => {
  it('rapor planlı süre ve OEE üretmez', () => {
    ayar.setPLANT(istasyon);
    ayar.setSHIFTS([]);
    const r = raporlar.reportCalc(veri(saat(0), saat(48)), { wc: '', st: '', shf: '' }) as Rapor & { per: { c: { A: number | null; oee: number | null; planned: number } }[] };
    expect(r.tot.planned).toBe(0);
    expect(r.tot.A).toBeNull();
    expect(r.tot.oee).toBeNull();
    expect(r.per[0]?.c.A).toBeNull();
    expect(r.days.every((g) => g.A === null && g.oee === null)).toBe(true);
  });

  it('terminalin vardiya hesabı OEE, planlı süre ve beklenen adet üretmez', () => {
    ayar.setSHIFTS([]);
    const sh = ayar.currentShift(saat(10));
    const c = parcalar.shiftCalc({ sh, ev: [{ at: sh.s, state: 'running' }], cn: [{ at: saat(9), kind: 'good', delta: 5, planMs: 60_000 }], machine: 'ST-1' }, saat(10));
    expect(sh.tanimsiz).toBe(true);
    expect(c.planned).toBe(0);
    expect(c.A).toBeNull();
    expect(c.oee).toBeNull();
    expect(c.expected).toBeNull();
  });

  it('tanımlı vardiyada terminal hesabı eskisi gibi çalışır', () => {
    ayar.setSHIFTS([{ name: 'A', start: '06:00', end: '14:00', breaks: [] }]);
    const sh = ayar.currentShift(saat(10));
    const c = parcalar.shiftCalc({ sh, ev: [{ at: saat(6), state: 'running' }], cn: [], machine: 'ST-1' }, saat(10));
    expect(c.planned).toBe(4 * SA);
    expect(c.A).toBe(1);
  });
});

describe('Gece yarısını aşan vardiya raporu', () => {
  it('vardiya başladığı günün satırına bütün olarak yazılır; toplam değişmez', () => {
    ayar.setPLANT(istasyon);
    ayar.setSHIFTS([{ name: 'C', start: '22:00', end: '06:00', breaks: [{ at: '02:00', min: 30 }] }]);
    const r = raporlar.reportCalc(veri(saat(0), saat(72)), { wc: '', st: '', shf: '' });
    expect(r.days.map((g) => g.planned / SA)).toEqual([13, 7.5, 2]);
    expect(r.tot.planned / SA).toBe(22.5);
  });

  it('gece vardiyasındaki sayım başladığı günün satırına girer', () => {
    ayar.setPLANT(istasyon);
    ayar.setSHIFTS([{ name: 'C', start: '22:00', end: '06:00', breaks: [] }]);
    const d = veri(saat(0), saat(72));
    d.cn = [{ at: saat(23), machine: 'ST-1', kind: 'good', delta: 3 }, { at: saat(27), machine: 'ST-1', kind: 'good', delta: 4 }, { at: saat(40), machine: 'ST-1', kind: 'good', delta: 5 }];
    const r = raporlar.reportCalc(d, { wc: '', st: '', shf: '' });
    expect(r.days.map((g) => g.good)).toEqual([7, 5, 0]);
  });
});
