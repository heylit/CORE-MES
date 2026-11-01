import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ayarKaliteYogunluklari } from './kurallar.ts';

test('1480 ayarda eklenen kalitenin yoğunluğu: aile|kod anahtarıyla; biçimi tutmayan ve pozitif olmayan alınmaz', () => {
  const m = ayarKaliteYogunluklari({
    kaliteler: [
      { fam: 'metal', cls: 'x', kod: 'Y1', p: { ro: 2.7 } },
      { fam: 'metal', cls: 'x', kod: 'Y1', p: { ro: 9 } },
      { fam: 'metal', kod: 'Y2', p: { ro: 0 } },
      { fam: 'metal', kod: 'Y3', p: { ro: '7.8' } },
      { fam: 'plastik', kod: 'P1', p: {} },
      null, 'bozuk',
    ],
  });
  assert.deepEqual([...m], [['metal|Y1', 2.7]]);
  assert.equal(ayarKaliteYogunluklari(null).size, 0);
  assert.equal(ayarKaliteYogunluklari({ kaliteler: 'yok' }).size, 0);
});
