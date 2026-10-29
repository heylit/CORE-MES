import { describe, expect, it } from 'vitest';
import { eksiBakiye, eksiBakiyeMetni } from '../../../../arkon/web/src/data/eksi-bakiye.ts';

describe('paralel adımda eksi bakiye (639h)', () => {
  it('sunucunun yazdığı fazla sayılan adet döner', () => {
    expect(eksiBakiye({ tmi: { eksi: 3 } })).toBe(3);
    expect(eksiBakiyeMetni(3)).toBe('Eksi bakiye · 3 fazla sayıldı');
  });

  it('alan yoksa, sıfır, eksi, kesirli ya da sayı değilse gösterge yok', () => {
    for (const eksi of [undefined, 0, -2, 1.5, '3', null]) expect(eksiBakiye({ tmi: { eksi } })).toBeNull();
    expect(eksiBakiye({ tmi: null })).toBeNull();
    expect(eksiBakiye({})).toBeNull();
    expect(eksiBakiye(null)).toBeNull();
  });
});
