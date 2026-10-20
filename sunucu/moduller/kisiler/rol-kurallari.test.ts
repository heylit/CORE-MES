import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ILETILER, almaReddi, atamaReddi, islemDegistirmeReddi } from './kurallar.ts';

describe('rol atama kuralları (saf)', () => {
  test('atama: bayraklı rolü yalnız bayraklı kişi atar; bayraksız rolü herkes başkasına atar', () => {
    assert.deepEqual(atamaReddi({ rolBayrakli: true, aktorBayrakli: false, kendiKendine: false }), { tur: 'yetki', ileti: ILETILER.bayrakliYetkisiz });
    assert.equal(atamaReddi({ rolBayrakli: true, aktorBayrakli: true, kendiKendine: false }), null);
    assert.equal(atamaReddi({ rolBayrakli: false, aktorBayrakli: false, kendiKendine: false }), null);
  });

  test('atama: bayraksız kişi kendine hiçbir rol atayamaz; bayraklı kişi atayabilir', () => {
    assert.deepEqual(atamaReddi({ rolBayrakli: false, aktorBayrakli: false, kendiKendine: true }), { tur: 'yetki', ileti: ILETILER.kendiRol });
    assert.deepEqual(atamaReddi({ rolBayrakli: true, aktorBayrakli: false, kendiKendine: true }), { tur: 'yetki', ileti: ILETILER.bayrakliYetkisiz });
    assert.equal(atamaReddi({ rolBayrakli: false, aktorBayrakli: true, kendiKendine: true }), null);
  });

  const alma = { rolBayrakli: true, aktorBayrakli: true, kendiKendine: false, kalanBayrakli: 1 };

  test('alma: bayraksız rolde bayraklı kurallar işlemez', () => {
    assert.equal(almaReddi({ rolBayrakli: false, aktorBayrakli: false, kendiKendine: true, kalanBayrakli: 0 }), null);
  });

  test('alma: bayraklı rolde sırayla yetki, kendi kendine, son bayraklı; hepsi geçerse kabul', () => {
    assert.equal(almaReddi(alma), null);
    assert.deepEqual(almaReddi({ ...alma, aktorBayrakli: false }), { tur: 'yetki', ileti: ILETILER.bayrakliYetkisiz });
    assert.deepEqual(almaReddi({ ...alma, kendiKendine: true }), { tur: 'gecersiz', ileti: ILETILER.kendiBayrakli });
    assert.deepEqual(almaReddi({ ...alma, kalanBayrakli: 0 }), { tur: 'gecersiz', ileti: ILETILER.sonBayrakli });
    assert.equal(almaReddi({ ...alma, kalanBayrakli: 2 }), null);
  });

  const degisim = { aktorBayrakli: true, rolBayrakli: false, islemKayitli: true };

  test('işlem değiştirme: sırayla aktör bayrağı, bayraklı rol, kayıtlı işlem; hepsi geçerse kabul', () => {
    assert.equal(islemDegistirmeReddi(degisim), null);
    assert.deepEqual(islemDegistirmeReddi({ ...degisim, aktorBayrakli: false, rolBayrakli: true }), { tur: 'yetki', ileti: ILETILER.matrisYetkisiz });
    assert.deepEqual(islemDegistirmeReddi({ ...degisim, rolBayrakli: true, islemKayitli: false }), { tur: 'gecersiz', ileti: ILETILER.bayrakliMatris });
    assert.deepEqual(islemDegistirmeReddi({ ...degisim, islemKayitli: false }), { tur: 'gecersiz', ileti: ILETILER.islemKayitsiz });
  });
});
