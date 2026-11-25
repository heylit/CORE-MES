import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KIMLIK_YERINE, kimlikSuz } from './kimlik-suz.ts';

test('11 haneli kimlik numarası silinir, kısa Logo numaraları kalır', () => {
  assert.equal(kimlikSuz('Sürücü 00000000000 hatalı, kayıt 123456'), `Sürücü ${KIMLIK_YERINE} hatalı, kayıt 123456`);
  assert.equal(kimlikSuz('a12345678901b ve 99999999999'), `a${KIMLIK_YERINE}b ve ${KIMLIK_YERINE}`);
  assert.equal(kimlikSuz('kimlik yok'), 'kimlik yok');
});

test('boşluk ya da tireyle yazılmış 11 haneli kimlik de silinir; saatli tarih ve kısa numaralar kalır', () => {
  assert.equal(kimlikSuz('Sürücü 123 456 789 50 hatalı'), `Sürücü ${KIMLIK_YERINE} hatalı`);
  assert.equal(kimlikSuz('kimlik 123-456-789-50.'), `kimlik ${KIMLIK_YERINE}.`);
  assert.equal(kimlikSuz('kimlik 123.456.789.50 hatalı'), `kimlik ${KIMLIK_YERINE} hatalı`);
  assert.equal(kimlikSuz('1234 5678 901'), KIMLIK_YERINE);
  assert.equal(kimlikSuz('tutar 1.234,50 TL'), 'tutar 1.234,50 TL');
  assert.equal(kimlikSuz('2026-11-25 09:00 kayıt 123 456'), '2026-11-25 09:00 kayıt 123 456');
});
