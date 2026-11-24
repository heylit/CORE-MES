import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { belgeToplami, kdvDahildenNet, kdvKurus, kdvTutari, kurusBol } from './kdv.ts';

describe('tek KDV kuralı (3674)', () => {
  test('KDV netten kuruşa yarım yukarı yuvarlanır', () => {
    assert.equal(kdvTutari('100.00', '20'), '20.00');
    assert.equal(kdvTutari('0.07', '20'), '0.01');
    assert.equal(kdvTutari('0.02', '20'), '0.00');
    assert.equal(kdvTutari('0.03', '20'), '0.01');
    assert.equal(kdvTutari('33.33', '10'), '3.33');
    assert.equal(kdvTutari('1234567.89', '18'), '222222.22');
    assert.equal(kdvKurus(5n, 10), 1n);
  });

  test('tevkifat KDV tutarından, toplam net + KDV - tevkifattır', () => {
    assert.deepEqual(belgeToplami('1000.00', '20', 5, 10), { kdv: '200.00', tevkifat: '100.00', toplam: '1100.00' });
    assert.deepEqual(belgeToplami('333.33', '20', 7, 10), { kdv: '66.67', tevkifat: '46.67', toplam: '353.33' });
    assert.deepEqual(belgeToplami('50.00', '0'), { kdv: '0.00', tevkifat: '0.00', toplam: '50.00' });
  });

  test('KDV dahil toplamdan net kuruşu kuruşuna bulunur; uymuyorsa null', () => {
    assert.equal(kdvDahildenNet('120.00', '20'), '100.00');
    assert.equal(kdvDahildenNet('0.15', '20'), null);
    for (const brut of ['99.99', '1000.01', '4567.89']) {
      const net = kdvDahildenNet(brut, '10');
      if (net !== null) assert.equal(belgeToplami(net, '10').toplam, brut);
    }
  });

  test('parçalara bölünen belgenin net ve KDV toplamı belgeninkinden sapmaz', () => {
    for (const [toplam, agirliklar] of [[1000n, [333n, 333n, 334n]], [101n, [1n, 1n, 1n]], [7n, [3n, 3n]], [0n, [5n, 5n]]] as const) {
      const bolunen = kurusBol(toplam, agirliklar);
      assert.equal(bolunen.reduce((a, b) => a + b, 0n), toplam);
      assert.equal(bolunen.length, agirliklar.length);
    }
    assert.deepEqual(kurusBol(10n, [1n, 1n, 1n]), [4n, 3n, 3n]);
  });
});
