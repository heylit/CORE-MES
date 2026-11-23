import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calisanMi, kalemKarari, yazimSayimi } from './adim-matrisi-kurali.ts';
import type { KalemGirdisi } from './adim-matrisi-kurali.ts';

const g = (e: Partial<KalemGirdisi> = {}): KalemGirdisi => ({ emirDurumu: 'basladi', sistemStatusu: 'malzeme', elleVar: false, statu: 'cizim', calisanOnay: false, ...e });

describe('Adım Durumu matrisi: toplu yazım kalem kararı (3604)', () => {
  test('açık emirde bekleyen adıma yazılır', () => {
    assert.deepEqual(kalemKarari(g()), { yazilir: true });
    assert.deepEqual(kalemKarari(g({ emirDurumu: 'taslak', sistemStatusu: 'onceki' })), { yazilir: true });
  });
  test('biten ve iptal emir atlanır; otomatiğe dön de dahil', () => {
    assert.deepEqual(kalemKarari(g({ emirDurumu: 'bitti' })), { yazilir: false, neden: 'emir-kapali' });
    assert.deepEqual(kalemKarari(g({ emirDurumu: 'iptal', statu: null, elleVar: true })), { yazilir: false, neden: 'emir-kapali' });
  });
  test('beklemedeki emrin adımı atlanır', () => {
    assert.deepEqual(kalemKarari(g({ sistemStatusu: 'beklemede' })), { yazilir: false, neden: 'beklemede' });
  });
  test('biten adıma statü yazılmaz ama otomatiğe dön açık kalır', () => {
    assert.deepEqual(kalemKarari(g({ sistemStatusu: 'bitti' })), { yazilir: false, neden: 'adim-bitti' });
    assert.deepEqual(kalemKarari(g({ sistemStatusu: 'bitti', statu: null, elleVar: true })), { yazilir: true });
  });
  test('çalışan adım toplu atlanır, yalnız tek hücre onayıyla yazılır', () => {
    for (const s of ['uretimde', 'duraklatildi', 'durdu'] as const) {
      assert.equal(calisanMi(s), true);
      assert.deepEqual(kalemKarari(g({ sistemStatusu: s })), { yazilir: false, neden: 'calisiyor' });
      assert.deepEqual(kalemKarari(g({ sistemStatusu: s, calisanOnay: true })), { yazilir: true });
    }
    assert.equal(calisanMi('fasonda'), false);
  });
  test('otomatiğe dön: elle statüsü olmayan atlanır', () => {
    assert.deepEqual(kalemKarari(g({ statu: null })), { yazilir: false, neden: 'elle-yok' });
    assert.deepEqual(kalemKarari(g({ statu: null, elleVar: true, sistemStatusu: 'uretimde' })), { yazilir: true });
  });
  test('sayım: yazılır, atlanır ve nedenler sırayla; çalışan uyarısı yalnız yazılanları sayar', () => {
    const s = yazimSayimi([
      g(), g(), g({ emirDurumu: 'bitti' }), g({ sistemStatusu: 'beklemede' }), g({ sistemStatusu: 'beklemede' }), g({ sistemStatusu: 'bitti' }),
      g({ sistemStatusu: 'uretimde' }), g({ sistemStatusu: 'durdu', calisanOnay: true }),
    ]);
    assert.equal(s.yazilir, 3);
    assert.equal(s.atlanir, 5);
    assert.deepEqual(s.nedenler, [{ neden: 'emir-kapali', sayi: 1 }, { neden: 'beklemede', sayi: 2 }, { neden: 'adim-bitti', sayi: 1 }, { neden: 'calisiyor', sayi: 1 }]);
    assert.equal(s.calisanUyarisi, 1);
  });
  test('boş seçimde sayı sıfırdır', () => {
    assert.deepEqual(yazimSayimi([]), { yazilir: 0, atlanir: 0, nedenler: [], calisanUyarisi: 0 });
  });
});
