import { describe, expect, it, vi } from 'vitest';

// Terminal açılışı: Arkon ayarları TMI içinde her biri ayrı sunucu isteğidir; birbirini beklemeden gitmeli (kart #728).
const bekleyen: { anahtar: string; coz: (v: unknown) => void; red: (e: unknown) => void }[] = [];
const sor = (anahtar: string) => new Promise((coz, red) => { bekleyen.push({ anahtar, coz, red }); });
vi.mock('../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), DB: { get: (_d: string, k: string) => sor(k), all: (d: string) => sor(d) }, Auth: { current: () => null } },
}));
vi.mock('../../../../arkon/web/src/app/temel.ts', () => ({
  I: () => null, REASONS: [], REASONS0: [], SCRAPS: [], SCRAPS0: [], html: () => null, isPlannedReason: () => false, reasonColor: () => '', setREASONS: () => {}, setSCRAPS: () => {}, useState: () => [null, () => {}],
}));
vi.mock('../../../../arkon/web/src/app/yukleyici.ts', () => ({ LITE: false, LS: { get: () => null, set: () => {} } }));
vi.mock('../../../../arkon/web/src/data/istasyon-sec.ts', () => ({ istasyonSec: () => null }));
vi.mock('../../../../arkon/web/src/app/operator-parcalar.ts', () => ({ beep: () => {} }));
vi.mock('../../../../arkon/web/src/app/neden-kaynagi.ts', () => ({ nedenKaynagi: (_s: boolean, r: unknown) => r ?? [] }));
vi.mock('../../../../arkon/web/src/app/bakim-raporlar.ts', () => ({ GAUGES: [], setGAUGES: () => {} }));

// Yol değişkenle verilir: istemci tip denetimi Arkon'un gevşek kipte derlenen ekran kodunu izlemesin.
const YOL = '../../../../arkon/web/src/app/ortak-ayarlar.ts';
const ayar = (await import(/* @vite-ignore */ YOL)) as { loadCfg(): Promise<void>; POLICY: { idleLock: number } };

describe('Arkon ayar yükleme', () => {
  it('on okuma birlikte başlar; biri hata verse de ötekiler uygulanır', async () => {
    const bitti = ayar.loadCfg();
    await Promise.resolve();
    expect(bekleyen.map((b) => b.anahtar)).toEqual(['shifts', 'mode', 'plant', 'perms', 'policy', 'reasons', 'scraps', 'downs', 'gauges', 'holidays']);
    for (const b of bekleyen) {
      if (b.anahtar === 'plant') b.red(new Error('ağ'));
      else b.coz(b.anahtar === 'policy' ? { idleLock: 7 } : null);
    }
    await bitti;
    const { POLICY } = (await import(/* @vite-ignore */ YOL)) as { POLICY: { idleLock: number } };
    expect(POLICY.idleLock).toBe(7);
  });
});
