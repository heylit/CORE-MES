import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kopruIstemcisiKur } from './kopru.ts';
import { alisFiyatlariniAyikla, malzemeHareketleriniAyikla } from './kurallar.ts';

// 2961-D4: yardımcının malzeme hareketi ve son alış fiyatı okumaları. Kart ve cari kodları uydurmadır.
describe('LOGO-O23 malzeme hareketleri ve son alış fiyatları ayıklanır, uydurulmaz', () => {
  test('hareket sayfası: okunamayan satır atlanır; miktar metin; ambar ve fiş no yoksa null', () => {
    const r = malzemeHareketleriniAyikla({
      data: [
        { logicalRef: 501, date: '2026-10-01', trCode: 1, ioCode: 1, ficheNo: 'IRS-1', quantity: 4.5, warehouseNr: 0, unitCode: 'ADET' },
        { logicalRef: 502, date: '2026-10-02', trCode: 12, ioCode: 4, ficheNo: null, quantity: 1, warehouseNr: -1, unitCode: null },
        { logicalRef: 503, date: '01.10.2026', trCode: 1, ioCode: 1, quantity: 2 },
        { logicalRef: 504, date: '2026-10-03', trCode: 1, ioCode: 1 },
      ],
      next: 502,
    });
    assert.deepEqual(r, {
      kayitlar: [
        { logoKayitNo: 501, tarih: '2026-10-01', fisTuru: 1, girisCikis: 1, fisNo: 'IRS-1', miktar: '4.5', ambarNo: 0, birim: 'ADET' },
        { logoKayitNo: 502, tarih: '2026-10-02', fisTuru: 12, girisCikis: 4, fisNo: null, miktar: '1', ambarNo: null, birim: null },
      ],
      sonraki: 502,
    });
    assert.equal(malzemeHareketleriniAyikla([]), null, 'zarfsız cevap okunmaz');
  });

  test('alış fiyatları: dizi; döviz türü 0 ise döviz fiyatı null; fiyatı olmayan satır atlanır', () => {
    assert.deepEqual(alisFiyatlariniAyikla([
      { logicalRef: 612, date: '2026-09-12', arpCode: 'T-0001', invoiceNo: 'FT-12', quantity: 12, unitCode: 'KG', price: 22, currencyType: 20, currencyPrice: 0.5 },
      { logicalRef: 611, date: '2026-09-11', arpCode: 'T-0001', invoiceNo: 'FT-11', quantity: 11, unitCode: 'KG', price: 21.25, currencyType: 0, currencyPrice: 0 },
      { logicalRef: 610, date: '2026-09-10', quantity: 10 },
    ]), [
      { logoKayitNo: 612, tarih: '2026-09-12', cariKodu: 'T-0001', faturaNo: 'FT-12', miktar: '12', birim: 'KG', fiyat: '22', dovizTuru: 20, dovizFiyati: '0.5' },
      { logoKayitNo: 611, tarih: '2026-09-11', cariKodu: 'T-0001', faturaNo: 'FT-11', miktar: '11', birim: 'KG', fiyat: '21.25', dovizTuru: null, dovizFiyati: null },
    ]);
    assert.equal(alisFiyatlariniAyikla({ data: [] }), null);
  });

  test('köprü: yol kodu kaçırır, yalnız GET; 404 kart yok (null), biçimsiz cevap belirsiz', async () => {
    const istekler: { yontem: string; yol: string }[] = [];
    let cevap: { durum: number; govde: unknown } = { durum: 200, govde: { data: [], next: null } };
    const fetchSahte = (async (adres: string | URL | Request, secenek?: RequestInit) => {
      istekler.push({ yontem: secenek?.method ?? 'GET', yol: String(adres).replace('http://127.0.0.1:1', '') });
      return new Response(JSON.stringify(cevap.govde), { status: cevap.durum, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const k = kopruIstemcisiKur({ adres: 'http://127.0.0.1:1', anahtar: 'deneme-anahtar' }, { fetch: fetchSahte });
    assert.deepEqual(await k.malzemeHareketleriOku('HM DEN/1', 500), { tur: 'basarili', veri: { kayitlar: [], sonraki: null } });
    cevap = { durum: 200, govde: [] };
    assert.deepEqual(await k.sonAlisFiyatlariOku('HM-DEN-00001'), { tur: 'basarili', veri: [] });
    assert.deepEqual(istekler, [
      { yontem: 'GET', yol: '/api/Material/HM%20DEN%2F1/movements?since=500' },
      { yontem: 'GET', yol: '/api/Material/HM-DEN-00001/lastPurchases' },
    ]);
    cevap = { durum: 404, govde: { success: false, error: 'Material not found' } };
    assert.deepEqual(await k.sonAlisFiyatlariOku('YOK-1'), { tur: 'basarili', veri: null });
    assert.deepEqual(await k.malzemeHareketleriOku('YOK-1', 0), { tur: 'basarili', veri: null });
    cevap = { durum: 200, govde: { beklenmeyen: true } };
    assert.equal((await k.sonAlisFiyatlariOku('HM-DEN-00001')).tur, 'belirsiz');
  });
});
