import { describe, expect, it } from 'vitest';
import { kalemSatirlari, teslimatOf, termineGore, type IsSatiri } from './is-tablosu.ts';
import type { PurchaseRequest, Quote } from './tipler.ts';

const BUGUN = '2026-11-19';
const q = (id: string, leadDays: number | null) => ({ id, supplierId: 'f-' + id, leadDays }) as unknown as Quote;

describe('teslimat sütunu', () => {
  it('teklif yoksa bilinmez; gün uydurulmaz', () => {
    const r = { id: 't', status: 'rfq', quotes: [] } as unknown as PurchaseRequest;
    expect(teslimatOf(r, BUGUN)).toEqual({ tarih: null, gun: null, kaynak: null });
  });
  it('kararda seçilen teklifin termin günü bugünden sayılır', () => {
    const r = { id: 't', status: 'approval', quotes: [q('a', 5), q('b', 12)], award: { mode: 'single', quoteId: 'b' } } as unknown as PurchaseRequest;
    expect(teslimatOf(r, BUGUN)).toEqual({ tarih: '2026-12-01', gun: 12, kaynak: 'karar' });
  });
  it('seçilen teklifte termin yoksa bilinmez', () => {
    const r = { id: 't', status: 'approval', quotes: [q('a', null)], award: { mode: 'single', quoteId: 'a' } } as unknown as PurchaseRequest;
    expect(teslimatOf(r, BUGUN)).toEqual({ tarih: null, gun: null, kaynak: null });
  });
});

describe('termine göre gecikme', () => {
  const r = { needDate: '2026-11-25' } as unknown as PurchaseRequest;
  it('teslimat ihtiyaçtan sonraysa gün sayısı, değilse null', () => {
    expect(termineGore(r, { tarih: '2026-11-28', gun: 9, kaynak: 'teklif' })).toBe(3);
    expect(termineGore(r, { tarih: '2026-11-25', gun: 6, kaynak: 'teklif' })).toBeNull();
    expect(termineGore(r, { tarih: null, gun: null, kaynak: null })).toBeNull();
    expect(termineGore({ needDate: '' } as unknown as PurchaseRequest, { tarih: '2026-11-28', gun: 9, kaynak: 'teklif' })).toBeNull();
  });
});

describe('kalem başına satır (3442-1 b)', () => {
  it('her kalem ayrı satırdır, talebin işi her satırda; kalemsiz talep satır vermez', () => {
    const is = (id: string, items: unknown[]) => ({ r: { id, items }, tur: 'quotes', gec: false, adimdaGun: null }) as unknown as IsSatiri;
    const k = kalemSatirlari([is('t1', [{ id: 'a', name: 'ORN- mil' }, { id: 'b', name: 'ORN- burç' }]), is('t2', [])]);
    expect(k.map((x) => [x.r.id, x.kalem.id, x.sira, x.tur])).toEqual([['t1', 'a', 0, 'quotes'], ['t1', 'b', 1, 'quotes']]);
  });
});
