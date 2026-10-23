import { describe, expect, it } from 'vitest';
import { GERI_AL_SINIRI, GeriAlYigini } from './geri-al.ts';
import { bosProfil } from './normalize.ts';

describe('GeriAlYigini', () => {
  it('profil başına son adımı verir; başka profilin adımına dokunmaz', () => {
    const y = new GeriAlYigini();
    const p = bosProfil();
    p.profile.firma = 'ilk';
    y.sakla('Bir', 'p1', p);
    y.sakla('İki', 'p2', bosProfil());
    expect(y.var('p1')).toBe(true);
    const a = y.al('p1');
    expect(a?.etiket).toBe('Bir');
    expect((a?.profil as { profile: { firma: string } }).profile.firma).toBe('ilk');
    expect(y.var('p1')).toBe(false);
    expect(y.var('p2')).toBe(true);
    expect(y.al('p1')).toBeNull();
  });

  it(`en çok ${String(GERI_AL_SINIRI)} adım tutar`, () => {
    const y = new GeriAlYigini();
    for (let i = 0; i < GERI_AL_SINIRI + 5; i++) y.sakla(String(i), 'p', bosProfil());
    let n = 0;
    while (y.al('p')) n++;
    expect(n).toBe(GERI_AL_SINIRI);
  });
});
