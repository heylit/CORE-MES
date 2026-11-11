import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { disSiparisDuzeltmeGovdesi, siparisIcerigiAyikla, siparisIcerikIzi } from './kurallar.ts';
import type { LogoSiparisIcerigi } from './kurallar.ts';

// Yardımcının içerik cevabı biçiminde uydurma sipariş (ORN-): dövizli malzeme satırı, kapalı hizmet satırı, açık hizmet satırı.
const cevap = (ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  logicalRef: 7001, number: 'ORN-DIS-1', date: '2026-11-02', arpCode: 'ORN-CARI-1', currencyType: 20, rate: 30, status: 4, cancelled: false,
  lines: [
    { logicalRef: 7002, type: 0, code: 'ORN-MLZ-1', name: 'Deneme mil', quantity: 10, unitCode: 'ADET', price: 300, currencyPrice: 10, vatRate: 20, dueDate: '2026-11-20', description: 'ilk', closed: false },
    { logicalRef: 7003, type: 4, code: 'ORN-HZM-1', name: 'Deneme hizmet', quantity: 1, unitCode: 'ADET', price: 60, currencyPrice: 2, vatRate: 20, dueDate: null, description: null, closed: true },
    { logicalRef: 7004, type: 4, code: 'ORN-HZM-2', name: 'Deneme kaplama', quantity: 2, unitCode: 'ADET', price: 90, currencyPrice: 3, vatRate: 20, dueDate: null, description: null, closed: false },
  ],
  ...ek,
});
const icerik = (ek: Record<string, unknown> = {}): LogoSiparisIcerigi => {
  const i = siparisIcerigiAyikla(cevap(ek));
  assert.ok(i);
  return i;
};
const govdeSatirlari = (g: Record<string, unknown>): Record<string, unknown>[] => g['lines'] as Record<string, unknown>[];

describe('D7 sipariş içeriği okuması', () => {
  test('yardımcı cevabı ayıklanır; TL siparişte döviz türü null', () => {
    const i = icerik();
    assert.equal(i.ref, 7001);
    assert.equal(i.dovizTuru, 20);
    assert.deepEqual(i.satirlar.map((s) => [s.ref, s.turKodu, s.miktar, s.dovizFiyati, s.kapali]), [
      [7002, 0, '10', '10', false], [7003, 4, '1', '2', true], [7004, 4, '2', '3', false],
    ]);
    assert.equal(icerik({ currencyType: 0 }).dovizTuru, null);
  });
  test('eksik okunan cevap bütünüyle reddedilir (okunmayan açık satır geri yazılınca kapanırdı)', () => {
    assert.equal(siparisIcerigiAyikla({ ...cevap(), lines: undefined }), null);
    assert.equal(siparisIcerigiAyikla({ ...cevap(), logicalRef: 0 }), null);
    const satirlar = cevap()['lines'] as Record<string, unknown>[];
    assert.equal(siparisIcerigiAyikla({ ...cevap(), lines: [{ ...satirlar[0], quantity: undefined }] }), null);
    assert.equal(siparisIcerigiAyikla({ ...cevap(), lines: [satirlar[0], satirlar[0]] }), null);
    assert.equal(siparisIcerigiAyikla([]), null);
  });
  test('iz düzeltmenin dayandığı alan değişince değişir, satır adı değişince değişmez', () => {
    const iz = siparisIcerikIzi(icerik());
    const satirlar = cevap()['lines'] as Record<string, unknown>[];
    const ile = (i: number, ek: Record<string, unknown>) => siparisIcerikIzi(icerik({ lines: satirlar.map((s, j) => (j === i ? { ...s, ...ek } : s)) }));
    assert.equal(ile(0, { name: 'Başka ad' }), iz);
    assert.notEqual(ile(0, { quantity: 11 }), iz);
    assert.notEqual(ile(0, { currencyPrice: 11 }), iz);
    assert.notEqual(ile(2, { closed: true }), iz);
    assert.notEqual(siparisIcerikIzi(icerik({ date: '2026-11-03' })), iz);
  });
});

