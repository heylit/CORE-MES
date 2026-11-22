import { describe, expect, it } from 'vitest';
import { farkParcalari } from './tablo.ts';

describe('tablo: fark rozeti parçaları', () => {
  it('sayı birimiyle bir parça; yazı birleşince aynısı', () => {
    for (const [y, p] of [
      ['4 gün 17 sa 30 dk geç', ['4 gün', '17 sa', '30 dk', 'geç']], ['2 sa erken', ['2 sa', 'erken']], ['tam zamanında', ['tam zamanında']], ['45 dk geç', ['45 dk', 'geç']],
    ] as const) {
      expect(farkParcalari(y)).toEqual(p);
      expect(farkParcalari(y).join(' ')).toBe(y);
    }
  });
});
