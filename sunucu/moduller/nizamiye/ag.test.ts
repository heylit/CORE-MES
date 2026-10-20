import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cihazAgiOku, cihazAginda, hamSaklamaGunuOku } from './ag.ts';

describe('nizamiye kart okuyucu ağı', () => {
  test('cihaz ağı yalnız kurum içi aralıktır; döngü adresi ve genel adres açılışta reddedilir; değişken yoksa hiçbir adres kabul edilmez', () => {
    assert.deepEqual(cihazAgiOku({}), []);
    assert.equal(cihazAginda(cihazAgiOku({}), '10.0.7.21'), false);
    const ag = cihazAgiOku({ TMIV2_PDKS_CIHAZ_AGI: '10.0.7.0/24, fd00::/64' });
    assert.equal(cihazAginda(ag, '10.0.7.21'), true);
    assert.equal(cihazAginda(ag, '::ffff:10.0.7.21'), true);
    assert.equal(cihazAginda(ag, '10.0.8.1'), false);
    assert.equal(cihazAginda(ag, '127.0.0.1'), false);
    assert.throws(() => cihazAgiOku({ TMIV2_PDKS_CIHAZ_AGI: '127.0.0.0/8' }), /yalnız kurum içi/);
    assert.throws(() => cihazAgiOku({ TMIV2_PDKS_CIHAZ_AGI: '10.0.0.0/7' }), /yalnız kurum içi/);
    assert.throws(() => cihazAgiOku({ TMIV2_PDKS_CIHAZ_AGI: 'bozuk' }), /geçersiz/);
  });

  test('ham gövde saklama süresi varsayılan 365 gün, 30-3650 arası', () => {
    assert.equal(hamSaklamaGunuOku({}), 365);
    assert.equal(hamSaklamaGunuOku({ TMIV2_PDKS_HAM_SAKLAMA_GUN: '90' }), 90);
    assert.throws(() => hamSaklamaGunuOku({ TMIV2_PDKS_HAM_SAKLAMA_GUN: '29' }), /30-3650/);
    assert.throws(() => hamSaklamaGunuOku({ TMIV2_PDKS_HAM_SAKLAMA_GUN: '1e3' }), /30-3650/);
  });
});
