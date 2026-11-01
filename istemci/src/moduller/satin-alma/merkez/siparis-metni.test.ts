import { describe, expect, it } from 'vitest';
import { poText } from './docs.ts';
import type { OrderInfo } from './calc.ts';
import type { PurchaseRequest, Quote } from './tipler.ts';

// Kayıt bulgusu: sipariş metninde doldurulmamış "Teslimat adresi: [adres]" kalıyordu. Adres verisi yokken satır hiç yazılmaz.
const q = {
  id: 'q1', supplierId: '', supplierName: 'Deneme Tedarikçi', date: '2026-10-16', validUntil: '', currency: 'TRY', fxRate: null,
  prices: { k1: 10 }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true, leadDays: null,
  payDays: 30, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
} as Quote;
const o = {
  qid: 'q1', q, supplierId: '', items: [{ id: 'k1', name: 'Deneme kalem', qty: '2', unit: 'adet' }],
  orderNo: 'SA-1', poNo: '', orderDate: '', expectedDate: '', deliveredDate: '', quality: '', excess: [], logo: null,
} as unknown as OrderInfo;
const r = { no: 'ST-1', title: 'Deneme talep' } as unknown as PurchaseRequest;

describe('Sipariş metni', () => {
  it('doldurulmamış adres yer tutucusu yazmaz', () => {
    const metin = poText(r, o);
    expect(metin).toContain('Deneme kalem');
    expect(metin).not.toContain('[adres]');
    expect(metin).not.toContain('Teslimat adresi');
  });

  it('TMI A11: konu talep numarasını değil sipariş numarasını yazar; Logo numarası varsa yanında', () => {
    expect(poText(r, o).split('\n')[0]).toBe('Konu: Sipariş SA-1, Deneme talep');
    expect(poText(r, { ...o, poNo: 'LG-9' } as OrderInfo).split('\n')[0]).toBe('Konu: Sipariş SA-1 / LG-9, Deneme talep');
    expect(poText(r, { ...o, orderNo: '' } as OrderInfo).split('\n')[0]).toBe('Konu: Sipariş ST-1, Deneme talep');
  });
});
