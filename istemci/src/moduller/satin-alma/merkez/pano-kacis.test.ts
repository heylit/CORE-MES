import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from './store.ts';
import type { PurchaseRequest, Quote } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump } from './store.ts';
import { render } from './views.ts';

const IMG = '<img src=x onerror=alert(1)>';

function alis(id: string, fiyat: number, tarih: string): PurchaseRequest {
  const q: Quote = {
    id: `${id}-q`, supplierId: 'f1', supplierName: 'f1', date: tarih, validUntil: '', currency: 'TRY', fxRate: null,
    prices: { k1: fiyat }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
    leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
  };
  return {
    id, no: id, title: 'Deneme', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status: 'received',
    items: [{ id: 'k1', materialId: 'm1', name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [q], log: [], createdAt: 1,
    award: { mode: 'single', quoteId: q.id, reason: '', by: '', decidedAt: tarih, orderDate: tarih },
  };
}

afterEach(() => { S.ready = false; document.body.innerHTML = ''; });

// Panonun "hafıza" satırı innerHTML'e gider: malzeme adı (sunucudan gelen metin) etiket olarak ayrıştırılmaz (değerlendirme Y2).
describe('pano fiyat artışı satırı malzeme adını metin olarak çizer', () => {
  it('ad etiket olarak ayrıştırılmaz, metinde görünür', () => {
    document.body.innerHTML = '<main id="main"></main>';
    S.requests = { t1: alis('t1', 100, '2026-01-10'), t2: alis('t2', 130, '2026-02-10') };
    S.materials = { m1: { id: 'm1', code: 'M-1', name: IMG, category: '', unit: 'adet', spec: '', notes: '', aliases: [], createdAt: 1 } };
    S.suppliers = {};
    S.settings = { ...DEFAULT_SETTINGS };
    S.ready = true;
    bump();
    // Bilinmeyen sayfa panoya düşer (render'ın son seçeneği).
    V.page = 'pano-deneme' as Page;
    render();
    const ana = document.querySelector('#main')!;
    expect(ana.querySelector('img')).toBeNull();
    expect(ana.textContent).toContain(`${IMG} fiyatı ilk alışa göre`);
  });
});
