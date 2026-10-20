import { describe, expect, it } from 'vitest';
import { SAYFALAR, menudeGorunur } from '#paylasilan/sayfalar.ts';
import { SIMGELER } from '../tasarim/simgeler.ts';

// Simge şeridinde ad görünmez: iki sayfa aynı simgeyi taşırsa kullanıcı yalnız simgeyle ayırt edemez.
describe('ana menu simgeleri', () => {
  it('menude gorunen her sayfanin simgesi setten ve tekil', () => {
    const menude = SAYFALAR.filter(menudeGorunur);
    for (const s of menude) expect(s.simge in SIMGELER, s.yol).toBe(true);
    const sahip = new Map<string, string>();
    const ikiz: string[] = [];
    for (const s of menude) {
      const onceki = sahip.get(s.simge);
      if (onceki !== undefined) ikiz.push(`${s.simge}: ${onceki}, ${s.yol}`);
      sahip.set(s.simge, s.yol);
    }
    expect(ikiz).toEqual([]);
  });
});
