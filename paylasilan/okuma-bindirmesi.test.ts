import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindirilenleriAyikla, okumaBindir } from './okuma-bindirmesi.ts';

const tezgahlar = [{ id: 3, kod: 'T-1' }];

test('okuma: sahibin listesi yolun yerine geçer; belgede saklanan eski kopya geçmez, kardeş alanlar kalır', () => {
  const belge = { tezgahlar: [{ id: 9, kod: 'ESKI' }], ayar: { birim: 'mm', olcu: [{ id: 1 }] } };
  const sonuc = okumaBindir(belge, [{ yol: ['tezgahlar'], deger: tezgahlar }, { yol: ['ayar', 'olcu'], deger: [] }]);
  assert.deepEqual(sonuc, { tezgahlar, ayar: { birim: 'mm', olcu: [] } });
  // Girdi değişmez: aynı belge başka okumada da kullanılabilir.
  assert.deepEqual(belge.tezgahlar, [{ id: 9, kod: 'ESKI' }]);
  assert.deepEqual(belge.ayar.olcu, [{ id: 1 }]);
});

test('okuma: eksik ara düğüm kurulur; nesne olmayan ara değer nesneye çevrilir', () => {
  assert.deepEqual(okumaBindir({}, [{ yol: ['a', 'b'], deger: tezgahlar }]), { a: { b: tezgahlar } });
  assert.deepEqual(okumaBindir({ a: [1] }, [{ yol: ['a', 'b'], deger: null }]), { a: { b: null } });
});

test('yazma: bindirilen yol saklanmadan önce çıkarılır; olmayan yol ve nesne olmayan ara değer belgeyi değiştirmez', () => {
  const gelen = { tezgahlar: [{ id: 3 }], ayar: { birim: 'mm', olcu: [] }, x: 1 };
  assert.deepEqual(bindirilenleriAyikla(gelen, [['tezgahlar'], ['ayar', 'olcu']]), { ayar: { birim: 'mm' }, x: 1 });
  assert.deepEqual(gelen.ayar, { birim: 'mm', olcu: [] });
  assert.deepEqual(bindirilenleriAyikla({ a: 1 }, [['yok', 'b']]), { a: 1 });
  assert.deepEqual(bindirilenleriAyikla({ a: [1] }, [['a', '0']]), { a: [1] });
});

test('okunan belge yeniden yazılınca sahibin listesi saklanmaz: okuma ve yazma birbirinin tersidir', () => {
  const saklanan = { ayar: { birim: 'mm' } };
  const okunan = okumaBindir(saklanan, [{ yol: ['ayar', 'tezgahlar'], deger: tezgahlar }]);
  assert.deepEqual(bindirilenleriAyikla(okunan, [['ayar', 'tezgahlar']]), saklanan);
});

test('nesne düzenini değiştirebilecek yol adı reddedilir', () => {
  for (const ad of ['__proto__', 'constructor', 'prototype', '']) {
    assert.throws(() => okumaBindir({}, [{ yol: ['a', ad], deger: 1 }]), TypeError);
    assert.throws(() => bindirilenleriAyikla({}, [[ad]]), TypeError);
  }
  assert.throws(() => okumaBindir({}, [{ yol: [] as unknown as [string], deger: 1 }]), TypeError);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'kirli'), false);
});
