import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ekipmanHazirliklari } from './kurallar.ts';

// 2893-4 a: listesi boş iş emrinde madde gerekmez; listedekilerin hepsi hazırsa tamam, biri değilse eksik.
test('ekipman hazırlığı: boş liste gerekmez, hepsi hazırsa tamam, biri değilse eksik', () => {
  const gerekli = [{ isEmriId: 1, kimlik: 7 }, { isEmriId: 1, kimlik: 8 }, { isEmriId: 2, kimlik: 7 }];
  const h = ekipmanHazirliklari([1, 2, 3, 3], gerekli, (k) => k === 7);
  assert.deepEqual([...h], [[1, { durum: 'yok', secildi: true }], [2, { durum: 'tamam', secildi: true }], [3, { durum: 'yok', secildi: false }]]);
  assert.deepEqual(ekipmanHazirliklari([], gerekli, () => true).size, 0);
});