describe('D7 düzeltme gövdesi', () => {
  test('başlık okumadan gelir; açık satırlar geri gider, kapalı satır gitmez; durum gönderilmez', () => {
    const r = disSiparisDuzeltmeGovdesi(icerik(), { satirlar: [{ ref: 7002, miktar: '12' }], yeniSatirlar: [] });
    assert.ok('govde' in r, JSON.stringify(r));
    const { lines, ...baslik } = r.govde;
    assert.deepEqual(baslik, { logicalRef: 7001, number: 'ORN-DIS-1', date: '02.11.2026', arpCode: 'ORN-CARI-1', externalOrder: true, currencyCode: 20, rate: 30 });
    assert.ok(Array.isArray(lines));
    assert.deepEqual(govdeSatirlari(r.govde), [
      { logicalRef: 7002, type: 0, masterCode: 'ORN-MLZ-1', quantity: 12, price: 10, unitCode: 'ADET' },
      { logicalRef: 7004, type: 4, masterCode: 'ORN-HZM-2', quantity: 2, price: 3, unitCode: 'ADET' },
    ]);
    assert.deepEqual(r.ozet, { tarih: false, degisen: [7002], kapanan: [], yeni: 0 });
  });
  test('TL siparişte fiyat yerel fiyattır, döviz alanı gitmez', () => {
    const r = disSiparisDuzeltmeGovdesi(icerik({ currencyType: 0, rate: 0 }), { satirlar: [{ ref: 7004, fiyat: '95.5' }], yeniSatirlar: [] });
    assert.ok('govde' in r);
    assert.equal('currencyCode' in r.govde, false);
    assert.equal('rate' in r.govde, false);
    assert.deepEqual(govdeSatirlari(r.govde).map((s) => s['price']), [300, 95.5]);
  });
  test('kapatılan satır gövdeden çıkar; termin ve açıklama yalnız değişince gider; KDV var olan satıra gitmez', () => {
    const r = disSiparisDuzeltmeGovdesi(icerik(), {
      tarih: '2026-11-05',
      satirlar: [{ ref: 7004, kapat: true }, { ref: 7002, termin: '2026-11-25', aciklama: 'ilk' }],
      yeniSatirlar: [],
    });
    assert.ok('govde' in r);
    assert.equal(r.govde['date'], '05.11.2026');
    assert.deepEqual(govdeSatirlari(r.govde), [{ logicalRef: 7002, type: 0, masterCode: 'ORN-MLZ-1', quantity: 10, price: 10, unitCode: 'ADET', dueDate: '25.11.2026' }]);
    assert.deepEqual(r.ozet, { tarih: true, degisen: [7002], kapanan: [7004], yeni: 0 });
  });
  test('yeni satır kayıtsız gider, KDV ve birim kodu ile', () => {
    const r = disSiparisDuzeltmeGovdesi(icerik(), {
      satirlar: [], yeniSatirlar: [{ hizmet: false, kod: 'ORN-MLZ-9', miktar: '3', fiyat: '4.25', birim: 'adet', kdv: 20, termin: '2026-12-01' }],
    });
    assert.ok('govde' in r);
    assert.deepEqual(govdeSatirlari(r.govde).at(-1), { type: 0, masterCode: 'ORN-MLZ-9', quantity: 3, price: 4.25, unitCode: 'ADET', vatRate: 20, dueDate: '01.12.2026' });
    assert.equal(r.ozet.yeni, 1);
  });
  test('ret: iptal, kapalı satır, bilinmeyen satır, son açık satırı kapatma, değişiklik yok, yabancı satır türü', () => {
    const hata = (i: LogoSiparisIcerigi, d: Parameters<typeof disSiparisDuzeltmeGovdesi>[1]): string => {
      const r = disSiparisDuzeltmeGovdesi(i, d);
      assert.ok('hata' in r, JSON.stringify(r));
      return r.hata;
    };
    const bos = { satirlar: [], yeniSatirlar: [] };
    assert.match(hata(icerik({ cancelled: true }), { ...bos, tarih: '2026-11-05' }), /İptal/);
    assert.match(hata(icerik(), { satirlar: [{ ref: 7003, miktar: '2' }], yeniSatirlar: [] }), /Kapalı satır/);
    assert.match(hata(icerik(), { satirlar: [{ ref: 9999, miktar: '2' }], yeniSatirlar: [] }), /siparişte yok/);
    assert.match(hata(icerik(), { satirlar: [{ ref: 7002, kapat: true }, { ref: 7004, kapat: true }], yeniSatirlar: [] }), /en az bir açık satır/);
    assert.match(hata(icerik(), { satirlar: [{ ref: 7002, miktar: '10.0', fiyat: '10' }], yeniSatirlar: [] }), /Değişiklik yok/);
    assert.match(hata(icerik(), { satirlar: [{ ref: 7002, miktar: '0' }], yeniSatirlar: [] }), /miktar/);
    assert.match(hata(icerik({ arpCode: null }), { ...bos, tarih: '2026-11-05' }), /cari kodu/);
    const satirlar = cevap()['lines'] as Record<string, unknown>[];
    assert.match(hata(icerik({ lines: [...satirlar, { logicalRef: 7005, type: 2, quantity: 1, closed: false }] }), { ...bos, tarih: '2026-11-05' }), /malzeme ve hizmet dışında/);
    assert.match(hata(icerik(), { satirlar: [], yeniSatirlar: [{ hizmet: false, kod: '', miktar: '1', fiyat: '1', birim: 'adet', kdv: 20 }] }), /stok kodu/);
  });
});
