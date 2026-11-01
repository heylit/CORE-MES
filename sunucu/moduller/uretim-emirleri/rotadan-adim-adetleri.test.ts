import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rotadanAdimAdetleri } from './kurallar.ts';

test('emri açılmamış rota: dal adımı adet x çarpan, ana hat adet; anahtar OP no (1527, 1257 a)', () => {
  const r = rotadanAdimAdetleri(100, [{ opNo: 10, adetCarpani: 2 }, { opNo: 20, adetCarpani: 2 }, { opNo: 30 }, { opNo: 40, adetCarpani: null }]);
  assert.deepEqual([...r], [[10, 200], [20, 200], [30, 100], [40, 100]]);
  assert.deepEqual([...rotadanAdimAdetleri(7, [])], []);
});
