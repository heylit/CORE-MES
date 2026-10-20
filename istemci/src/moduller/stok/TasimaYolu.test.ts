import { describe, expect, it } from 'vitest';
import { tasimaYolu } from './TasimaYolu.tsx';

const ZEMIN = {
  bolumler: [{ salonId: 1, kod: 'S1', sutunlar: ['A', 'B', 'C', 'D'], satirlar: ['1', '2', '3'] }, { salonId: 2, kod: 'S2', sutunlar: ['A'], satirlar: ['1'] }],
  istasyonlar: [{ istasyonId: 1, salonId: 1, hucre: 'A1' }, { istasyonId: 2, salonId: 1, hucre: 'D3' }, { istasyonId: 3, salonId: 2, hucre: 'A1' }],
  konumlar: [{ konumId: 7, salonId: 1, hucre: 'A1' }],
};

describe('taşıma yolu (#1304)', () => {
  it('L biçimli yol: satır arası koridordan geçer; nokta yol boyunca ilerler', () => {
    const y = tasimaYolu(ZEMIN, { istasyonId: 1 }, { istasyonId: 2 })!;
    expect(y.d).toBe('M 15 15 L 15 25 L 45 25 L 45 35');
    expect(y.uzunluk).toBe(50);
    expect(y.nokta(0)).toEqual({ x: 15, y: 15 });
    expect(y.nokta(0.5)).toEqual({ x: 30, y: 25 });
    expect(y.nokta(1)).toEqual({ x: 45, y: 35 });
  });

  it('ayrı bölüm, aynı kare, bilinmeyen yer ya da zeminsiz harita yol vermez', () => {
    expect(tasimaYolu(ZEMIN, { istasyonId: 1 }, { istasyonId: 3 })).toBeNull();
    expect(tasimaYolu(ZEMIN, { istasyonId: 1 }, { konumId: 7 })).toBeNull();
    expect(tasimaYolu(ZEMIN, { istasyonId: 1 }, { konumId: 99 })).toBeNull();
    expect(tasimaYolu(null, { istasyonId: 1 }, { istasyonId: 2 })).toBeNull();
  });
});
