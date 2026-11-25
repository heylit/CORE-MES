import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OLCUM_DURUMU } from './irsaliye-etiket-esleme.ts';
import { yazmaKapisi } from './irsaliye-yazma-kapisi.ts';

const hepsi = { satinAlmaEtiketleriOlculdu: true, satisEtiketleriOlculdu: true, konsinyeOlculdu: true, durumKodlariOnaylandi: true, eIrsaliyeUreticisiBelli: true, teyitKalkti: true };

describe('irsaliye yazma kapısı', () => {
  it('bugünkü ölçüm durumunda üç tür de kapalı', () => {
    for (const t of ['satin_alma', 'satis', 'konsinye'] as const) assert.equal(yazmaKapisi(t).acik, false);
  });
  it('bugün hiçbir ölçüm bayrağı açık değil, yalnız teyit kalktı', () => {
    assert.deepEqual(Object.entries(OLCUM_DURUMU).filter(([, v]) => v).map(([k]) => k), ['teyitKalkti']);
  });
  it('her koşul tamam olunca açılır', () => {
    for (const t of ['satin_alma', 'satis', 'konsinye'] as const) assert.deepEqual(yazmaKapisi(t, hepsi), { acik: true, engeller: [] });
  });
  it('tek eksik tek engel verir', () => {
    assert.deepEqual(yazmaKapisi('satis', { ...hepsi, durumKodlariOnaylandi: false }).engeller, ['durum_kodlari']);
    assert.deepEqual(yazmaKapisi('konsinye', { ...hepsi, konsinyeOlculdu: false }).engeller, ['konsinye']);
    assert.deepEqual(yazmaKapisi('satin_alma', { ...hepsi, teyitKalkti: false }).engeller, ['teyit']);
  });
  it('satış etiketi ölçülmeden satın alma açılabilir, tersi olmaz', () => {
    assert.equal(yazmaKapisi('satin_alma', { ...hepsi, satisEtiketleriOlculdu: false }).acik, true);
    assert.deepEqual(yazmaKapisi('satis', { ...hepsi, satisEtiketleriOlculdu: false }).engeller, ['etiket']);
  });
});
