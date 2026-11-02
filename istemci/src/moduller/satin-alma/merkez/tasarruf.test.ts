import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote, Settings, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { quoteCalc, savingsOf } from './calc.ts';

// Tedarikçi ve kalem uydurmadır.
const AYAR: Settings = { ...structuredClone(DEFAULT_SETTINGS), currencies: { TRY: { rate: 1, monthly: 0 } } as unknown as Settings['currencies'] };
const KALEM = [{ id: 'i1', name: 'Kalem 1', qty: 10, unit: 'adet' }];
const ucuz = { id: 'q1', supplierId: 's1', currency: 'TRY', prices: { i1: 100 }, discountPct: 0, shipping: 0, deliveryIncluded: true, otherCost: 0, advancePct: 0, payDays: 0, leadDays: 7, warrantyMonths: 0, compliant: true };
const pahali = { ...ucuz, id: 'q2', supplierId: 's2', prices: { i1: 130 } };
const talep = (secilen: string) => ({
  id: 'r1', no: 'T', title: 'Deneme', status: 'ordered', items: KALEM, quotes: [ucuz, pahali], updatedAt: 1,
  award: { mode: 'single', quoteId: secilen, approvals: [] },
}) as unknown as PurchaseRequest;

beforeEach(() => {
  S.settings = structuredClone(AYAR);
  S.requests = {}; S.materials = {};
  S.suppliers = { s1: { id: 's1', name: 'Deneme A' }, s2: { id: 's2', name: 'Deneme B' } } as unknown as Record<string, Supplier>;
  S.ready = true;
  bump();
});

describe('TMI G8: seçim tasarrufu ortalamaya göre, eksi fark kırpılmaz', () => {
  it('ucuz teklif seçilince tasarruf artı', () => {
    const r = talep('q1');
    const a = quoteCalc(r, ucuz as unknown as Quote, AYAR).pvTRY, b = quoteCalc(r, pahali as unknown as Quote, AYAR).pvTRY;
    expect(savingsOf(r).avg).toBeCloseTo((a + b) / 2 - a);
    expect(savingsOf(r).avg).toBeGreaterThan(0);
  });
  it('pahalı teklif seçilince fark eksi görünür (önceden 0 yazılıyordu)', () => {
    const r = talep('q2');
    const a = quoteCalc(r, ucuz as unknown as Quote, AYAR).pvTRY, b = quoteCalc(r, pahali as unknown as Quote, AYAR).pvTRY;
    expect(savingsOf(r).avg).toBeCloseTo((a + b) / 2 - b);
    expect(savingsOf(r).avg).toBeLessThan(0);
  });
});
