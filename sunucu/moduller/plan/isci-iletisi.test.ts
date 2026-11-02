import assert from 'node:assert/strict';
import { test } from 'node:test';
import { izlemeIletisi } from './isci-iletisi.ts';

test('1786: node --watch iletisi sonuç sayılmaz; sonuç, hata ve boş sonuç sayılır', () => {
  assert.equal(izlemeIletisi({ 'watch:require': ['/x.ts'] }), true);
  assert.equal(izlemeIletisi({ 'watch:import': ['file:///x.ts'] }), true);
  for (const m of [null, { hata: 'plan-yok' }, { dataVer: 1, sonuc: { tur: 'plan-uygula' } }, [], 0]) assert.equal(izlemeIletisi(m), false);
});
