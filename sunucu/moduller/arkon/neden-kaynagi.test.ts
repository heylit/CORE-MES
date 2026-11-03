import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nedenKaynagi, onerileriSuz } from '../../../arkon/web/src/app/neden-kaynagi.ts';

const VARSAYILAN = [{ code: 'D-01' }, { code: 'D-02' }];
const CORE = [{ code: 'ARIZA' }, { code: 'MOLA' }];

describe('Arkon neden listesi kaynağı', () => {
  it('sunucu kipinde yalnız CORE nedenleri görünür; Arkon kodları karışmaz', () => {
    assert.deepEqual(nedenKaynagi(true, CORE, VARSAYILAN), CORE);
  });
  it('sunucu kipinde CORE listesi boşsa ya da gelmediyse Arkon varsayılanına dönülmez', () => {
    assert.deepEqual(nedenKaynagi(true, null, VARSAYILAN), []);
    assert.deepEqual(nedenKaynagi(true, undefined, VARSAYILAN), []);
    assert.deepEqual(nedenKaynagi(true, [], VARSAYILAN), []);
  });
  it('yerel kipte kayıtlı liste kullanılır, yoksa varsayılan açılır', () => {
    assert.deepEqual(nedenKaynagi(false, CORE, VARSAYILAN), CORE);
    assert.deepEqual(nedenKaynagi(false, null, VARSAYILAN), VARSAYILAN);
    assert.deepEqual(nedenKaynagi(false, [], VARSAYILAN), VARSAYILAN);
  });
  it('listede olmayan kodlu öneri düşer, olanlar sırasıyla kalır', () => {
    const oneri = [{ code: 'D-05', why: 'a' }, { code: 'ARIZA', why: 'b' }, { code: 'D-01', why: 'c' }];
    assert.deepEqual(onerileriSuz(oneri, CORE).map((o) => o.code), ['ARIZA']);
    assert.deepEqual(onerileriSuz(oneri, []), []);
  });
});
