import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BLOB_BELLEK_SINIRI, blobBellegi } from '../../../arkon/web/src/data/blob-bellek.ts';

const bayt = (n: number): Uint8Array => new Uint8Array(n);

describe('tablet blob belleği', () => {
  it('sınır tablet belleğini şişirmeyecek kadar düşüktür (300 MB değil)', () => {
    assert.ok(BLOB_BELLEK_SINIRI <= 64e6);
  });

  it('sınır aşılınca en uzun süredir kullanılmayan çıkar; yeni okunan kalır', () => {
    const b = blobBellegi(100);
    b.koy('a', bayt(40));
    b.koy('b', bayt(40));
    assert.ok(b.al('a'));
    b.koy('c', bayt(40));
    assert.equal(b.al('b'), undefined);
    assert.ok(b.al('a'));
    assert.ok(b.al('c'));
    assert.ok(b.boyut() <= 100);
  });

  it('aynı özet ikinci kez sayılmaz', () => {
    const b = blobBellegi(100);
    b.koy('a', bayt(40));
    b.koy('a', bayt(40));
    assert.equal(b.boyut(), 40);
  });
});
