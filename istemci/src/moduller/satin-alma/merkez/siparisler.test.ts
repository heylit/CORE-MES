import { afterEach, describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump } from './store.ts';
import { siparisListesi } from './calc.ts';
import { render } from './views.ts';
import { setRole } from './roles.ts';
import { ekranCiz, ekranKaldir, sekme, talepSatiri } from './test-ekrani.ts';
import { addDays, todayStr } from './util.ts';

const BUGUN = todayStr();
const gun = (n: number) => addDays(BUGUN, n);
function teklif(id: string, firma: string, fiyatlar: Record<string, number>): Quote {
  return {
    id, supplierId: firma, supplierName: `Deneme ${firma}`, date: gun(-20), validUntil: '', currency: 'TRY', fxRate: null,
    prices: fiyatlar, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
    leadDays: 10, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
  };
}
const kalem = (id: string, ad: string, qty: number) => ({ id, materialId: null, name: ad, spec: '', qty, unit: 'adet' });
// t1: tek tedarikçi, tek kalem, 3 gün gecikmiş, 30/40 geldi. t2: iki tedarikçiye bölünmüş, biri bu hafta, biri teslim alındı.
// t3: teslim alınmış talep. t4: değerlendirmede (siparişi yok).
function kur(): void {
  document.body.innerHTML = '<div id="market"></div><div id="gres"></div><main id="main"></main>';
  const q1 = teklif('q1', 'f1', { k1: 100 });
  const qa = teklif('qa', 'f2', { k2: 50, k3: 10 }), qb = teklif('qb', 'f3', { k2: 60, k3: 5 });
  const q3 = teklif('q3', 'f1', { k4: 20 });
  const t = (id: string, no: string, title: string, status: PurchaseRequest['status'], items: PurchaseRequest['items'], quotes: Quote[], award: PurchaseRequest['award']): PurchaseRequest => ({
    id, no, title, department: '', requester: '', priority: 'normal', needDate: '', notes: '', status, items, rfqs: [], quotes, log: [], createdAt: 1, award,
  });
  S.requests = {
    t1: t('t1', 'ST-DEN-001', 'Deneme rulman', 'ordered', [kalem('k1', 'Deneme rulman 6204', 40)], [q1], {
      mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: gun(-15), orderNo: 'SP-DEN-001', orderDate: gun(-13), expectedDate: gun(-3),
      lines: [{ id: 1, itemId: 'k1', quoteId: 'q1', qty: 40, unit: 'adet', received: 30 }],
      logo: { durum: 'hata', kayitNo: null, hata: 'Deneme hata', iptalDurumu: null, iptalHata: null, kapatmaDurumu: null, kapatmaHata: null, bekletmeIstegi: null, bekletmeDurumu: null, bekletmeHata: null } as never,
    }),
    t2: t('t2', 'ST-DEN-002', 'Deneme bölünmüş', 'ordered', [kalem('k2', 'Deneme kayış', 2), kalem('k3', 'Deneme pim', 100)], [qa, qb], {
      mode: 'split', quoteId: null, splits: { k2: 'qa', k3: 'qb' }, reason: '', by: '', decidedAt: gun(-5),
      orders: { qa: { orderNo: 'SP-DEN-002', orderDate: gun(-4), expectedDate: gun(2) }, qb: { orderNo: 'SP-DEN-003', orderDate: gun(-4), expectedDate: gun(-1), deliveredDate: gun(-1) } },
    }),
    t3: t('t3', 'ST-DEN-003', 'Deneme biten', 'received', [kalem('k4', 'Deneme somun', 5)], [q3], {
      mode: 'single', quoteId: 'q3', reason: '', by: '', decidedAt: gun(-40), orderNo: 'SP-DEN-004', orderDate: gun(-40), expectedDate: gun(-30), deliveredDate: gun(-31),
    }),
    t4: t('t4', 'ST-DEN-004', 'Deneme açık', 'eval', [kalem('k5', 'Deneme yağ', 1)], [], null),
  };
  S.suppliers = Object.fromEntries(['f1', 'f2', 'f3'].map((f) => [f, { id: f, name: `Deneme ${f}`, categories: [] } as unknown as Supplier]));
  S.settings = { ...DEFAULT_SETTINGS };
  S.ready = true;
  bump();
}
afterEach(() => { ekranKaldir(); S.ready = false; setRole('buyer'); document.body.innerHTML = ''; });

describe('Siparişler (2430)', () => {
  it('her sipariş bir satır; gecikme, bu hafta, teslim ve gelen miktar merkezin verisinden', () => {
    kur();
    const l = siparisListesi(BUGUN);
    const bul = (no: string) => l.find((s) => s.orderNo === no)!;
    expect(l.map((s) => s.orderNo).sort()).toEqual(['SP-DEN-001', 'SP-DEN-002', 'SP-DEN-003', 'SP-DEN-004']);
    expect(bul('SP-DEN-001')).toMatchObject({ gecikme: 3, buHafta: false, tek: { gelen: 30, miktar: 40, birim: 'adet' }, tutar: 4000, tedarikci: 'Deneme f1' });
    expect(bul('SP-DEN-002')).toMatchObject({ gecikme: null, buHafta: true, kalem: 1, gelenKalem: 0, tutar: 100 });
    // Teslim alınmış sipariş termini geçmiş olsa da gecikmiş sayılmaz.
    expect(bul('SP-DEN-003')).toMatchObject({ gecikme: null, buHafta: false, teslim: gun(-1), gelenKalem: 1 });
  });

  it('varsayılan Açık: biten sipariş görünmez, geciken üstte; kırmızı sayı yalnız Geciken, Bu hafta sayısı başlıkta düz', () => {
    kur();
    V.page = 'orders'; V.id = null; V.tab = null;
    render();
    const k = ekranCiz();
    const satirlar = [...k.querySelectorAll('tbody tr[data-satir]')].map((tr) => tr.getAttribute('data-satir'));
    expect(satirlar).toEqual(['t1:q1', 't2:qa']);
    expect(sekme(k, 'geciken')?.querySelector('.tc-sekme-sayi')?.textContent).toBe('1');
    expect(sekme(k, 'hafta')?.querySelector('.tc-sekme-sayi')).toBeNull();
    expect(sekme(k, 'hafta')?.textContent).toContain('Bu hafta gelecek · 1');
    expect(k.textContent).toContain('30 / 40 adet');
    expect(k.textContent).toContain('10 kalan');
    // Karar 2464: para birimi her yerde ₺.
    expect(k.textContent).toContain('4.000 ₺');
    expect(k.textContent).not.toMatch(/\d TL/);
    // Logo hatası nedeniyle metin olarak yazılır (yalnız title'da kalmaz).
    expect(k.querySelector('.sa-sp-logo-hata')?.textContent).toContain('Deneme hata');
    expect(k.textContent).not.toMatch(/undefined|NaN/);
  });

  it('satıra basınca talebin Sipariş adımı açılır, dönüş Siparişler', () => {
    kur();
    V.page = 'orders'; V.id = null; V.tab = null;
    render();
    const k = ekranCiz();
    talepSatiri(k, 't2:qa')!.click();
    expect([V.page, V.id, V.tab]).toEqual(['request', 't2', 'order']);
  });
});
