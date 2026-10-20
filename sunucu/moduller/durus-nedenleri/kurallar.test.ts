import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cagriyiDuzenle, kodOner } from './kurallar.ts';

describe('çağrı kuralı', () => {
  test('DN-08 / DN-07: planlıya çevrilen nedenin çağrı ekibi ve gecikmesi silinir', () => {
    assert.deepEqual(
      cagriyiDuzenle({ kategori: 'planli', cagriEkibi: 'bakim', cagriGecikmeDk: 5 }),
      { cagriEkibi: null, cagriGecikmeDk: null },
    );
  });

  test('plansızda ekip ve gecikme birlikte korunur; tek başına verilen reddedilir', () => {
    assert.deepEqual(
      cagriyiDuzenle({ kategori: 'plansiz', cagriEkibi: 'amir', cagriGecikmeDk: 0 }),
      { cagriEkibi: 'amir', cagriGecikmeDk: 0 },
    );
    assert.deepEqual(
      cagriyiDuzenle({ kategori: 'plansiz', cagriEkibi: null, cagriGecikmeDk: null }),
      { cagriEkibi: null, cagriGecikmeDk: null },
    );
    assert.equal('hata' in cagriyiDuzenle({ kategori: 'plansiz', cagriEkibi: 'amir', cagriGecikmeDk: null }), true);
    assert.equal('hata' in cagriyiDuzenle({ kategori: 'plansiz', cagriEkibi: null, cagriGecikmeDk: 5 }), true);
  });
});

describe('kod önerisi (DN-09)', () => {
  test('önek artı en büyük sayının bir fazlası; boşluk doldurulmaz', () => {
    assert.equal(kodOner('D', ['D-01', 'D-02', 'D-07']), 'D-08');
  });

  test('kod yoksa ilk sayı; başka önekli ve biçimsiz kodlar sayılmaz', () => {
    assert.equal(kodOner('H', []), 'H-01');
    assert.equal(kodOner('H', ['D-09', 'H-ABC', 'X']), 'H-01');
  });

  test('iki haneyi aşan sayı da büyür', () => {
    assert.equal(kodOner('D', ['D-99']), 'D-100');
  });
});
