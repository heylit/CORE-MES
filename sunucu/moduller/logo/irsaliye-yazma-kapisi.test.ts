import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { OLCUM_DURUMU } from './irsaliye-etiket-esleme.ts';
import type { OlcumDurumu } from './irsaliye-etiket-esleme.ts';
import { yazmaKapisi } from './irsaliye-yazma-kapisi.ts';

// Kapıyı atlatan parametre yoktur: bayraklar node:test mock.property ile geçici çevrilir, her testten sonra eski haline döner.
const hepsi: OlcumDurumu = { satinAlmaEtiketleriOlculdu: true, satisEtiketleriOlculdu: true, konsinyeOlculdu: true, durumKodlariOnaylandi: true, eIrsaliyeUreticisiBelli: true, teyitKalkti: true };
const ayarla = (d: Partial<OlcumDurumu>): void => {
  for (const [k, v] of Object.entries({ ...hepsi, ...d }) as [keyof OlcumDurumu, boolean][]) mock.property(OLCUM_DURUMU, k, v);
};

describe('irsaliye yazma kapısı', () => {
  afterEach(() => { mock.restoreAll(); });
  it('bugünkü ölçüm durumunda üç tür de kapalı', () => {
    for (const t of ['satin_alma', 'satis', 'konsinye'] as const) assert.equal(yazmaKapisi(t).acik, false);
  });
  it('bugün hiçbir ölçüm bayrağı açık değil, yalnız teyit kalktı', () => {
    assert.deepEqual(Object.entries(OLCUM_DURUMU).filter(([, v]) => v).map(([k]) => k), ['teyitKalkti']);
  });
  it('her koşul tamam olunca açılır', () => {
    ayarla({});
    for (const t of ['satin_alma', 'satis', 'konsinye'] as const) assert.deepEqual(yazmaKapisi(t), { acik: true, engeller: [] });
  });
  it('tek eksik tek engel verir', () => {
    ayarla({ durumKodlariOnaylandi: false });
    assert.deepEqual(yazmaKapisi('satis').engeller, ['durum_kodlari']);
    mock.restoreAll(); ayarla({ konsinyeOlculdu: false });
    assert.deepEqual(yazmaKapisi('konsinye').engeller, ['konsinye']);
    mock.restoreAll(); ayarla({ teyitKalkti: false });
    assert.deepEqual(yazmaKapisi('satin_alma').engeller, ['teyit']);
  });
  it('satış etiketi ölçülmeden satın alma açılabilir, tersi olmaz', () => {
    ayarla({ satisEtiketleriOlculdu: false });
    assert.equal(yazmaKapisi('satin_alma').acik, true);
    assert.deepEqual(yazmaKapisi('satis').engeller, ['etiket']);
  });
  it('mock geri alınınca bayraklar yine kapalı', () => {
    ayarla({});
    mock.restoreAll();
    assert.equal(yazmaKapisi('satin_alma').acik, false);
  });
});
