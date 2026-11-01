import { afterEach, describe, expect, it } from 'vitest';
import { derle, girdiKur } from './motor/kurallar.ts';
import { ornekCalisma } from './motor/ornek.ts';
import { UFUK_VARSAYILAN, ufukGecerli, ufukGunu, ufukKur } from './ufuk-olcegi.ts';

// 1477 a: ekranların ufku sunucunun motor ölçeğidir (w.ufukGun); motorla aynı sınırlar, sınır dışı ya da yoksa 120 gün (1681 b).
describe('ufuk ölçeği', () => {
  afterEach(() => { ufukKur(null); });

  it('sınırlar motorla aynıdır', () => {
    expect([ufukGecerli({ ufukGun: 120 }), ufukGecerli({ ufukGun: 28 }), ufukGecerli({ ufukGun: 182 })]).toEqual([120, 28, 182]);
    expect([ufukGecerli({ ufukGun: 27 }), ufukGecerli({ ufukGun: 183 }), ufukGecerli({ ufukGun: 'x' }), ufukGecerli(null)]).toEqual([120, 120, 120, 120]);
    expect(UFUK_VARSAYILAN).toBe(120);
  });

  it('kurulan ufuk ekranın derlemesindeki gün sayısıdır', () => {
    const c = ornekCalisma();
    ufukKur({ ufukGun: 90 });
    expect(ufukGunu()).toBe(90);
    expect(derle(girdiKur(c)).gunler).toHaveLength(90);
    ufukKur(undefined);
    expect(derle(girdiKur(c)).gunler).toHaveLength(120);
  });
});
