import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FASON_KONTROLLERI, KONTROLSUZ_GKKYA_DONDU, MUAYENE_SURESI_YOK, fasonKontrolDuzelt, fasonKontrolSecilebilir, fasonKontrolUyarisi, fasonYolu } from './fason-kontrol.ts';

describe('fason kontrol türü (3708)', () => {
  test('GKK bugünkü sonucu verir: fiziksel GKK, TMI\'ye dönüş, payı eklenir', () => {
    for (const sonraki of [true, false]) {
      assert.deepEqual(fasonYolu('gkk', sonraki), { konanAdim: 'gkk', dogrudanSonrakiFirmaya: false, kapanis: 'donus', malKabul: 'gkk', donusPayi: true });
    }
  });

  test('kaynağında muayene: sonraki fasonsa doğrudan ikinci firmaya, değilse TMI\'ye adet ve hasar kontrolüyle', () => {
    assert.deepEqual(fasonYolu('kaynakta', true), { konanAdim: 'kaynakta', dogrudanSonrakiFirmaya: true, kapanis: 'aktarim', malKabul: 'yok', donusPayi: false });
    assert.deepEqual(fasonYolu('kaynakta', false), { konanAdim: 'kaynakta', dogrudanSonrakiFirmaya: false, kapanis: 'donus', malKabul: 'adet-hasar', donusPayi: true });
  });

  test('kontrolsüz: kontrol adımı yok, aktarımla kapanır', () => {
    assert.deepEqual(fasonYolu('kontrolsuz', true), { konanAdim: null, dogrudanSonrakiFirmaya: true, kapanis: 'aktarim', malKabul: 'yok', donusPayi: false });
  });

  test('kontrolsüz yalnız sonraki adım fasonsa seçilebilir; değilse GKK\'ya döner ve uyarı verir', () => {
    assert.equal(fasonKontrolSecilebilir('kontrolsuz', true), true);
    assert.equal(fasonKontrolSecilebilir('kontrolsuz', false), false);
    for (const k of FASON_KONTROLLERI) assert.equal(fasonKontrolSecilebilir(k, false), k !== 'kontrolsuz');
    assert.deepEqual(fasonKontrolDuzelt('kontrolsuz', false), { kontrol: 'gkk', uyari: KONTROLSUZ_GKKYA_DONDU });
    assert.deepEqual(fasonKontrolDuzelt('kontrolsuz', true), { kontrol: 'kontrolsuz', uyari: null });
    assert.deepEqual(fasonYolu('kontrolsuz', false), fasonYolu('gkk', false));
  });

  test('kaynağında muayenede süre boşsa süre yok uyarısı çıkar', () => {
    assert.equal(fasonKontrolUyarisi('kaynakta', null), MUAYENE_SURESI_YOK);
    assert.equal(fasonKontrolUyarisi('kaynakta', 2), null);
    assert.equal(fasonKontrolUyarisi('gkk', null), null);
  });
});
