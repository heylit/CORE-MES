import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SATIR_EN_COK, type TopluSiparisSatiri } from '#paylasilan/sozlesme/siparisler.ts';
import {
  TOPLU_ESKI_REVIZYON, TOPLU_SATIR_COK, TOPLU_SIPARIS_VAR, type TopluBaglam, karsilamaCoz, topluDenetle,
} from './toplu-kurallar.ts';

const baglam = (ek: Partial<TopluBaglam> = {}): TopluBaglam => ({
  bugun: '2026-11-19',
  firmalar: new Map([['ORN-F1', { id: 1, kod: 'ORN-F1', ad: 'ORN Müşteri', tur: 'musteri', aktif: true }]]),
  kartlar: new Map([
    ['ORN-M1', { no: 10, kod: 'ORN-M1', ad: 'ORN Mil', tur: 'mamul', onayDurumu: 'aktif', birim: 'adet', yururlukte: true }],
    ['ORN-T1', { no: 11, kod: 'ORN-T1', ad: 'ORN Ticari', tur: 'ticari_mal', onayDurumu: 'aktif', birim: 'adet', yururlukte: true }],
    ['ORN-ESKI', { no: 12, kod: 'ORN-ESKI', ad: 'ORN Eski', tur: 'mamul', onayDurumu: 'aktif', birim: 'adet', yururlukte: false }],
  ]),
  varOlanlar: new Set(),
  ...ek,
});
let sira = 0;
const satir = (ek: Partial<TopluSiparisSatiri> = {}): TopluSiparisSatiri => ({
  sira: (sira += 1), siparisNo: 'ORN-1', firma: 'orn-f1', siparisTarihi: '2026-03-02', termin: '2026-04-15', malzeme: 'orn-m1', miktar: '12', birimFiyat: '1,5',
  karsilama: null, paraBirimi: null, kdvOrani: null, logo: false, ...ek,
});

describe('3455-3 toplu sipariş kuralları', () => {
  test('karşılama adı Türkçe yazımla çözülür; boş kart türüne kalır; bilinmeyen null', () => {
    assert.equal(karsilamaCoz('Üret'), 'uret');
    assert.equal(karsilamaCoz(' stoktan '), 'stok');
    assert.equal(karsilamaCoz('Satın al'), 'satin-al');
    assert.equal(karsilamaCoz(''), undefined);
    assert.equal(karsilamaCoz('başka'), null);
  });

  test('aynı firma ve sipariş no tek sipariş; termin en geç kalemin; virgüllü fiyat; kod büyük-küçük harf farkı yok; ticari mal stoktan', () => {
    const r = topluDenetle([satir(), satir({ malzeme: 'ORN-T1', termin: '2026-06-01', logo: true }), satir({ siparisNo: 'ORN-2' })], baglam());
    assert.deepEqual(r.denetim.map((d) => d.hatalar), [[], [], []]);
    assert.equal(r.siparisler.length, 2);
    const [a] = r.siparisler;
    assert.deepEqual([a?.termin, a?.logoBaglanacak, a?.paraBirimi, a?.kdvOrani, a?.kalemler.map((k) => [k.birimFiyat, k.karsilama])],
      ['2026-06-01', true, 'TRY', '20', [['1.5', 'uret'], ['1.5', 'stok']]]);
    assert.equal(r.siparisler[1]?.logoBaglanacak, false);
  });

  test('hata varken hiçbir sipariş dönmez (hepsi ya da hiçbiri)', () => {
    const r = topluDenetle([satir(), satir({ siparisNo: 'ORN-2', malzeme: 'ORN-YOK' })], baglam());
    assert.equal(r.siparisler.length, 0);
    assert.equal(r.denetim[0]?.hatalar.length, 0);
  });

  test('eski revizyon, var olan sipariş, adet birimde kesir, iki yıldan eski tarih ve satır sınırı reddedilir', () => {
    assert.equal(topluDenetle([satir({ malzeme: 'ORN-ESKI' })], baglam()).denetim[0]?.hatalar[0]?.ileti, TOPLU_ESKI_REVIZYON);
    assert.equal(topluDenetle([satir()], baglam({ varOlanlar: new Set(['1|ORN-1']) })).denetim[0]?.hatalar[0]?.ileti, TOPLU_SIPARIS_VAR);
    assert.equal(topluDenetle([satir({ miktar: '2.5' })], baglam()).denetim[0]?.hatalar[0]?.alan, 'miktar');
    assert.equal(topluDenetle([satir({ siparisTarihi: '2024-11-18', termin: '2024-12-01' })], baglam()).denetim[0]?.hatalar[0]?.alan, 'siparisTarihi');
    const cok = Array.from({ length: SATIR_EN_COK + 1 }, () => satir());
    assert.equal(topluDenetle(cok, baglam()).denetim[0]?.hatalar[0]?.ileti, TOPLU_SATIR_COK);
  });
});
