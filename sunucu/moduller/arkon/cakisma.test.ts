import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAKISMA_ILETISI, merge3 } from '../../../arkon/web/src/data/cakisma.ts';

// Karar 53: tablet ile sunucu aynı alanı değiştirdiyse sunucudaki geçerlidir ve tablet uyarır.
describe('tablet-sunucu çakışması', () => {
  it('iki tarafın da değiştirdiği alanda sunucu kazanır ve alan çakışan olarak bildirilir', () => {
    const r = merge3({ qty: 10, note: 'a' }, { qty: 12, note: 'a' }, { qty: 15, note: 'a' });
    assert.deepEqual(r.doc, { qty: 15, note: 'a' });
    assert.deepEqual(r.cakisan, ['qty']);
  });

  it('yalnız bir tarafın değiştirdiği alanlar korunur, çakışma sayılmaz', () => {
    const r = merge3({ qty: 10, note: 'a', st: 'x' }, { qty: 12, note: 'a', st: 'x' }, { qty: 10, note: 'b', st: 'x' });
    assert.deepEqual(r.doc, { qty: 12, note: 'b', st: 'x' });
    assert.deepEqual(r.cakisan, []);
  });

  it('iç içe alanda ve tabanı bilinmeyen belgede de sunucu kazanır', () => {
    const r = merge3({ m: { a: 1, b: 1 } }, { m: { a: 2, b: 1 } }, { m: { a: 3, b: 1 } });
    assert.deepEqual(r.doc, { m: { a: 3, b: 1 } });
    assert.deepEqual(r.cakisan, ['m.a']);
    const t = merge3(undefined, { a: 1, yerel: true }, { a: 2 });
    assert.deepEqual(t.doc, { a: 2, yerel: true });
    assert.deepEqual(t.cakisan, ['a']);
  });

  it('dizi ve düz değer bütün olarak sunucudan alınır', () => {
    const r = merge3({ l: [1] }, { l: [1, 2] }, { l: [1, 3] });
    assert.deepEqual(r.doc, { l: [1, 3] });
    assert.deepEqual(r.cakisan, ['l']);
    assert.deepEqual(merge3(1, 2, 3), { doc: 3, cakisan: [''] });
  });

  it('uyarı metni sunucunun geçerli olduğunu söyler', () => {
    assert.match(CAKISMA_ILETISI, /sunucu/i);
  });
});
