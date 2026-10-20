import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from './store.ts';
import type { Material, PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump } from './store.ts';
import { render } from './views.ts';
import { setRole, type Role } from './roles.ts';

function teklif(id: string, fiyat: number, tarih: string): Quote {
  return {
    id, supplierId: 'f1', supplierName: 'Deneme Tedarikçi', date: tarih, validUntil: '', currency: 'TRY', fxRate: null,
    prices: { k1: fiyat }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
    leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
  };
}
function talep(id: string, status: PurchaseRequest['status'], kararli: boolean): PurchaseRequest {
  const q = teklif(`${id}-q`, 100, '2026-01-10');
  return {
    id, no: id, title: 'Deneme', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status,
    items: [{ id: 'k1', materialId: 'm1', name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [q], log: [], createdAt: 1,
    award: kararli ? { mode: 'single', quoteId: q.id, reason: '', by: '', decidedAt: '2026-01-10', orderDate: '2026-01-10' } : null,
  };
}
function kur(): void {
  document.body.innerHTML = '<div id="market"></div><main id="main"></main>';
  S.requests = { t1: talep('t1', 'received', true), t2: talep('t2', 'eval', false) };
  S.materials = { m1: { id: 'm1', code: 'M-1', name: 'Deneme malzeme', category: '', unit: 'adet', spec: '', notes: '', aliases: [], createdAt: 1 } as Material };
  S.suppliers = { f1: { id: 'f1', name: 'Deneme Tedarikçi', categories: [] } as unknown as Supplier };
  S.settings = { ...DEFAULT_SETTINGS };
  S.ready = true;
  bump();
}

afterEach(() => { S.ready = false; setRole('buyer'); document.body.innerHTML = ''; });

// Her bölüm uydurma veriyle hata vermeden çizilir; boş, "undefined" ya da "NaN" metin çıkmaz.
describe('satın alma ekran çizimi', () => {
  const sayfalar: [Page, string | null][] = [
    ['dash', null], ['requests', null], ['request', 't2'], ['request', 't1'], ['materials', null], ['material', 'm1'],
    ['suppliers', null], ['supplier', 'f1'], ['reports', null], ['settings', null],
  ];
  for (const [sayfa, id] of sayfalar) {
    it(`${sayfa}${id ? ` (${id})` : ''} çizilir`, () => {
      kur();
      V.page = sayfa; V.id = id; V.tab = null;
      render();
      const metin = document.querySelector('#main')!.textContent ?? '';
      expect(metin.trim().length).toBeGreaterThan(0);
      expect(metin).not.toMatch(/undefined|NaN/);
    });
  }

  for (const rol of ['buyer', 'requester', 'approver'] as Role[]) {
    it(`ana sayfa ${rol} rolüyle çizilir`, () => {
      kur();
      setRole(rol);
      V.page = 'dash'; V.id = null; V.tab = null;
      render();
      const metin = document.querySelector('#main')!.textContent ?? '';
      expect(metin.trim().length).toBeGreaterThan(0);
      expect(metin).not.toMatch(/undefined|NaN/);
    });
  }
});
