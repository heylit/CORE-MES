import { describe, expect, it, vi } from 'vitest';
import type { PurchaseRequest } from './tipler.ts';
import { kalemleriBol, paylarTamam } from './kalem-bol.ts';

const talep = (): PurchaseRequest => ({
  id: 't1', no: 'ST-2026-001', title: 'Deneme', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'eval',
  items: [{ id: 'k1', name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }, { id: 'k2', name: 'Öteki kalem', spec: '', qty: 5, unit: 'adet' }],
  quotes: [
    { id: 'qa', supplierId: '3', date: '2026-10-05', currency: 'TRY', prices: { k1: 100, k2: 50 }, tiers: { k1: [{ min: 8, price: 90 }] }, minQty: { k1: 4 },
      alternatives: { k1: null }, altResults: { k1: { sonuc: 'uygun' } } },
    { id: 'qb', supplierId: '4', date: '2026-10-05', currency: 'TRY', prices: { k1: 120, k2: 55 } },
  ],
  rfqs: [], log: [],
} as unknown as PurchaseRequest);

describe('3442-5 kalemi tedarikçilere bölmek', () => {
  it('bölünen kalem pay başına yeni satır olur; toplam miktar korunur, teklifin kaleme bağlı alanları yeni satırlara geçer', () => {
    const r = talep();
    const { talep: n, atama, bolunenler } = kalemleriBol(r, { k1: { qa: 6, qb: 4 }, k2: { qb: 5 } }, (q) => (q === 'qa' ? 'A' : 'B'));
    const yeni = n.items!.filter((x) => x.name === 'Deneme kalem');
    expect(yeni).toHaveLength(2);
    expect(yeni.map((x) => x.qty)).toEqual([6, 4]);
    expect(yeni.reduce((a, x) => a + (x.qty ?? 0), 0)).toBe(10);
    expect(yeni.every((x) => x.id !== 'k1')).toBe(true);
    const [ya, yb] = yeni;
    expect(atama).toEqual({ [ya!.id]: 'qa', [yb!.id]: 'qb', k2: 'qb' });
    const qa = n.quotes.find((q) => q.id === 'qa')!;
    expect(qa.prices[ya!.id]).toBe(100);
    expect(qa.tiers?.[ya!.id]).toEqual([{ min: 8, price: 90 }]);
    expect(qa.minQty?.[ya!.id]).toBe(4);
    expect(ya!.id in (qa.alternatives ?? {})).toBe(true);
    // Eski kalemin anahtarları kalkar; alternatif sonucu kimliğe bağlıdır, yeni satırda sunucu yeniden hesaplar.
    expect(qa.prices.k1).toBeUndefined();
    expect(qa.tiers?.k1).toBeUndefined();
    expect(qa.altResults?.k1).toBeUndefined();
    expect(qa.altResults?.[ya!.id]).toBeUndefined();
    expect(bolunenler).toEqual(['Deneme kalem 10 → 6 A + 4 B']);
    // Girdi talep değişmez.
    expect(r.items!.map((x) => x.id)).toEqual(['k1', 'k2']);
  });

  it('bağlı kalem bölünmez', () => {
    const r = talep();
    r.items![0]!.sabit = 'bag';
    expect(() => kalemleriBol(r, { k1: { qa: 6, qb: 4 } }, String)).toThrow(/bağlı kalem/);
    expect(kalemleriBol(r, { k1: { qa: 10 } }, String).atama).toEqual({ k1: 'qa' });
  });

  it('paylar kalem miktarına eşit olmalı', () => {
    expect(paylarTamam(10, [6, 4])).toBe(true);
    expect(paylarTamam(10, [6, 3])).toBe(false);
    expect(paylarTamam(10, [6, 5])).toBe(false);
    expect(paylarTamam(2.5, [1.25, 1.25])).toBe(true);
    expect(paylarTamam(10, [12, -2])).toBe(false);
    expect(paylarTamam(10, [Number.NaN, 10])).toBe(false);
  });
});

describe('3442-5 Dağıtım denemesinin aktarma reddi (Risk K1)', () => {
  it('bağlı kalem ve kabul sınırı daraltılmış kalem bölünmez; bölünmeyen kalem zarfa bakılmadan geçer', async () => {
    const { backend } = await import('./store.ts');
    const { aktarmaReddi } = await import('./sim.ts');
    const zarf = vi.spyOn(backend, 'kalemZarflari').mockResolvedValue([
      { kalemId: 'k1', malzemeNo: 9, kabul: { yalnizAyni: true, sartliKabul: false, kaliteler: null, durumlar: null, payMm: null }, zarf: { kaliteler: [], durumlar: [], payMm: null } },
    ] as never);
    const r = talep();
    expect(await aktarmaReddi(r, { k1: { qa: 10 }, k2: { qa: 3, qb: 2 } })).toBeNull();
    expect(await aktarmaReddi(r, { k1: { qa: 6, qb: 4 } })).toContain('kabul sınırını daraltmış');
    zarf.mockResolvedValue(null);
    expect(await aktarmaReddi(r, { k2: { qa: 3, qb: 2 } })).toContain('okunamadı');
    zarf.mockClear();
    r.items![1]!.sabit = 'bag';
    expect(await aktarmaReddi(r, { k2: { qa: 3, qb: 2 } })).toContain('bağlı kalem bölünemez');
    expect(zarf).not.toHaveBeenCalled();
    expect(await aktarmaReddi(r, { k1: { qa: 10 } })).toBeNull();
    expect(zarf).not.toHaveBeenCalled();
  });
});
