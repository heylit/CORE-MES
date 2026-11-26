import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ayniParcaRevizyonuMu } from '../uretim-emirleri/disari.ts';
import { kaliteResmiUyarisi } from './kurallar.ts';

test('3755: kalite resmi emrin revizyonunda değilse uyarı; aynıysa, kod bilinmiyorsa ya da emir seçilmemişse yok', () => {
  assert.equal(kaliteResmiUyarisi('00', ['01'], ayniParcaRevizyonuMu), 'Bu emir Rev 00 ile açıldı; elinizdeki resim Rev 01. Ölçümü Rev 00 çizimine göre yapın.');
  assert.equal(kaliteResmiUyarisi('00', ['R00'], ayniParcaRevizyonuMu), null);
  assert.equal(kaliteResmiUyarisi('00', ['01', '00'], ayniParcaRevizyonuMu), null);
  assert.equal(kaliteResmiUyarisi('00', [null], ayniParcaRevizyonuMu), null);
  assert.equal(kaliteResmiUyarisi('00', [], ayniParcaRevizyonuMu), null);
  assert.equal(kaliteResmiUyarisi(null, ['01'], ayniParcaRevizyonuMu), null);
});
