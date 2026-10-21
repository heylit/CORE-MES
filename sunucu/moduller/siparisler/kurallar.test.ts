import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  FIRMA_MUSTERI_DEGIL, FIRMA_PASIF, FIRMA_YOK, MALZEME_AKTIF_DEGIL, MALZEME_SATILMAZ, MALZEME_YOK, YALNIZ_TASLAK,
  duzenlemeReddi, firmaReddi, gecisHedefi, gecisReddi, malzemeReddi, siparisNo,
  FIYAT_EKSIK, KARTSIZ_SATIR, KART_BAGLANAMAZ, YALNIZ_YENI_TEKLIF, fiyatReddi, kartBaglamaReddi, kartsizSatirReddi, talepDuzenlemeReddi,
  surumHedefi, teklifGecisReddi, teklifHedefi, teklifNo,
} from './kurallar.ts';

describe('siparisler kuralları (saf)', () => {
  test('SIP-01 müşteri ve iki yönlü firma geçer; tedarikçi, olmayan ve yeni seçilen pasif firma reddedilir', () => {
    assert.equal(firmaReddi({ tur: 'musteri', aktif: true }, 1, null), null);
    assert.equal(firmaReddi({ tur: 'ikisi', aktif: true }, 1, null), null);
    assert.equal(firmaReddi({ tur: 'tedarikci', aktif: true }, 1, null), FIRMA_MUSTERI_DEGIL);
    assert.equal(firmaReddi(null, 1, null), FIRMA_YOK);
    assert.equal(firmaReddi({ tur: 'musteri', aktif: false }, 1, null), FIRMA_PASIF);
    assert.equal(firmaReddi({ tur: 'musteri', aktif: false }, 1, 1), null);
  });

  test('SIP-02 aktif mamul, yarı mamul ve ticari mal geçer; hizmet, sarf, onaysız ve olmayan kart reddedilir', () => {
    for (const tur of ['mamul', 'yarimamul', 'ticari_mal']) assert.equal(malzemeReddi({ tur, onayDurumu: 'aktif' }), null);
    assert.equal(malzemeReddi({ tur: 'hizmet', onayDurumu: 'aktif' }), MALZEME_SATILMAZ);
    assert.equal(malzemeReddi({ tur: 'sarf', onayDurumu: 'aktif' }), MALZEME_SATILMAZ);
    assert.equal(malzemeReddi({ tur: 'mamul', onayDurumu: 'taslak' }), MALZEME_AKTIF_DEGIL);
    assert.equal(malzemeReddi(null), MALZEME_YOK);
  });

  test('SIP-03 yalnız taslak düzenlenir', () => {
    assert.equal(duzenlemeReddi('taslak'), null);
    for (const d of ['onayli', 'kapandi', 'iptal'] as const) assert.equal(duzenlemeReddi(d), YALNIZ_TASLAK);
  });

  test('SIP-04 geçişler: taslak onaylanır, onaylı kapanır, taslak ve onaylı iptal edilir; son durumlardan geçiş yok', () => {
    assert.equal(gecisReddi('taslak', 'onayla'), null);
    assert.equal(gecisReddi('onayli', 'kapat'), null);
    assert.equal(gecisReddi('taslak', 'iptal'), null);
    assert.equal(gecisReddi('onayli', 'iptal'), null);
    assert.equal(gecisReddi('onayli', 'onayla'), 'Onaylı sipariş onaylanamaz.');
    assert.equal(gecisReddi('taslak', 'kapat'), 'Taslak sipariş kapatılamaz.');
    assert.equal(gecisReddi('kapandi', 'iptal'), 'Kapanmış sipariş iptal edilemez.');
    assert.equal(gecisReddi('iptal', 'onayla'), 'İptal edilmiş sipariş onaylanamaz.');
    assert.deepEqual([gecisHedefi('onayla'), gecisHedefi('kapat'), gecisHedefi('iptal')], ['onayli', 'kapandi', 'iptal']);
  });

  test('numara SS-yıl-sıra, sıra en az üç basamak', () => {
    assert.equal(siparisNo(2026, 7), 'SS-2026-007');
    assert.equal(siparisNo(2026, 1234), 'SS-2026-1234');
  });
});

