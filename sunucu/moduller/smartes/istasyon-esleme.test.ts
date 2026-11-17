import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { koddanTekKayit } from './kurallar.ts';

describe('Çoklu istasyon eşlemesi (3376)', () => {
  test('koda tek kayıt bağlıysa o kayıt; birden çok ya da hiç bağlı değilse null', () => {
    const eslemeler = [{ tmiId: 1, smartesKod: 'ORN-ATOLYE' }, { tmiId: 2, smartesKod: 'ORN-ATOLYE' }, { tmiId: 3, smartesKod: 'ORN-KALITE' }];
    assert.equal(koddanTekKayit(eslemeler, 'ORN-KALITE'), 3);
    assert.equal(koddanTekKayit(eslemeler, 'ORN-ATOLYE'), null);
    assert.equal(koddanTekKayit(eslemeler, 'ORN-YOK'), null);
  });
});
