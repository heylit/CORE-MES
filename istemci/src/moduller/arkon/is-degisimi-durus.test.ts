import { beforeAll, describe, expect, it, vi } from 'vitest';

// Kullanıcı kararı (soru 33/50): iş değişiminde makine boşta kalırsa geçen süre "İş değişimi" nedeniyle plansız duruştur; makinede
// başka iş sürüyorsa duruş değildir. Vardiya OEE hesabı (oeeCalc) olay akışından ölçülür.
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

interface Olay { at: number; state: string; reason?: string | null; orderNo?: string }
interface OeeSonucu { run: number; stopMs: number; pauseMs: number; stops: number; topReason: string | null; byR: Record<string, { ms: number; n: number }> }
interface Ayar { oeeCalc(girdi: { ev: Olay[]; cn: unknown[]; from: number; to: number; st: string; windows: unknown[] }): OeeSonucu }
const YOL = '../../../../arkon/web/src/app/ortak-ayarlar.ts';
let ayar: Ayar;
beforeAll(async () => { ayar = (await import(/* @vite-ignore */ YOL)) as Ayar; });

const DK = 60_000;
const bas = new Date(2026, 0, 14, 8).getTime();
const an = (dk: number) => bas + dk * DK;
const hesap = (ev: Olay[]) => ayar.oeeCalc({ ev, cn: [], from: bas, to: an(120), st: 'X', windows: [{ s: bas, e: an(120), breaks: [], name: 'A' }] });

describe('İş değişiminde makine boşta kalırsa', () => {
  it('yeni iş başlayana kadar geçen süre İş değişimi nedenli plansız duruştur', () => {
    const c = hesap([
      { at: an(0), state: 'running', orderNo: 'A' },
      { at: an(60), state: 'paused', reason: 'is-degisimi', orderNo: 'A' },
      { at: an(80), state: 'running', orderNo: 'B' },
    ]);
    expect(c.stopMs).toBe(20 * DK);
    expect(c.pauseMs).toBe(0);
    expect(c.stops).toBe(1);
    expect(c.topReason).toBe('is-degisimi');
    expect(c.byR).toEqual({ 'is-degisimi': { ms: 20 * DK, n: 1 } });
  });

  it('makinede yeni iş hemen sürerse duruş sayılmaz; elle duraklatma duraklatma kalır', () => {
    const c = hesap([
      { at: an(0), state: 'running', orderNo: 'A' },
      { at: an(60), state: 'paused', reason: 'is-degisimi', orderNo: 'A' },
      { at: an(60), state: 'running', orderNo: 'B' },
      { at: an(100), state: 'paused', reason: null, orderNo: 'B' },
    ]);
    expect(c.stopMs).toBe(0);
    expect(c.stops).toBe(0);
    expect(c.run).toBe(100 * DK);
    expect(c.pauseMs).toBe(20 * DK);
  });
});
