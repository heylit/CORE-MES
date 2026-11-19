import { describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { S, bump } from './store.ts';
import { evaluate } from './calc.ts';
import { kararAyrintisiHTML, odemeAyrintisi, onaylayanOzeti } from './karar-ayrintisi.ts';

const q = (id: string, o: Partial<Quote> = {}): Quote => ({
  id, supplierId: id, supplierName: `ORN- ${id}`, date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null, prices: { k1: 100 },
  discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true, leadDays: 10, payDays: 30, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
  ...o,
});
const talep = (o: Partial<PurchaseRequest>): PurchaseRequest => ({
  id: 't', no: 'ST-ORN-1', status: 'approval', needDate: '2026-12-01', items: [{ id: 'k1', materialId: null, name: 'ORN- kalem', spec: '', qty: 10, unit: 'adet' }], ...o,
} as unknown as PurchaseRequest);
function ayar(): void {
  S.settings = { ...DEFAULT_SETTINGS, currencies: { ...DEFAULT_SETTINGS.currencies, TRY: { rate: 1, monthly: 3 }, EUR: { rate: 40, monthly: 1 } } };
  S.suppliers = {};
  bump();
}

describe('karar ve onayda ödeme, kur ve faiz', () => {
  it('avans sipariş günü, kalan teslim + vade gününde; yöntem tekliften, yoksa belirtilmedi', () => {
    ayar();
    const r = talep({ quotes: [q('a', { advancePct: 40, payMethod: 'cek' }), q('b', { leadDays: null })], award: { mode: 'single', quoteId: 'a', reason: '', by: '', decidedAt: '2026-11-10', orderDate: '2026-11-20' } });
    const ev = evaluate(r);
    const a = odemeAyrintisi(r, ev.all.find((x) => x.q.id === 'a')!);
    expect(a.avans).toEqual({ yuzde: 40, tl: 400, gun: '2026-11-20' });
    expect(a.kalan).toMatchObject({ tl: 600, vadeGun: 30, gun: '2026-12-30', baslangic: 'teslim' });
    expect(a.yontem).toBe('Çek');
    expect(a.aylikFaiz).toBe(3);
    // Termin yoksa ihtiyaç tarihinden sayılır; avans yoksa avans satırı yok.
    const b = odemeAyrintisi(r, ev.all.find((x) => x.q.id === 'b')!);
    expect(b.avans).toBeNull();
    expect(b.kalan?.gun).toBe('2026-12-31');
    expect(b.yontem).toBe('Belirtilmedi');
  });

  it('onaydaki kararda güncel kur kullanılır, karar anında sabitlenen kur ve faiz ayrıca yazılır', () => {
    ayar();
    const r = talep({
      quotes: [q('e', { currency: 'EUR', fxRate: 38 })],
      award: { mode: 'single', quoteId: 'e', reason: '', by: '', decidedAt: '2026-11-10', fx: { EUR: 39 }, kurKilidi: '2026-11-10T08:00:00Z', sabitFaiz: { EUR: 0.8 } },
    });
    const x = evaluate(r).all[0]!;
    const d = odemeAyrintisi(r, x);
    expect(d).toMatchObject({ kur: 40, kurKaynagi: 'guncel', kararKuru: 39, aylikFaiz: 1, kararFaizi: 0.8 });
    const h = kararAyrintisiHTML(r, [x], new Set(['e']));
    expect(h).toContain('karar anında 39');
    expect(h).toContain('teklif günü 38');
    expect(h).toContain('karar anında %0,8');
  });

  it('sipariş verilmiş kararda kur sipariş günü sabit kurdur', () => {
    ayar();
    const r = talep({ status: 'ordered', quotes: [q('e', { currency: 'EUR', fxRate: 38 })], award: { mode: 'single', quoteId: 'e', reason: '', by: '', decidedAt: '2026-11-10', fx: { EUR: 39 } } });
    expect(odemeAyrintisi(r, evaluate(r).all[0]!)).toMatchObject({ kur: 39, kurKaynagi: 'sabit', kararKuru: null });
  });

  it('onaylayan: onaylandıysa kişi ve zaman, beklerken bekleniyor; karar yoksa boş', () => {
    ayar();
    expect(onaylayanOzeti(talep({}), null)).toBeNull();
    const bekleyen = talep({ award: { mode: 'single', quoteId: 'a', reason: '', by: '', decidedAt: '2026-11-10', approvals: [] } });
    expect(onaylayanOzeti(bekleyen, 1000)?.baslik).toBe('Bekleniyor');
    const onayli = talep({ award: { mode: 'single', quoteId: 'a', reason: '', by: '', decidedAt: '2026-11-10', approvals: [{ id: 'o1', at: Date.parse('2026-11-11T09:00:00Z'), by: '', name: 'ORN- Yönetici', decision: 'approved', note: '' }] } });
    expect(onaylayanOzeti(onayli, 1000)).toMatchObject({ baslik: 'ORN- Yönetici' });
    expect(onaylayanOzeti(onayli, 1000)?.ayrinti).toContain('onayladı');
  });
});
