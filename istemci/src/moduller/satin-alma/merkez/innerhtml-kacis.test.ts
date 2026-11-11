import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Material, PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump, type Page } from './store.ts';
import { setOnaylayabilir, setRole, type Role } from './roles.ts';
import { render } from './views.ts';
import { approvalFormHTML } from './docs.ts';
import { simLive } from './sim.ts';
import { ekranCiz, ekranKaldir } from './test-ekrani.ts';

// Ekranlar dizgiyle HTML kurar ve innerHTML'e verir (değerlendirme 2197 R08). Kullanıcının ya da sunucunun verdiği her metin
// alanına kötü niyetli dizgi konur; çizilen ağaçta yeni öğe ya da olay özniteliği çıkmamalı, dizgi metin olarak görünmeli.
// </textarea> ve </title> düz metin olarak ayrıştırılan öğeden çıkmayı dener.
const X = '"\'></textarea></title><img src=x onerror=alert(1)><script>alert(2)</script>';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SUP_A = ID(1), SUP_B = ID(2), MAT = ID(3), K1 = ID(4), QA = ID(5), QB = ID(6), K2 = ID(7);

function teklif(id: string, supplierId: string, fiyat: number): Quote {
  return {
    id, supplierId, supplierName: X, date: '2026-09-01', validUntil: '2026-09-03', currency: 'USD', fxRate: 30,
    prices: { [K1]: fiyat, [K2]: fiyat }, discountPct: 0, shipping: 10, otherCost: 0, deliveryTerm: X, deliveryIncluded: false,
    leadDays: 10, payDays: 30, advancePct: 10, warrantyMonths: 12, compliant: true, note: X, firstTotal: fiyat * 20, revisions: 1,
  };
}
function talep(id: string, no: string, status: PurchaseRequest['status'], kararli: boolean): PurchaseRequest {
  const r: PurchaseRequest = {
    id, no: `${no}${X}`, title: X, department: X, requester: X, priority: 'urgent', needDate: '2026-09-05', notes: X, status,
    cancelReason: X, uretimEmriId: 1, uretimEmriNo: X,
    // İkinci kalem karta bağlı değil: adı bağlantısız metin olarak çizilen dallar da denenir.
    items: [{ id: K1, materialId: MAT, name: X, spec: X, qty: 10, unit: X, category: X }, { id: K2, materialId: null, name: `${X} 2`, spec: X, qty: 5, unit: X }],
    rfqs: [{ supplierId: SUP_A, sentAt: '2026-08-20', dueDate: '2026-08-25' }],
    quotes: [teklif(QA, SUP_A, 100), teklif(QB, SUP_B, 120)],
    log: [{ id: ID(90), at: 1, by: '7', t: X }],
    scenarios: [{ id: ID(91), name: X, alloc: { [K1]: { [QA]: 10 } }, createdAt: 1, by: '7' }],
    createdAt: 1,
  };
  if (kararli) {
    r.award = {
      mode: 'single', quoteId: QA, reason: X, by: X, decidedAt: '2026-09-02', lessons: X,
      approvals: [{ id: ID(92), at: 2, by: '7', name: X, decision: status === 'approval' ? 'rejected' : 'approved', note: X }],
      orders: status === 'ordered' || status === 'received'
        ? { [QA]: { orderNo: X, poNo: X, orderDate: '2026-09-02', expectedDate: '2026-09-04', excess: [{ item: X, qty: 1, unit: X }] } }
        : {},
      orderNo: X, poNo: X, orderDate: '2026-09-02',
    };
  }
  return r;
}
function tedarikci(id: string): Supplier {
  return {
    id, name: X, categories: [X], contact: X, phone: X, email: X, city: X, taxNo: X, status: 'suspended', kaliteDurumu: X,
    active: false, rating: 4, notes: X, evals: [{ id: ID(93), date: '2026-09-01', rating: 4, text: X, name: X, by: '7' }], createdAt: 1,
  };
}
const malzeme: Material = { id: MAT, code: X, name: X, category: X, unit: X, spec: X, notes: X, aliases: [X], createdAt: 1 };

