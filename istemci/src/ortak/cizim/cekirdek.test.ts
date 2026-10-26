import { describe, expect, it } from 'vitest';
import { AKStep, AKTol } from './cekirdek.ts';

// Çekirdek kopyalanmaz: yüklenen nesne eski ekranın kullandığı nesnenin kendisidir.
// Yol değişkenle verilir: tip denetimi eski çekirdeği (sıkı ayarla yazılmamış) kendi kapsamına almasın.
const CORE = './cekirdek/';

describe('A5 çekirdek yükleyici', () => {
  it('tol ve stepdraw eski dosyanın dışa verdiği nesnedir', async () => {
    const tol = await import(/* @vite-ignore */ `${CORE}tol.ts`) as { AKTol: unknown };
    const step = await import(/* @vite-ignore */ `${CORE}stepdraw.ts`) as { AKStep: unknown };
    expect(AKTol).toBe(tol.AKTol);
    expect(AKStep).toBe(step.AKStep);
    expect(AKTol.parse('Ø40 H7', { cls: 'm' })?.tool).toBeTruthy();
  });
});
