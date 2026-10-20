import { describe, expect, it } from 'vitest';
import { PALET_GRUPLARI } from './duzenleyici-durumu.ts';
import { MAKINE_CINSI_ADI, makineCinsi } from './kurallar.ts';
import type { MakineCinsi } from './kurallar.ts';
import { PLAN_SIMGELERI } from './plan-simgeleri.tsx';

describe('plan simgeleri', () => {
  it('paletteki her öğenin ve her makine cinsinin simgesi var; çizim -12..12 karesinin içinde', () => {
    const adlar = [...PALET_GRUPLARI.flatMap((g) => g.ogeler.map((o) => o.tur)), ...(Object.keys(MAKINE_CINSI_ADI) as MakineCinsi[]), 'giris', 'model'] as const;
    for (const ad of adlar) {
      const c = PLAN_SIMGELERI[ad];
      expect(c, ad).toBeDefined();
      // Mutlak koordinatlar (M komutundan sonraki ilk çift) karenin içinde.
      for (const m of `${c.cizgi} ${c.vurgu ?? ''}`.matchAll(/M(-?[\d.]+)[ ,]?(-?[\d.]+)/g)) {
        expect(Math.abs(Number(m[1])), `${ad} ${m[0]}`).toBeLessThanOrEqual(12);
        expect(Math.abs(Number(m[2])), `${ad} ${m[0]}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it('makine cinsi 3B gövdeyle aynı kararı verir: tip önce, talaşlıda ad', () => {
    expect(makineCinsi('talasli', 'CNC Torna 2')).toBe('torna');
    expect(makineCinsi('talasli', '5 Eksen işleme')).toBe('bes_eksen');
    expect(makineCinsi('talasli', 'Beş eksen')).toBe('bes_eksen');
    expect(makineCinsi('talasli', 'Dik işleme')).toBe('dik_isleme');
    expect(makineCinsi('markalama', 'Torna yanı lazer')).toBe('lazer');
    expect(makineCinsi('kalite', 'Ölçüm')).toBe('cmm');
  });
});
