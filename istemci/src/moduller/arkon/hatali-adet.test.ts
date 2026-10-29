import { describe, expect, it } from 'vitest';
import { hataliAdet } from '../../../../arkon/web/src/data/hatali-adet.ts';

describe('TMI işinde hatalı adet (1188)', () => {
  it('sunucunun yazdığı adım toplamı döner; sıfır gerçek sıfırdır', () => {
    expect(hataliAdet({ tmi: { hatali: 3 } })).toBe(3);
    expect(hataliAdet({ tmi: { hatali: 0 } })).toBe(0);
  });

  it('alan yoksa, eksi, kesirli ya da sayı değilse bilinmiyor (null)', () => {
    for (const hatali of [undefined, -1, 1.5, '3', null]) expect(hataliAdet({ tmi: { hatali } })).toBeNull();
    expect(hataliAdet({ tmi: null })).toBeNull();
    expect(hataliAdet({})).toBeNull();
    expect(hataliAdet(null)).toBeNull();
  });
});
