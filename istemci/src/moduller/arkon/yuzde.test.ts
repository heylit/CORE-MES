import { describe, expect, it } from 'vitest';
import { yuzdeMetni } from '../../../../arkon/web/src/data/yuzde.ts';

// Pano'da OEE: vardiyanın az bir kısmında çalışıp parça yapan makine "0%" değil "<1%" görünür.
describe('Arkon yüzde metni', () => {
  it('veri yoksa tire, sıfırsa 0%, yarım yüzdenin altındaki pozitif oran <1%, öteki yuvarlanır', () => {
    expect([null, undefined].map(yuzdeMetni)).toEqual(['—', '—']);
    expect(yuzdeMetni(0)).toBe('0%');
    expect(yuzdeMetni(0.0014)).toBe('<1%');
    expect(yuzdeMetni(0.005)).toBe('1%');
    expect(yuzdeMetni(0.834)).toBe('83%');
  });
});
