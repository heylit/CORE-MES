import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { satisSiparisiGovdesi, satisTeklifiGovdesi } from './kurallar.ts';
import type { GonderilecekSatisSiparisi, GonderilecekSatisTeklifi } from './kurallar.ts';

const teklif: GonderilecekSatisTeklifi = {
  id: 1, no: 'TK-2026-001', tarih: '2026-10-12', gecerlilikBitis: '2026-10-31', paraBirimi: 'TRY', kur: null,
  satirlar: [
    { satirId: 11, stokKodu: 'MM-DEN-00001', hizmet: false, miktar: '10', birim: 'adet', birimFiyat: '125.5', iskontoYuzdesi: '5', termin: '2026-11-15' },
    { satirId: 12, stokKodu: 'HZ-FSN-00001', hizmet: true, miktar: '1', birim: 'saat', birimFiyat: '900', iskontoYuzdesi: null, termin: null },
  ],
};
const secenek = { cariKodu: 'M-DENEME-01', kdv: 20, hizmetKdv: 18 };

describe('Logo satış teklifi ve tekliften sipariş gövdesi (köprü notu 2.6, 2.7)', () => {
  test('LGT-1 teklif gövdesi: not 2.6 adları; tarih dd.MM.yyyy, status 1, iskonto ayrı alan (fiyata yedirilmez), hizmet satırı tür 4 ve kendi KDV\'si', () => {
    assert.deepEqual(satisTeklifiGovdesi(teklif, secenek), {
      govde: {
        number: 'TK-2026-001', date: '12.10.2026', arpCode: 'M-DENEME-01', status: 1, validUntil: '31.10.2026',
        lines: [
          { type: 0, masterCode: 'MM-DEN-00001', quantity: 10, price: 125.5, unitCode: 'ADET', discountRate: 5, vatRate: 20, dueDate: '15.11.2026' },
          { type: 4, masterCode: 'HZ-FSN-00001', quantity: 1, price: 900, unitCode: 'SAAT', vatRate: 18 },
        ],
      },
    });
  });

  test('LGT-2 döviz: EUR 20 ve kur başlıkta; tanımsız para birimi gövde çıkarmaz', () => {
    const r = satisTeklifiGovdesi({ ...teklif, paraBirimi: 'EUR', kur: '36.12' }, secenek);
    assert.ok('govde' in r);
    assert.equal(r.govde['currencyCode'], 20);
    assert.equal(r.govde['rate'], 36.12);
    assert.match(JSON.stringify(satisTeklifiGovdesi({ ...teklif, paraBirimi: 'GBP' }, secenek)), /GBP için Logo döviz türü tanımlı değil/);
  });

  test('LGT-3 (ret): cari kodu, numara, satır, karta bağlı kalem, miktar ve iskonto denetlenir', () => {
    const hata = (t: GonderilecekSatisTeklifi, cari: string | null = 'M-DENEME-01'): string => {
      const r = satisTeklifiGovdesi(t, { ...secenek, cariKodu: cari });
      return 'hata' in r ? r.hata : '';
    };
    assert.equal(hata(teklif, null), 'Firmanın Logo cari kodu yok.');
    assert.match(hata({ ...teklif, no: 'TK-2026-000000001' }), /1-16 karakter/);
    assert.equal(hata({ ...teklif, satirlar: [] }), 'Teklifin satırı yok.');
    const satir = teklif.satirlar[0]!;
    assert.match(hata({ ...teklif, satirlar: [{ ...satir, stokKodu: null }] }), /malzeme kartına bağlı değil/);
    assert.match(hata({ ...teklif, satirlar: [{ ...satir, miktar: '0' }] }), /miktar sıfırdan büyük/);
    assert.match(hata({ ...teklif, satirlar: [{ ...satir, iskontoYuzdesi: '120' }] }), /iskonto 0-100/);
  });

  const siparis: GonderilecekSatisSiparisi = {
    id: 5, no: 'SS-2026-001', tarih: '2026-10-13', teklifKayitNo: '4100',
    satirlar: [{ satirId: 51, teklifSatirRef: '4101', miktar: '6', termin: '2026-11-20' }, { satirId: 52, teklifSatirRef: '4102', miktar: '1', termin: null }],
  };

  test('LGT-4 tekliften sipariş: satırlar teklif satırına bağlanır (offerLineRef), kısmi miktar gider; orderStatus 4', () => {
    assert.deepEqual(satisSiparisiGovdesi(siparis), {
      govde: {
        number: 'SS-2026-001', date: '13.10.2026', orderStatus: 4,
        lines: [{ offerLineRef: 4101, quantity: 6, dueDate: '20.11.2026' }, { offerLineRef: 4102, quantity: 1 }],
      },
    });
  });

  test('LGT-5 (ret): teklifi ya da teklif satırı Logo\'da olmayan sipariş gövde çıkarmaz', () => {
    assert.deepEqual(satisSiparisiGovdesi({ ...siparis, teklifKayitNo: null }), { hata: 'Siparişin teklifi Logo\'da yok.' });
    assert.deepEqual(satisSiparisiGovdesi({ ...siparis, satirlar: [{ ...siparis.satirlar[0]!, teklifSatirRef: null }] }),
      { hata: 'Satır 1: teklif satırı Logo\'da yok.' });
  });
});
