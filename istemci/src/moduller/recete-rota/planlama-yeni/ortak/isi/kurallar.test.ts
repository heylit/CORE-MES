import { describe, expect, it } from 'vitest';
import { hucreBos, hucreKoy, kisaSure, oranKademesi, saatKademesi, type IsiHucresi } from './kurallar.ts';

describe('ısı haritası yardımcıları (zz30-isi)', () => {
  it('saat ve oran kademesi eski eşiklerle; veri yoksa null', () => {
    expect([null, 0, 0.05, 1, 8, 24, 72].map(saatKademesi)).toEqual([null, 0, 0, 1, 2, 3, 4]);
    const e = [50, 75, 90, 100] as const;
    expect([null, Number.NaN, 10, 50, 80, 95, 100, 140].map((x) => oranKademesi(x, e))).toEqual([null, null, 0, 1, 2, 3, 4, 4]);
    expect([null, 3.4, 47.6, 72].map(kisaSure)).toEqual(['', '3s', '48s', '3g']);
  });

  it('hücre birleştirme kademeyi düşürmez, etiketleri ekler, tanımsızı atlar', () => {
    const h: Record<string, IsiHucresi> = {};
    hucreKoy(h, 'g1', { kd: 3, etiket: 'yolda' });
    hucreKoy(h, 'g1', { kd: 1, etiket: 'bekleniyor', v: '+2g', tahmin: undefined });
    expect(h.g1).toEqual({ kd: 3, etiket: 'yolda, bekleniyor', v: '+2g' });
    hucreKoy(h, 'g1', { kd: 4 });
    expect(h.g1?.kd).toBe(4);
  });

  it('boş hücre: işaretsiz ya da yalnız kapalı', () => {
    expect(hucreBos(undefined)).toBe(true);
    expect(hucreBos({ kapali: true, etiket: 'tatil' })).toBe(true);
    expect(hucreBos({ kd: 0 })).toBe(false);
    expect(hucreBos({ oneri: true })).toBe(false);
  });
});
