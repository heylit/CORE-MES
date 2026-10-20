import { beforeAll, describe, expect, it, vi } from 'vitest';

// Terminal vardiya kuralları: vardiya tanımı yoksa hesap yapılmaz, uydurma vardiyayla OEE çıkmaz.
vi.mock('../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), DB: { get: async () => null, all: async () => [] }, Auth: { current: () => null } },
}));
vi.mock('../../../../arkon/web/src/app/temel.ts', () => ({
  I: () => null, REASONS: [], REASONS0: [], SCRAPS: [], SCRAPS0: [], html: () => null, isPlannedReason: () => false, reasonColor: () => '', setREASONS: () => {}, setSCRAPS: () => {}, useState: () => [null, () => {}],
}));
vi.mock('../../../../arkon/web/src/app/yukleyici.ts', () => ({ LITE: false, LS: { get: () => null, set: () => {} } }));
vi.mock('../../../../arkon/web/src/data/istasyon-sec.ts', () => ({ istasyonSec: () => null }));
vi.mock('../../../../arkon/web/src/app/operator-parcalar.ts', () => ({ beep: () => {} }));
vi.mock('../../../../arkon/web/src/app/neden-kaynagi.ts', () => ({ nedenKaynagi: (_s: boolean, r: unknown) => r ?? [] }));
vi.mock('../../../../arkon/web/src/app/bakim-raporlar.ts', () => ({ GAUGES: [], setGAUGES: () => {} }));

type GunAraliklari = (from: number, to: number, p: Pencere[]) => { d: number; from: number; to: number; pencereler: Pencere[] }[];
interface Pencere { s: number; e: number; name: string; breaks: { s: number; e: number }[] }
interface VardiyaAni { name: string; s: number; e: number; label: string; tanimsiz?: boolean }
interface OeeSonucu { A: number | null; oee: number | null; planned: number; shiftMs: number; run: number }
interface Ayar {
  loadCfg(): Promise<void>;
  setSHIFTS(v: unknown[]): void;
  currentShift(now: number): VardiyaAni;
  shiftWindows(from: number, to: number): Pencere[];
  oeeCalc(girdi: { ev: unknown[]; cn: unknown[]; from: number; to: number; st: string; windows: unknown[] }): OeeSonucu;
}
const YOL = '../../../../arkon/web/src/app/ortak-ayarlar.ts';
const GUN_YOLU = '../../../../arkon/web/src/data/vardiya-gunu.ts';
let ayar: Ayar;
let gunAraliklari: GunAraliklari;
beforeAll(async () => {
  ayar = (await import(/* @vite-ignore */ YOL)) as Ayar;
  gunAraliklari = ((await import(/* @vite-ignore */ GUN_YOLU)) as { gunAraliklari: GunAraliklari }).gunAraliklari;
});

const SA = 3_600_000;
const gun0 = new Date(2026, 0, 14).getTime();
const saat = (gun: number, h: number) => gun + h * SA;

describe('Vardiya tanımsızken terminal', () => {
  it('kayıtlı vardiya yoksa varsayılan vardiya uydurulmaz; uyarı etiketi gelir', async () => {
    await ayar.loadCfg();
    const an = ayar.currentShift(saat(gun0, 10));
    expect(an.tanimsiz).toBe(true);
    expect(an.name).toBe('—');
    expect(an.label).toBe('Vardiya tanımsız');
  });

  it('boş vardiya listesinde pencere yok, planlı süre 0, kullanılabilirlik ve OEE boş (sıfır ya da yüzde yüz uydurulmaz)', () => {
    ayar.setSHIFTS([]);
    const pencereler = ayar.shiftWindows(saat(gun0, 0), saat(gun0, 24));
    expect(pencereler).toEqual([]);
    const c = ayar.oeeCalc({ ev: [{ at: saat(gun0, 8), state: 'running' }], cn: [], from: saat(gun0, 8), to: saat(gun0, 10), st: 'X', windows: pencereler });
    expect(c.planned).toBe(0);
    expect(c.A).toBeNull();
    expect(c.oee).toBeNull();
  });

  it('tanımlı vardiya varsa vardiya dışı saat tanımsız sayılmaz', () => {
    ayar.setSHIFTS([{ name: 'A', start: '06:00', end: '14:00', breaks: [] }]);
    const an = ayar.currentShift(saat(gun0, 18));
    expect(an.tanimsiz).toBe(false);
    expect(an.label).toBe('Vardiya dışı');
  });
});

describe('Gece yarısını aşan vardiya', () => {
  const gece = [{ name: 'C', start: '22:00', end: '06:00', breaks: [{ at: '02:00', min: 30 }] }];

  it('vardiya tek pencere olarak başladığı günden bitiş gününe uzanır', () => {
    ayar.setSHIFTS(gece);
    const p = ayar.shiftWindows(saat(gun0, 0), saat(gun0, 24));
    const buGun = p.find((x) => x.s === saat(gun0, 22));
    expect(buGun?.e).toBe(saat(gun0, 30));
    expect(buGun?.breaks).toEqual([{ s: saat(gun0, 26), e: saat(gun0, 26.5) }]);
    const sabah = ayar.currentShift(saat(gun0, 25));
    expect(sabah.name).toBe('C');
    expect(sabah.s).toBe(saat(gun0, 22));
  });

  it('gün satırları çakışmaz; vardiya tamamen başladığı günün satırındadır, ertesi gün satırı vardiya bitince başlar', () => {
    ayar.setSHIFTS(gece);
    const p = ayar.shiftWindows(saat(gun0, 0), saat(gun0, 72));
    const satirlar = gunAraliklari(saat(gun0, 0), saat(gun0, 72), p);
    expect(satirlar.map((r) => [r.from / SA - gun0 / SA, r.to / SA - gun0 / SA])).toEqual([[0, 30], [30, 54], [54, 72]]);
    expect(satirlar.map((r) => r.pencereler.map((x) => x.s / SA - gun0 / SA))).toEqual([[-2, 22], [46], [70]]);
  });

  it('gündüz vardiyalarında satır takvim günüdür', () => {
    ayar.setSHIFTS([{ name: 'A', start: '06:00', end: '14:00', breaks: [] }]);
    const p = ayar.shiftWindows(saat(gun0, 0), saat(gun0, 48));
    const satirlar = gunAraliklari(saat(gun0, 0), saat(gun0, 48), p);
    expect(satirlar.map((r) => [r.from, r.to])).toEqual([[saat(gun0, 0), saat(gun0, 24)], [saat(gun0, 24), saat(gun0, 48)]]);
  });
});
