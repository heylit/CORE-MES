import { beforeEach, describe, expect, it } from 'vitest';
import type { Award, PurchaseRequest, Quote, RequestStatus, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { panoSayilari, teslimBasarimi } from './calc.ts';
import { viewInbox } from './roles.ts';

function teklif(id: string, supplierId: string, fiyat: number): Quote {
  return {
    id, supplierId, supplierName: supplierId, date: '2026-09-01', validUntil: '', currency: 'TRY', fxRate: null,
    prices: { k1: fiyat }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
    leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
  };
}
function talep(id: string, status: RequestStatus, award: Partial<Award> | null): PurchaseRequest {
  const quotes = award ? [teklif(`${id}-q`, 'f1', 10)] : [];
  return {
    id, no: id, title: 'Deneme', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status,
    items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes, log: [], createdAt: 1,
    award: award ? { mode: 'single', quoteId: quotes[0]!.id, reason: '', by: '', decidedAt: '2026-09-02', ...award } : null,
  };
}
function kur(talepler: PurchaseRequest[]): void {
  S.requests = Object.fromEntries(talepler.map((t) => [t.id, t]));
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: 'Deneme Tedarikçi' } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS };
  bump();
}

beforeEach(() => kur([]));

describe('iş kutusu sayı şeridi', () => {
  it('onay, açık talep, açık sipariş tutarı, geciken teslim ve bu ayın harcaması; teslim alınan sipariş açık sayılmaz', () => {
    kur([
      talep('t1', 'approval', null),
      talep('t2', 'eval', null),
      talep('t3', 'ordered', { orderDate: '2026-10-01', expectedDate: '2026-10-05' }),
      talep('t4', 'ordered', { orderDate: '2026-10-02', expectedDate: '2026-10-20' }),
      talep('t5', 'received', { orderDate: '2026-09-10', expectedDate: '2026-09-15', deliveredDate: '2026-09-20' }),
    ]);
    expect(panoSayilari('2026-10-12')).toEqual({
      onayBekleyen: 1, acikTalep: 2, acikSiparis: 2, acikSiparisTutari: 200, gecikenTeslim: 1, buAyHarcama: 200,
    });
  });

  it('teslim başarımı yalnız teslim alınmış siparişlerden: zamanında oranı ve geç gelenlerin ortalama gecikmesi', () => {
    kur([
      talep('t5', 'received', { orderDate: '2026-09-10', expectedDate: '2026-09-15', deliveredDate: '2026-09-20' }),
      talep('t6', 'received', { orderDate: '2026-09-10', expectedDate: '2026-09-15', deliveredDate: '2026-09-14' }),
      talep('t7', 'ordered', { orderDate: '2026-10-01', expectedDate: '2026-10-05' }),
    ]);
    expect(teslimBasarimi()).toEqual([{ supplierId: 'f1', ad: 'Deneme Tedarikçi', teslim: 2, zamaninda: 1, oran: 50, ortGecikme: 5 }]);
  });

  it('talep yokken de şerit görünür ve sayılar sıfırdır; teslim paneli boşken bunu söyler', () => {
    const bos = viewInbox();
    expect(bos).toContain('data-sa-pano');
    expect(bos).toContain('Açık sipariş tutarı');
    kur([talep('t1', 'approval', null)]);
    const dolu = viewInbox();
    expect(dolu).toContain('data-sa-pano');
    expect(dolu).toContain('Henüz teslim alınmış sipariş yok.');
  });
});
