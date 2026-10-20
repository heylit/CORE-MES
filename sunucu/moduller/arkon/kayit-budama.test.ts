import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { YEREL_KAYIT_GUNU, budanacakAnahtarlar, yerelKayitBudanir } from '../../../arkon/web/src/data/kayit-budama.ts';

const GUN = 864e5;

describe('tabletin yerel üretim kaydı kopyası', () => {
  it('7 günden eskisi silinir, 7 gün ve yenisi kalır', () => {
    const simdi = 100 * GUN;
    const satirlar: [number, unknown][] = [
      [1, { at: simdi - 8 * GUN }],
      [2, { at: simdi - YEREL_KAYIT_GUNU * GUN }],
      [3, { at: simdi - GUN }],
      [4, { at: simdi - 7 * GUN - 1 }],
    ];
    assert.deepEqual(budanacakAnahtarlar(satirlar, simdi), [1, 4]);
  });

  it('zamanı okunamayan satır silinmez', () => {
    assert.deepEqual(budanacakAnahtarlar([[1, { at: null }], [2, {}], [3, null], [4, { at: 'dün' }]], 100 * GUN), []);
  });

  it('yalnız sunucuya bağlı tablette budanır; yerel modda (sunucusuz) hiç budanmaz', () => {
    assert.equal(yerelKayitBudanir({ on: true }), true);
    assert.equal(yerelKayitBudanir({ on: false }), false);
  });
});