function kur(): void {
  S.requests = {
    [ID(11)]: talep(ID(11), 'T-1', 'eval', false),
    [ID(12)]: talep(ID(12), 'T-2', 'approval', true),
    [ID(13)]: talep(ID(13), 'T-3', 'ordered', true),
    [ID(14)]: talep(ID(14), 'T-4', 'received', true),
    [ID(15)]: talep(ID(15), 'T-5', 'cancelled', false),
    [ID(16)]: { ...talep(ID(16), 'T-6', 'draft', false), quotes: [] },
  };
  S.suppliers = { [SUP_A]: tedarikci(SUP_A), [SUP_B]: tedarikci(SUP_B) };
  S.materials = { [MAT]: malzeme };
  S.users = { 7: { id: '7', email: X, name: X } };
  S.me = S.users['7']!;
  S.settings = {
    ...DEFAULT_SETTINGS, company: X, categories: [X], departments: [{ name: X, budget: 1000 }],
    approvalLimits: [{ max: 10, role: X }, { max: null, role: X }],
  };
  S.ready = true;
  bump();
}

// Kötü niyetli dizgiden doğabilecek her şey: yeni öğe, olay özniteliği ya da betik.
function enjeksiyon(kok: ParentNode): string[] {
  const bulgu: string[] = [];
  for (const el of kok.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT') bulgu.push('script');
    if (el.tagName === 'IMG' && el.getAttribute('src') === 'x') bulgu.push('img');
    for (const a of el.attributes) if (a.name.startsWith('on')) bulgu.push(`${el.tagName.toLowerCase()}[${a.name}]`);
  }
  return bulgu;
}

function ciz(page: Page, id: string | null = null, tab: string | null = null): HTMLElement {
  V.page = page; V.id = id; V.tab = tab;
  render();
  // Satın almacının iş kutusu, Talepler ve talep ayrıntısı ortak parçalarla #main'in üstüne çizilir (2412-2); ikisi birlikte denetlenir.
  ekranCiz();
  return document.body;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="gres" hidden></div><main id="main"></main><div id="modal-root"></div>';
  setOnaylayabilir(true);
  kur();
});
afterEach(() => { ekranKaldir(); S.ready = false; document.body.innerHTML = ''; setRole('buyer'); setOnaylayabilir(false); });

describe('satın alma ekranları kötü niyetli metni etiket olarak ayrıştırmaz (2201a)', () => {
  const sayfalar: [Page, string | null][] = [
    ['requests', null], ['materials', null], ['material', MAT], ['suppliers', null], ['supplier', SUP_A], ['settings', null],
  ];
  it.each(sayfalar)('%s sayfası', (page, id) => {
    const ana = ciz(page, id);
    expect(enjeksiyon(ana)).toEqual([]);
    expect(ana.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it.each<Role>(['buyer', 'approver', 'requester'])('%s rolünün ana sayfası', (rol) => {
    setRole(rol);
    const ana = ciz('dash');
    expect(enjeksiyon(ana)).toEqual([]);
  });

  const sekmeler = ['items', 'quotes', 'compare', 'approval', 'order', 'delivery', 'decision', 'log'];
  it.each(Object.keys({ 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 }).map(Number))('talep %i: bütün bölümler', (n) => {
    for (const sekme of sekmeler) {
      const ana = ciz('request', ID(n), sekme);
      // Paylaştırma sonuçları ve senaryolar tablo yerleştikten sonra çizilir (sim.ts setTimeout); burada elle çağrılır.
      simLive();
      expect(enjeksiyon(ana), `${String(n)} ${sekme}`).toEqual([]);
    }
  });

  it('satın alma panosu (bilinmeyen sayfa panoya düşer)', () => {
    const ana = ciz('pano-deneme' as Page);
    expect(enjeksiyon(ana)).toEqual([]);
    expect(ana.textContent).toContain(X);
  });

  it('talep listesi pano görünümünde de', () => {
    V.view = 'board';
    const ana = ciz('requests');
    V.view = 'list';
    expect(enjeksiyon(ana)).toEqual([]);
  });

  it('onay formu (yazdırma alanına gider)', () => {
    for (const n of [12, 13, 14]) {
      const kok = document.createElement('div');
      kok.innerHTML = approvalFormHTML(S.requests[ID(n)]!);
      expect(enjeksiyon(kok)).toEqual([]);
      expect(kok.textContent).toContain(X);
    }
  });
});
