import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { turkceKarsilastir, turkceSirala } from './siralama.ts';

describe('Türkçe sıralama', () => {
  test('Türkçe harfler alfabedeki yerinde, büyük ve küçük harf yan yana', () => {
    const adlar = ['Zeki', 'Çelik', 'cam', 'Ilgaz', 'İnce', 'ışık', 'Öz', 'Ordu', 'Şahin', 'Sarı', 'Ünal', 'Uslu', 'dal', 'Ceren'];
    assert.deepEqual([...adlar].sort(turkceKarsilastir), [
      'cam', 'Ceren', 'Çelik', 'dal', 'Ilgaz', 'ışık', 'İnce', 'Ordu', 'Öz', 'Sarı', 'Şahin', 'Uslu', 'Ünal', 'Zeki',
    ]);
  });

  test('sayılar değerine göre', () => {
    assert.deepEqual(['ORN-10', 'ORN-2', 'ORN-1'].sort(turkceKarsilastir), ['ORN-1', 'ORN-2', 'ORN-10']);
  });

  test('boş değer sona, dizi değişmez', () => {
    const dizi = [{ ad: null }, { ad: 'Şaft' }, { ad: 'Mil' }] as const;
    assert.deepEqual(turkceSirala(dizi, (o) => o.ad).map((o) => o.ad), ['Mil', 'Şaft', null]);
    assert.equal(dizi[0].ad, null);
  });
});
