import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { birimFiyati, birimKarsiligi, stokBirimiBasinaKg } from './kurallar.ts';

// 2891-1: birim_agirlik_kg bütün parça ya da ambalaj başınadır; uzunluk ve alan stoklu kartta kg fiyatından birim fiyat çıkmaz.
describe('2891-1: stok biriminin bir birimi kaç kg (saf)', () => {
  test('kg 1; adet, rulo ve birimsiz kartta parça ağırlığı; ağırlıksız ya da sıfır null', () => {
    assert.equal(stokBirimiBasinaKg('kg', null), 1);
    assert.equal(stokBirimiBasinaKg(' KG ', 3), 1);
    assert.equal(stokBirimiBasinaKg('adet', 2.5), 2.5);
    assert.equal(stokBirimiBasinaKg('rulo', 12.5), 12.5);
    assert.equal(stokBirimiBasinaKg(null, 4), 4);
    assert.equal(stokBirimiBasinaKg('adet', null), null);
    assert.equal(stokBirimiBasinaKg('adet', 0), null);
  });
  test('uzunluk ve alan birimleri null (ağırlık girilmiş olsa da)', () => {
    for (const b of ['mm', 'cm', 'm', 'mt', 'metre', 'mm2', 'mm²', 'cm2', 'cm²', 'm2', 'm²', 'metrekare', ' M ']) assert.equal(stokBirimiBasinaKg(b, 2), null, b);
  });
  test('birim fiyat aynı kuralla: m ve m² boş, adet ve rulo kg fiyatı x ağırlık, kg kg fiyatının kendisi', () => {
    for (const b of ['m', 'mm', 'm²', 'm2']) assert.equal(birimFiyati('50', b, 2), null, b);
    assert.equal(birimFiyati('50', 'adet', 2), '100');
    assert.equal(birimFiyati('50', 'rulo', 0.5), '25');
    assert.equal(birimFiyati('125.5', 'kg', null), '125.5');
  });
  test('kg karşılığı (SAT-78) davranışı değişmez', () => {
    assert.deepEqual(birimKarsiligi('4', 'adet', { stokBirimi: 'adet', birimKg: 2.5 }), { miktar: '10', birim: 'kg' });
    assert.equal(birimKarsiligi('4', 'm', { stokBirimi: 'm', birimKg: 2.5 }), null);
    assert.equal(birimKarsiligi('4', 'kg', { stokBirimi: 'kg', birimKg: 1 }), null);
    assert.equal(birimKarsiligi('4', 'adet', { stokBirimi: null, birimKg: 2.5 }), null);
  });
});
