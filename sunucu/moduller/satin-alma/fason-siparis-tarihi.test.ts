import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fasonSiparisTarihiSec } from './kurallar.ts';

describe('fason siparişinin dönüş tarihi (3257 a)', () => {
  test('fason iş emrinin en geç sipariş dönüşü esastır ve numara o siparişindir; tarihsiz sipariş, talep ve emirsiz satır sayılmaz', () => {
    const m = fasonSiparisTarihiSec([
      { isEmriId: 7, asama: 'siparis', termin: '2099-02-01', siparisNo: 'ORN-1' },
      { isEmriId: 7, asama: 'siparis', termin: '2099-02-05', siparisNo: 'ORN-2' },
      { isEmriId: 7, asama: 'siparis', termin: '2099-01-20', siparisNo: 'ORN-3' },
      { isEmriId: 8, asama: 'siparis', termin: null, siparisNo: 'ORN-4' },
      { isEmriId: 9, asama: 'talep', termin: null, siparisNo: null },
      { isEmriId: null, asama: 'siparis', termin: '2099-02-01', siparisNo: 'ORN-5' },
    ]);
    assert.deepEqual([...m], [[7, { tarih: '2099-02-05', siparisNo: 'ORN-2', firmaId: null }]]);
  });
  test('3355: siparişin firması seçilen siparişten gelir; plan rotada firması olmayan fason adımı ona yerleştirir', () => {
    const m = fasonSiparisTarihiSec([
      { isEmriId: 7, asama: 'siparis', termin: '2099-02-01', siparisNo: 'ORN-1', firmaId: 3 },
      { isEmriId: 7, asama: 'siparis', termin: '2099-02-05', siparisNo: 'ORN-2', firmaId: 4 },
    ]);
    assert.deepEqual(m.get(7), { tarih: '2099-02-05', siparisNo: 'ORN-2', firmaId: 4 });
  });
});
