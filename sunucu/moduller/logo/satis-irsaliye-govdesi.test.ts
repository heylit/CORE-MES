import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SATIS_IRSALIYE_ALANLARI, satisIrsaliyeGovdesi } from './satis-irsaliye-govdesi.ts';
import type { SevkBelgesi } from './satis-irsaliye-kurallari.ts';

const belge = (ek: Partial<SevkBelgesi> = {}): SevkBelgesi => ({
  no: 'SV-ORN-1', tarih: '2026-11-25', tur: 'toptan', cariKodu: 'ORN-CARI',
  satirlar: [{ sira: 1, stokKodu: 'ORN-MAM-1', miktar: '10', birim: 'adet', ambarNo: 2, siparisSatiriLogoRef: 100, lotlu: false, stoktaki: '25' }], ...ek,
});

describe('satış irsaliyesi gövdesi (kapalı, kimse çağırmaz)', () => {
  test('toptan: TRCODE 8, tarih Logo biçimi, tek ambar, sipariş bağı yalnız satırda, NOTES1 anahtar', () => {
    const r = satisIrsaliyeGovdesi(belge());
    assert.ok('govde' in r);
    const a = SATIS_IRSALIYE_ALANLARI;
    assert.equal(r.govde[a.tur], 8);
    assert.equal(r.govde[a.tarih], '25.11.2026');
    assert.equal(r.govde[a.ambar], 2);
    assert.equal(r.govde[a.notlar1], 'SV-ORN-1');
    const satir = (r.govde[a.satirlar] as Record<string, unknown>[])[0];
    assert.equal(satir?.[a.birim], 'ADET');
    assert.equal(satir?.[a.siparisSatiri], 100);
  });
  test('ölçülmemiş etiketler gövdede yok: taşıma, e-irsaliye, fiyat, lot', () => {
    const r = satisIrsaliyeGovdesi(belge());
    assert.ok('govde' in r);
    const metin = JSON.stringify(r.govde);
    for (const e of ['EDESPATCH', 'PLATENUM', 'DRIVER', 'SHIP_DATE', 'PRICE', 'SL_DETAILS', 'SOURCEINDEX', 'TIME']) assert.equal(metin.includes(e), false, e);
  });
  test('konsinye ölçülene kadar gitmez; engelli belge gövde vermez', () => {
    assert.ok('hata' in satisIrsaliyeGovdesi(belge({ tur: 'konsinye' })));
    assert.ok('hata' in satisIrsaliyeGovdesi(belge({ cariKodu: null })));
    assert.ok('hata' in satisIrsaliyeGovdesi(belge({ tarih: 'bozuk' })));
  });
});
