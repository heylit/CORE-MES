import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UYGULAMA_ADI, birlesikAd } from './uygulama.ts';

test('uygulama adi sabittir', () => {
  assert.equal(UYGULAMA_ADI, 'CORE');
});

test('firma adi varsa onune eklenir, bos ya da yoksa yalniz uygulama adi kalir', () => {
  assert.equal(birlesikAd('Ornek Makine'), 'Ornek Makine CORE');
  assert.equal(birlesikAd('  Ornek  '), 'Ornek CORE');
  assert.equal(birlesikAd(''), 'CORE');
  assert.equal(birlesikAd('   '), 'CORE');
  assert.equal(birlesikAd(null), 'CORE');
  assert.equal(birlesikAd(undefined), 'CORE');
});
