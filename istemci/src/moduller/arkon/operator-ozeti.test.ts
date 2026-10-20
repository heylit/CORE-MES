import { describe, expect, it } from 'vitest';
import { kalanMetni, vardiyaKalanDk, vardiyaUretimi } from '../../../../arkon/web/src/data/operator-ozeti.ts';

describe('Arkon operatör özeti', () => {
  it('vardiyanın kalan süresi; vardiya dışında ya da bitmişse yok', () => {
    const an = 1_000_000_000_000;
    expect(vardiyaKalanDk({ name: 'Gündüz', e: an + 200 * 60000 }, an)).toBe(200);
    expect(kalanMetni(200)).toBe('3 sa 20 dk kaldı');
    expect(kalanMetni(45)).toBe('45 dk kaldı');
    expect(vardiyaKalanDk({ name: '—', e: an + 60000 }, an)).toBeNull();
    expect(vardiyaKalanDk({ name: 'Gece', e: an }, an)).toBeNull();
    expect(kalanMetni(null)).toBeNull();
  });

  it('beklenen adet varsa oranla, yoksa yalnız iyi parça (oran uydurulmaz)', () => {
    expect(vardiyaUretimi(312, 400)).toEqual({ metin: 'Vardiya 312 / 400', oran: 0.78 });
    expect(vardiyaUretimi(500, 400).oran).toBe(1);
    expect(vardiyaUretimi(12, null)).toEqual({ metin: 'Vardiya 12 iyi', oran: null });
  });
});
