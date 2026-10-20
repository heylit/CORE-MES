import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { govdeOzeti } from './servis.ts';

test('gövde özeti: kararlı JSON metninin bayt sayısı ve sha256 özeti; alan sırası özeti değiştirmez, gövde yoksa özet de yoktur', () => {
  const metin = '{"a":"ğ","b":[1,{"c":null,"d":2}]}';
  const beklenen = { _ozet: { boyut: Buffer.byteLength(metin, 'utf8'), sha256: createHash('sha256').update(metin, 'utf8').digest('hex') } };
  assert.equal(beklenen._ozet.boyut, metin.length + 1);
  assert.deepEqual(govdeOzeti({ a: 'ğ', b: [1, { c: null, d: 2 }] }), beklenen);
  assert.deepEqual(govdeOzeti({ b: [1, { d: 2, c: null }], a: 'ğ' }), beklenen);
  assert.notDeepEqual(govdeOzeti({ a: 'g', b: [1, { c: null, d: 2 }] }), beklenen);
  assert.deepEqual(govdeOzeti(null), { _ozet: { boyut: 4, sha256: createHash('sha256').update('null').digest('hex') } });
  assert.equal(govdeOzeti(undefined), undefined);
});
