import { beforeEach, describe, expect, it } from 'vitest';
import type { Material, PurchaseRequest, Quote } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { basliktakiTutar, headerFacts } from './views.ts';

// 3466-3: başlıktaki tutar teklif varken en iyi teklifin net maliyetidir; son alış tahmini yalnız teklif yokken.
const teklif = (id: string, k1: number): Quote => ({
  id, supplierId: 'f1', supplierName: 'f1', date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null,
  prices: { k1 }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
  leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
});
const talep = (ek: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  id: 't1', no: 'ORN-1', title: 'ORN', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'eval',
  items: [{ id: 'k1', materialId: 'm1', name: 'ORN- kalem', spec: '', qty: 10, unit: 'adet' }], rfqs: [], quotes: [], log: [], createdAt: 1, ...ek,
} as PurchaseRequest);
beforeEach(() => {
  S.settings = { ...DEFAULT_SETTINGS };
  S.materials = { m1: { id: 'm1', code: 'ORN-M1', name: 'ORN- kalem', category: '' } as Material };
  S.requests = {
    eski: talep({ id: 'eski', status: 'received', quotes: [teklif('qe', 1000)], award: { mode: 'single', quoteId: 'qe', reason: '', by: '', decidedAt: '2026-01-01', orderDate: '2026-01-01', deliveredDate: '2026-01-05', approvals: [] } }),
  };
  bump();
});

describe('başlıktaki tutar (3466-3)', () => {
  it('teklif varken en iyi teklifin net maliyeti, yokken son alış tahmini, karar varken karar tutarı', () => {
    const t = talep({ quotes: [teklif('q1', 12), teklif('q2', 9)] });
    expect(basliktakiTutar(t)).toEqual({ tur: 'teklif', tl: 90 });
    expect(headerFacts(t).join(' ')).toContain('en iyi teklif, net');
    expect(basliktakiTutar({ ...t, award: { mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: '2026-11-02', approvals: [] } })).toEqual({ tur: 'karar', tl: 120 });
    expect(basliktakiTutar(talep())).toEqual({ tur: 'tahmin', tl: 10000 });
  });

  it('eksik kalemli teklif ucuz olsa da başlıkta tam teklifin tutarı', () => {
    const iki = talep({ items: [...talep().items, { id: 'k2', materialId: null, name: 'ORN- kalem 2', spec: '', qty: 1, unit: 'adet' }],
      quotes: [{ ...teklif('qt', 12), prices: { k1: 12, k2: 5 } }, teklif('qe2', 1)] });
    expect(basliktakiTutar(iki)).toEqual({ tur: 'teklif', tl: 125 });
  });
});
