import { afterEach, describe, expect, it } from 'vitest';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V } from './store.ts';
import './ui.ts';
import { setOnaylayabilir } from './roles.ts';
import { siparisKalemleriHTML } from './kalem-kalem.ts';
import type { PurchaseRequest } from './tipler.ts';

const talep = (): PurchaseRequest => ({
  id: 't-sk', no: 'ST-2026-003', title: 'Deneme', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'ordered',
  items: [{ id: 'k1', name: 'Deneme kalem', spec: '', qty: 6, unit: 'adet' }, { id: 'k2', name: 'Deneme kalem', spec: '', qty: 4, unit: 'adet' }],
  quotes: [
    { id: 'qa', supplierId: '', supplierName: 'Deneme A', date: '2026-10-05', currency: 'TRY', prices: { k1: 100, k2: 100 } },
    { id: 'qb', supplierId: '', supplierName: 'Deneme B', date: '2026-10-05', currency: 'EUR', prices: { k1: 3, k2: 3 } },
  ],
  award: {
    mode: 'split', quoteId: null, splits: { k1: 'qa', k2: 'qb' }, reason: '', by: '', decidedAt: '2026-10-06', approvals: [],
    orders: { qa: { orderNo: 'SA-0001' }, qb: { orderNo: 'SA-0002' } },
    lines: [{ id: 1, itemId: 'k1', quoteId: 'qa', qty: 6, unit: 'adet', received: 2 }, { id: 2, itemId: 'k2', quoteId: 'qb', qty: 4, unit: 'adet', received: null }],
  },
  rfqs: [], log: [],
} as unknown as PurchaseRequest);

afterEach(() => { setOnaylayabilir(false); document.body.innerHTML = ''; });

describe('3442-5 sipariş adımında kalem kalem tablo', () => {
  it('her sipariş satırı tedarikçisi, miktarı, fiyatı, teslim alınanı ve kalanıyla görünür; Değiştir yalnız onay yetkisinde', () => {
    const kutu = document.createElement('div');
    kutu.innerHTML = siparisKalemleriHTML(talep());
    const satirlar = [...kutu.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.replace(/\s+/g, ' ').trim()));
    expect(satirlar).toHaveLength(2);
    expect(satirlar[0]!.slice(1, 7)).toEqual(['Deneme ASA-0001', '6 adet', '100,00 ₺', '600,00 ₺', '2 adet', '4 adet']);
    expect(satirlar[1]![1]).toBe('Deneme BSA-0002');
    expect(satirlar[1]![3]).toContain('3,00');
    expect(satirlar[1]![3]).toContain('€');
    // Teslim yoksa sıfırdır, bilinmiyor değil.
    expect(satirlar[1]!.slice(5, 7)).toEqual(['0 adet', '4 adet']);
    expect(kutu.querySelector('[data-act="order-item-change"]')).toBeNull();
    setOnaylayabilir(true);
    kutu.innerHTML = siparisKalemleriHTML(talep());
    expect([...kutu.querySelectorAll<HTMLElement>('[data-act="order-item-change"]')].map((b) => b.dataset.item)).toEqual(['k1', 'k2']);
  });

  it('satırdaki Değiştir pencereyi o kalemle açar', () => {
    const r = talep();
    S.requests[r.id] = r; S.ready = true; V.page = 'request'; V.id = r.id;
    setOnaylayabilir(true);
    document.body.innerHTML = `<div data-sa-merkez><div id="gres">${siparisKalemleriHTML(r)}</div><div id="modal-root"></div></div>`;
    document.querySelector<HTMLElement>('[data-act="order-item-change"][data-item="k2"]')!.click();
    expect(document.querySelector<HTMLSelectElement>('#oc-item')!.value).toBe('k2');
    expect(document.querySelector<HTMLInputElement>('#oc-qty')!.value).toBe('4');
  });
});
