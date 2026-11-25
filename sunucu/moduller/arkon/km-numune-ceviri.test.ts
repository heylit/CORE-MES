import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kmNumuneDegisimiGecerli, kmNumuneDegisimiGerekli, kmNumuneKurallari } from './km-numune-ceviri.ts';

// 3689: numune planı Kalite Merkezi'nindir; sunucu paket yazarken bu çeviriyle denetler. Değerler uydurmadır.
const PLAN = { surum: 3, kurallar: [
  { kimlik: 'a', ne: 'ilk' as const, kim: ['kalite' as const], balonlar: 'hepsi' as const, kapi: true },
  { kimlik: 'b', ne: 'her' as const, n: 25, kim: ['operator' as const], balonlar: [3, 5] },
] };
const SAMP = kmNumuneKurallari(PLAN);

describe('Kalite Merkezi numune planı paket yazımında', () => {
  test('çeviri paket biçimine uyar', () => {
    assert.deepEqual(SAMP, [
      { id: 'a', when: 'first', who: ['q'], items: 'all', gate: true },
      { id: 'b', when: 'every', n: 25, who: ['op'], items: [3, 5] },
    ]);
  });
  test('bağsız paket etkilenmez; bağlı paketin samp ya da bağı değişirse denetim gerekir', () => {
    assert.equal(kmNumuneDegisimiGerekli({ samp: [{ id: 'x' }] }, { samp: [] }), false);
    const eski = { kmNumune: { surum: 3 }, samp: SAMP };
    assert.equal(kmNumuneDegisimiGerekli({ ...eski, plan: [1] }, eski), false);
    assert.equal(kmNumuneDegisimiGerekli({ ...eski, samp: [{ ...SAMP[0], gate: false }, SAMP[1]] }, eski), true);
    assert.equal(kmNumuneDegisimiGerekli({ samp: SAMP }, eski), true);
  });
  test('yalnız aynı sürümü bağlayan ve plana eşit samp geçer; elle değişiklik reddedilir', () => {
    assert.equal(kmNumuneDegisimiGecerli({ kmNumune: { surum: 3 }, samp: SAMP }, PLAN), true);
    assert.equal(kmNumuneDegisimiGecerli({ kmNumune: { surum: 3 }, samp: [{ ...SAMP[0], n: 7 }, SAMP[1]] }, PLAN), false);
    assert.equal(kmNumuneDegisimiGecerli({ kmNumune: { surum: 2 }, samp: SAMP }, PLAN), false);
    assert.equal(kmNumuneDegisimiGecerli({ samp: SAMP }, PLAN), false);
    assert.equal(kmNumuneDegisimiGecerli({ kmNumune: { surum: 3 }, samp: SAMP }, null), false);
  });
});
