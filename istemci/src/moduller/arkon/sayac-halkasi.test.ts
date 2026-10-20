import { describe, expect, it } from 'vitest';
import { halkaPaylari, kalanAdet } from '../../../../arkon/web/src/data/sayac-halkasi.ts';

describe('Arkon terminal halkası', () => {
  it('hurda adete oranla çizilir: 50 parçada 1 iyi 4 hurda halkanın %2 ve %8\'i', () => {
    expect(halkaPaylari(1, 4, 50)).toEqual({ iyi: 0.02, hurda: 0.08 });
  });

  it('iyi ve hurda birlikte halkayı aşmaz; hedef yoksa halka boş', () => {
    const dolu = halkaPaylari(45, 10, 50);
    expect(dolu.iyi).toBe(0.9);
    expect(dolu.hurda).toBeCloseTo(0.1, 9);
    expect(halkaPaylari(60, 3, 50)).toEqual({ iyi: 1, hurda: 0 });
    expect(halkaPaylari(5, 1, 0)).toEqual({ iyi: 0, hurda: 0 });
  });

  it('kalan adet işlenen parçadan: 50 parçada 40 iyi 4 hurda 6 kalır; aşınca 0, sayı yoksa hedef', () => {
    expect(kalanAdet(50, 40, 4)).toBe(6);
    expect(kalanAdet(50, 48, 4)).toBe(0);
    expect(kalanAdet(50, 0, 0)).toBe(50);
  });
});
