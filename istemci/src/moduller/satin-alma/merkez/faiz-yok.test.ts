import { describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { S, bump } from './store.ts';
import { evaluate, quoteCalc } from './calc.ts';
import { faizUyarisi } from './views.ts';

const q = (payDays: number, advancePct = 0): Quote => ({
  id: 'q', supplierId: 'f1', supplierName: 'f1', date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null, prices: { k1: 100 },
  discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true, leadDays: null, payDays, advancePct, warrantyMonths: null, compliant: true, note: '',
});
const r = { id: 't', items: [{ id: 'k1', materialId: null, name: 'Deneme', spec: '', qty: 10, unit: 'adet' }] } as unknown as PurchaseRequest;
function faiz(monthly: number | null): void {
  S.settings = { ...DEFAULT_SETTINGS, currencies: { ...DEFAULT_SETTINGS.currencies, TRY: { rate: 1, monthly } } };
  bump();
}

describe('vade ve finans faizi', () => {
  it('faiz varken vade bugünkü değeri düşürür', () => {
    faiz(3);
    expect(quoteCalc(r, q(90)).pvTRY).toBeLessThan(quoteCalc(r, q(0)).pvTRY);
    expect(quoteCalc(r, q(90)).faizYok).toBe(false);
  });
  it('finansta faiz yoksa vade hesaba katılamaz ve bu söylenir; sıfır faiz uydurulmaz', () => {
    faiz(null);
    const c = quoteCalc(r, q(90));
    expect(c.pvTRY).toBe(c.totalTRY);
    expect(c.faizYok).toBe(true);
    expect(quoteCalc(r, q(0)).faizYok).toBe(false);
    expect(quoteCalc(r, q(90, 100)).faizYok).toBe(false);
    expect(faizUyarisi(['TRY', 'TRY'])).toContain('TRY faizi Finans');
    expect(faizUyarisi([])).toBe('');
  });
  it('bir para biriminde faiz yoksa karşılaştırmada hiçbir vadeli teklif indirgenmez (sunucuyla aynı eşit taban)', () => {
    S.settings = { ...DEFAULT_SETTINGS, currencies: { ...DEFAULT_SETTINGS.currencies, TRY: { rate: 1, monthly: 3 }, EUR: { rate: 36, monthly: null } } };
    S.suppliers = {};
    bump();
    const eur = { ...q(90), id: 'qe', currency: 'EUR' as const, fxRate: 36 };
    const req = { ...r, quotes: [q(90), eur] } as unknown as PurchaseRequest;
    const ev = evaluate(req);
    expect(ev.all.every((x) => x.c.faizYok && x.c.pvTRY === x.c.totalTRY)).toBe(true);
    faiz(3);
    const tek = { ...r, id: 't2', quotes: [q(90)] } as unknown as PurchaseRequest;
    expect(evaluate(tek).all[0]!.c.pvTRY).toBeLessThan(evaluate(tek).all[0]!.c.totalTRY);
  });
});

