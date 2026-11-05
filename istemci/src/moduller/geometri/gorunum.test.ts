import { describe, expect, it } from 'vitest';
import { PATLATMA_KATI, patlatmaKaymasi } from './gorunum.ts';

describe('patlatmaKaymasi (2139)', () => {
  it('sıfır oranda parça yerinde kalır', () => {
    expect(patlatmaKaymasi([40, 20, 4], [0, 0, 6], 0)).toEqual([0, 0, 0]);
  });
  it('parça merkezden dışa, uzaklıkla orantılı kayar', () => {
    const [x, y, z] = patlatmaKaymasi([40, -20, 4], [0, 0, 6], 0.5);
    expect([x, y, z]).toEqual([40 * 0.5 * PATLATMA_KATI, -20 * 0.5 * PATLATMA_KATI, -2 * 0.5 * PATLATMA_KATI]);
  });
  it('merkezdeki parça kaymaz; oran 0-1 dışına çıkmaz', () => {
    expect(patlatmaKaymasi([0, 0, 6], [0, 0, 6], 1)).toEqual([0, 0, 0]);
    expect(patlatmaKaymasi([10, 0, 0], [0, 0, 0], 5)).toEqual([10 * PATLATMA_KATI, 0, 0]);
    expect(patlatmaKaymasi([10, 0, 0], [0, 0, 0], -1)).toEqual([0, 0, 0]);
  });
});
