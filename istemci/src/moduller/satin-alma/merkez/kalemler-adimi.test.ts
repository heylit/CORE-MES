import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { tabItems } from './views.ts';

// 3696: Kalemler adımı kalem başına istenen termini, gelen teklifi ve teklif istenen tarihleri gösterir.
const teklif: Quote = {
  id: 'q1', supplierId: 'f1', supplierName: 'f1', date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null,
  prices: { k1: 10 }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
  leadDays: 7, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
};
function kur(ek: Partial<PurchaseRequest> = {}): PurchaseRequest {
  const r: PurchaseRequest = {
    id: 't1', no: 'T-1', title: 'ORN talep', department: 'Bakım', requester: '', priority: 'normal', needDate: '2030-12-10', notes: '', status: 'rfq',
    items: [
      { id: 'k1', materialId: null, name: 'ORN kalem bir', spec: '', qty: 10, unit: 'adet', istenenTermin: '2030-12-20' },
      { id: 'k2', materialId: null, name: 'ORN kalem iki', spec: '', qty: 5, unit: 'adet' },
    ],
    rfqs: [{ supplierId: 'f1', sentAt: '2026-11-20', dueDate: '2026-11-27' }, { supplierId: 'f2', sentAt: '2026-11-20', dueDate: '2026-11-27' }],
    quotes: [teklif], log: [], createdAt: 1, ...ek,
  };
  S.requests = { t1: r };
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: 'ORN Tedarik A' } as Supplier, f2: { id: 'f2', name: 'ORN Tedarik B' } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS };
  bump();
  return r;
}
const ciz = (html: string): HTMLElement => { const k = document.createElement('div'); k.innerHTML = html; return k; };
beforeEach(() => { kur(); });

describe('Kalemler adımı (3696)', () => {
  it('kalemin kendi termini ve talepten gelen termin ayrı yazılır', () => {
    const k = ciz(tabItems(S.requests['t1']!));
    const t = [...k.querySelectorAll('[data-sa-kalem-termin]')];
    expect(t[0]!.textContent).toContain('20.12.2030');
    expect(t[0]!.textContent).not.toContain('talepten');
    expect(t[1]!.textContent).toContain('10.12.2030');
    expect(t[1]!.textContent).toContain('talepten');
  });
  it('kalem başına teklif sayısı, en düşük fiyat ve teklifi düzenle düğmesi', () => {
    const k = ciz(tabItems(S.requests['t1']!));
    const h = [...k.querySelectorAll('[data-sa-kalem-teklif]')];
    expect(h[0]!.textContent).toContain('1 / 2 teklif');
    expect(h[0]!.textContent).toContain('en düşük');
    expect(h[1]!.textContent).toContain('2 istendi, gelmedi');
    expect(h[0]!.querySelector('[data-act="tab"][data-tab="quotes"]')).not.toBeNull();
  });
  it('teklif istenen tedarikçiler tarihleriyle, gelen cevap işaretli', () => {
    const k = ciz(tabItems(S.requests['t1']!));
    const o = k.querySelector('[data-sa-istek-ozeti]')!;
    expect(o.textContent).toContain('ORN Tedarik A');
    expect(o.textContent).toContain('istendi 20.11.2026, son cevap 27.11.2026');
    expect(o.querySelectorAll('.flag.good')).toHaveLength(1);
  });
  it('teklif istenmemiş talepte özet yok, kalem "teklif istenmedi" der', () => {
    kur({ rfqs: [], quotes: [], status: 'draft' });
    const k = ciz(tabItems(S.requests['t1']!));
    expect(k.querySelector('[data-sa-istek-ozeti]')).toBeNull();
    expect(k.querySelector('[data-sa-kalem-teklif]')!.textContent).toContain('istenmedi');
  });
});