describe('teklif kuralları (saf)', () => {
  test('TKL-03 talep yalnız yeni teklifte düzenlenir', () => {
    assert.equal(talepDuzenlemeReddi('yeni'), null);
    for (const d of ['verildi', 'revizyon', 'kabul', 'red', 'siparis'] as const) assert.equal(talepDuzenlemeReddi(d), YALNIZ_YENI_TEKLIF);
  });

  test('TKL-04 her talep satırına tam bir fiyat: eksik, fazla, yinelenen ve yabancı satır reddedilir', () => {
    assert.equal(fiyatReddi([1, 2], [2, 1]), null);
    assert.equal(fiyatReddi([1, 2], [1]), FIYAT_EKSIK);
    assert.equal(fiyatReddi([1, 2], [1, 2, 3]), FIYAT_EKSIK);
    assert.equal(fiyatReddi([1, 2], [1, 1]), FIYAT_EKSIK);
    assert.equal(fiyatReddi([1, 2], [1, 3]), FIYAT_EKSIK);
  });

  test('TKL-05 geçişler', () => {
    assert.equal(teklifGecisReddi('yeni', 'surum'), null);
    assert.equal(teklifGecisReddi('revizyon', 'surum'), null);
    assert.equal(teklifGecisReddi('verildi', 'kabul'), null);
    assert.equal(teklifGecisReddi('verildi', 'revizyon'), null);
    assert.equal(teklifGecisReddi('kabul', 'siparis'), null);
    assert.equal(teklifGecisReddi('yeni', 'kabul'), 'Teklif durumu "yeni"; kabul edilemez.');
    assert.equal(teklifGecisReddi('kabul', 'red'), 'Teklif durumu "kabul edildi"; reddedilemez.');
    assert.equal(teklifGecisReddi('siparis', 'siparis'), 'Teklif durumu "siparişe dönüştü"; siparişe dönüştürülemez.');
    assert.deepEqual((['surum', 'revizyon', 'kabul', 'red', 'siparis'] as const).map(teklifHedefi), ['verildi', 'revizyon', 'kabul', 'red', 'siparis']);
  });

  test('TKL-11 (291 a) eşiği aşan iskonto onay bekler; onay yalnız bekleyen teklife, bekleyen teklif kabul edilmez', () => {
    assert.deepEqual(['0', '9.99', '10', '10.01', '99.99'].map(surumHedefi), ['verildi', 'verildi', 'verildi', 'onay-bekliyor', 'onay-bekliyor']);
    assert.equal(teklifGecisReddi('onay-bekliyor', 'iskonto-onay'), null);
    assert.equal(teklifHedefi('iskonto-onay'), 'verildi');
    assert.equal(teklifGecisReddi('verildi', 'iskonto-onay'), 'Teklif durumu "verildi"; onaylanacak iskonto yok.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'kabul'), 'Teklif durumu "iskonto onayı bekliyor"; kabul edilemez.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'revizyon'), 'Teklif durumu "iskonto onayı bekliyor"; revizyon istenemez.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'surum'), null);
    assert.equal(teklifGecisReddi('onay-bekliyor', 'red'), null);
  });

  test('TKL-06 kartsız satır siparişe dönüşmez; reddedilmiş ve dönüşmüş teklife kart bağlanmaz', () => {
    assert.equal(kartsizSatirReddi([1, 2]), null);
    assert.equal(kartsizSatirReddi([1, null]), KARTSIZ_SATIR);
    assert.equal(kartBaglamaReddi('kabul'), null);
    assert.equal(kartBaglamaReddi('red'), KART_BAGLANAMAZ);
    assert.equal(kartBaglamaReddi('siparis'), KART_BAGLANAMAZ);
    assert.equal(teklifNo(2026, 5), 'TK-2026-005');
  });
});
