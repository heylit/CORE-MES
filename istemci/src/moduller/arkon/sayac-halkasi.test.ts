import { describe, expect, it } from 'vitest';
import { halkaPaylari, kalanAdet, sayacGosterimi } from '../../../../arkon/web/src/data/sayac-halkasi.ts';

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

  it('521 2 b: kalan hedefe eksik sağlamdır, hurda kalana girmez: 40 hedefte 38 iyi 2 hurda 2 kalır; aşınca 0, sayı yoksa hedef', () => {
    expect(kalanAdet(40, 38, 2)).toBe(2);
    expect(kalanAdet(50, 40, 4)).toBe(10);
    expect(kalanAdet(50, 52, 4)).toBe(0);
    expect(kalanAdet(50, 0, 0)).toBe(50);
  });

  it('T5: iş yokken hedef ve kalan yoktur, halka boştur; atanmış işte hedef ve kalan işten gelir', () => {
    expect(sayacGosterimi({ empty: true, good: 0, scrap: 0, target: 1 })).toEqual({ hedef: null, kalan: null, iyi: 0, hurda: 0 });
    expect(sayacGosterimi({ good: 10, scrap: 2, target: 40 })).toEqual({ hedef: 40, kalan: 30, iyi: 0.25, hurda: 0.05 });
  });
});
