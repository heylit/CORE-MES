import { describe, expect, it } from 'vitest';
import { basamakFiyati, planCost, type EvalRow } from './calc.ts';
import type { PurchaseRequest, Quote } from './tipler.ts';

const teklif = (tiers?: Quote['tiers']): Quote => ({
  id: 'q', supplierId: 'f1', supplierName: 'f1', date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null, prices: { k1: 60 },
  ...(tiers ? { tiers } : {}), discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true, leadDays: null,
  payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
});

describe('kademeli teklif fiyatı (2975)', () => {
  it('basamaksız teklif bugünkü gibi taban fiyatla hesaplanır', () => {
    expect(basamakFiyati(teklif(), 'k1', 80)).toEqual({ unit: 60, line: 4800 });
  });

  it('miktarın düştüğü en yüksek basamak uygulanır', () => {
    const q = teklif({ k1: [{ min: 200, price: 40 }, { min: 50, price: 50 }] });
    expect(basamakFiyati(q, 'k1', 80)).toMatchObject({ unit: 50, line: 4000, tier: 50 });
    expect(basamakFiyati(q, 'k1', 200)).toMatchObject({ unit: 40, line: 8000, tier: 200 });
  });

  it('üst basamak daha ucuz toplam veriyorsa yalnız bilgi döner, miktar değişmez', () => {
    const q = teklif({ k1: [{ min: 100, price: 45 }] });
    expect(basamakFiyati(q, 'k1', 80)).toEqual({ unit: 60, line: 4800, ust: { min: 100, line: 4500 } });
  });

  it('2974-1 a: ilk basamağın eşiği en az miktardır; talep altındaysa alınan miktar eşiğe yükselir', () => {
    const q = { ...teklif({ k1: [{ min: 150, price: 39 }] }), minQty: { k1: 100 } };
    expect(basamakFiyati(q, 'k1', 80)).toEqual({ unit: 60, line: 6000, alinan: 100, ust: { min: 150, line: 5850 } });
  });

  it('eksik basamak yok sayılır; fiyatsız kalem teklif dışıdır', () => {
    expect(basamakFiyati(teklif({ k1: [{ min: Number.NaN, price: 10 }] }), 'k1', 80)).toEqual({ unit: 60, line: 4800 });
    expect(basamakFiyati(teklif(), 'k2', 80)).toBeNull();
  });

  it('kalemi tek tedarikçiye vermede tutar alınan miktardandır (en az miktar birim × talep değildir)', () => {
    const satir = (id: string, unit: number, line: number) =>
      ({ q: { id }, c: { lines: { k1: { unit, line } }, unitFactorTRY: 1, ship: 0, other: 0, rate: 1, factor: 1 }, late: 0 }) as unknown as EvalRow;
    const talep = { items: [{ id: 'k1', qty: '80' }] } as unknown as PurchaseRequest;
    const p = planCost(talep, [satir('a', 60, 6000), satir('b', 70, 5600)], { k1: 'a' });
    expect(p.goods).toBe(6000);
  });
});
