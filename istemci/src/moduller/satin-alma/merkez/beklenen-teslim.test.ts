import { describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote } from './tipler.ts';
import { singleOrderHTML } from './views.ts';
import { addDays, todayStr } from './util.ts';

const q = { id: 'q1', supplierId: 'f1', leadDays: 12 } as unknown as Quote;
const r = { id: 't', quotes: [q] } as unknown as PurchaseRequest;
const deger = (html: string) => /id="o-exp" value="([^"]*)"/.exec(html)?.[1];

describe('beklenen teslim önerisi', () => {
  it('sipariş verilmeden (sipariş tarihi boş) bugün + termin önerilir; boş gelmez', () => {
    expect(deger(singleOrderHTML(r, { quoteId: 'q1' }))).toBe(addDays(todayStr(), 12));
  });
  it('sipariş tarihi varsa ondan sayılır; kaydedilmiş beklenen teslim korunur', () => {
    expect(deger(singleOrderHTML(r, { quoteId: 'q1', orderDate: '2026-11-02' }))).toBe('2026-11-14');
    expect(deger(singleOrderHTML(r, { quoteId: 'q1', orderDate: '2026-11-02', expectedDate: '2026-12-01' }))).toBe('2026-12-01');
  });
  it('termin yoksa boş kalır', () => {
    const r2 = { id: 't', quotes: [{ ...q, leadDays: null }] } as unknown as PurchaseRequest;
    expect(deger(singleOrderHTML(r2, { quoteId: 'q1' }))).toBe('');
  });
});
