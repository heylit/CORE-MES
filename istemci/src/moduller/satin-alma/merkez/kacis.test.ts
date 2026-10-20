import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { viewApprovals } from './roles.ts';

const IMG = '<img src=x onerror=alert(1)>';
const SCRIPT = '"><script>alert(1)</script>';

function teklif(): Quote {
  return {
    id: 'q1', supplierId: 'f1', supplierName: 'f1', date: '2026-09-01', validUntil: '', currency: 'TRY', fxRate: null,
    prices: { k1: 10 }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
    leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
  };
}
function onaydakiTalep(): PurchaseRequest {
  return {
    id: 't1', no: 'T-1', title: 'Deneme', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status: 'approval',
    items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [teklif()], log: [], createdAt: 1,
    award: { mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: '2026-09-02' },
  };
}
function kur(tedarikciAdi: string, onaySeviyesi: string): void {
  S.requests = { t1: onaydakiTalep() };
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: tedarikciAdi } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS, approvalLimits: [{ max: null, role: onaySeviyesi }] };
  bump();
}
// innerHTML'e verilen metin tarayıcıda ayrıştırılır; çıkan ağaçta öğe yoksa değer metin olarak kalmıştır.
function ciz(html: string): HTMLElement {
  const kok = document.createElement('div');
  kok.innerHTML = html;
  return kok;
}

beforeEach(() => kur('Deneme Tedarikçi', 'Genel müdür'));

describe('onay bekleyenler: sunucudan gelen ad ve ayardaki onay seviyesi metin olarak çizilir', () => {
  it('tedarikçi adı ve onay seviyesi etiket olarak ayrıştırılmaz', () => {
    kur(IMG, SCRIPT);
    const kok = ciz(viewApprovals());
    expect(kok.querySelector('img')).toBeNull();
    expect(kok.querySelector('script')).toBeNull();
    const alt = kok.querySelector('.joblist .sub')!;
    expect(alt.textContent).toContain(IMG);
    expect(alt.textContent).toContain(`${SCRIPT} onayı`);
  });

  it('olağan adlarda görünen metin değişmez', () => {
    const alt = ciz(viewApprovals()).querySelector('.joblist .sub')!;
    expect(alt.textContent).toBe('Bakım, Deneme Tedarikçi, Genel müdür onayı');
  });
});
