import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { evaluate } from './calc.ts';
import { firmaSec, payEkle, paySil, siparisGovdesi, siparisOnerisiHTML, siparisOzeti, siparisSatirlariHTML, taslagiOku, taslak, taslakKur } from './siparis-satirlari.ts';

// 3574-1: sipariş satırları (Kurgu A). Onaylı karar A: K1 10 x 10, K2 4 x 5 = 120 TL.
const teklif = (id: string, supplierId: string, prices: Record<string, number>, ek: Partial<Quote> = {}): Quote => ({
  id, supplierId, supplierName: `ORN ${supplierId}`, date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null, prices, discountPct: 0, shipping: 0,
  otherCost: 0, deliveryTerm: '', deliveryIncluded: true, leadDays: 7, payDays: 30, advancePct: 0, warrantyMonths: null, compliant: true, note: '', ...ek,
});
const talep = (): PurchaseRequest => ({
  id: 't1', no: 'ORN-1', title: 'ORN', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'approval', version: 3,
  items: [{ id: 'k1', materialId: null, name: 'ORN-MIL', spec: '', qty: 10, unit: 'adet' }, { id: 'k2', materialId: null, name: 'ORN-PUL', spec: '', qty: 4, unit: 'adet' }],
  rfqs: [], log: [], createdAt: 1, updatedAt: 1,
  quotes: [teklif('qa', 'fa', { k1: 10, k2: 5 }), teklif('qb', 'fb', { k1: 12, k2: 5 })],
  award: { mode: 'single', quoteId: 'qa', reason: '', by: '', decidedAt: '2026-11-02', approvals: [{ id: 'o1', at: 1, by: 'u2', name: '', decision: 'approved', note: '' }] },
} as unknown as PurchaseRequest);

beforeEach(() => {
  S.settings = { ...DEFAULT_SETTINGS };
  S.suppliers = {
    fa: { id: 'fa', name: 'ORN fa' } as Supplier, fb: { id: 'fb', name: 'ORN fb' } as Supplier, '9': { id: '9', name: 'ORN Y' } as Supplier,
  };
  S.requests = {};
  bump();
});

describe('sipariş satırları taslağı (3574-1)', () => {
  it('ilk taslak onaylı karardır: kalem başına tek pay, tek başlık; onay gerekmez', () => {
    const r = talep();
    const t = taslakKur(r);
    expect(t.pays.map((p) => [p.itemId, p.quoteId, p.qty, p.price])).toEqual([['k1', 'qa', 10, 10], ['k2', 'qa', 4, 5]]);
    expect(t.heads.map((h) => h.quoteId)).toEqual(['qa']);
    const oz = siparisOzeti(r, t);
    expect(oz.onayliTutar).toBe(120);
    expect(oz.yeniTutar).toBe(120);
    expect(oz.onayGerekir).toBe(false);
  });

  it('pay ekle kalemi ikinci firmaya böler; ikinci firma onaylı kararda olmadığı için onaya gider; pay silinince geri döner', () => {
    const r = talep();
    const t = taslakKur(r);
    const ilk = t.pays.find((p) => p.itemId === 'k1')!;
    ilk.qty = 6;
    payEkle(r, t, 'k1');
    const ikinci = t.pays.filter((p) => p.itemId === 'k1')[1]!;
    expect([ikinci.quoteId, ikinci.qty, ikinci.price]).toEqual(['qb', 4, 12]);
    expect(t.heads.map((h) => h.quoteId)).toEqual(['qa', 'qb']);
    const oz = siparisOzeti(r, t);
    expect(oz.yeniTutar).toBe(6 * 10 + 4 * 12 + 20);
    expect(oz.yeniFirmalar).toEqual(['ORN fb']);
    expect(oz.onayGerekir).toBe(true);
    paySil(r, t, ikinci.id);
    expect(t.heads.map((h) => h.quoteId)).toEqual(['qa']);
  });

  it('tutarı düşüren fiyat onaysızdır, artıran onaya gider', () => {
    const r = talep();
    const t = taslakKur(r);
    t.pays[0]!.price = 9;
    expect(siparisOzeti(r, t).onayGerekir).toBe(false);
    t.pays[0]!.price = 11;
    expect(siparisOzeti(r, t).onayGerekir).toBe(true);
  });

  it('başka firma teklifsiz başlık açar; gövdede yeni firma ve pay fiyatı gider', () => {
    const r = talep();
    const t = taslakKur(r);
    firmaSec(r, t, t.pays[0]!.id, 'f:9');
    const yeni = t.heads.find((h) => h.yeni)!;
    expect(yeni.yeni).toMatchObject({ supplierId: '9', name: 'ORN Y', currency: 'TRY' });
    t.pays[0]!.price = 8;
    const g = siparisGovdesi(r, t);
    expect(g.siparisler.find((s) => s.teklifId === yeni.quoteId)!.yeniFirma).toEqual({ firmaId: 9, paraBirimi: 'TRY', vadeGun: 0, terminGun: null });
    expect(g.paylar.find((p) => p.kalemId === 'k1')).toMatchObject({ teklifId: yeni.quoteId, miktar: '10', birimFiyat: '8' });
    expect(siparisOzeti(r, t).yeniFirmalar).toEqual(['ORN Y']);
  });

  it('eksik alan kayıttan önce hata olarak görünür; ekrandaki değerler taslağa okunur', () => {
    const r = talep();
    const t = taslak(r);
    document.body.innerHTML = siparisSatirlariHTML(r, t);
    const kok = document.querySelector<HTMLElement>('[data-sa-siparis-satirlari]')!;
    const fiyat = kok.querySelector<HTMLInputElement>(`[data-sp-pay="${t.pays[0]!.id}"][data-sp-alan="price"]`)!;
    fiyat.value = '';
    kok.querySelector<HTMLInputElement>('[data-sp-alan="teslimYeri"]')!.value = 'ORN Depo';
    taslagiOku(t, kok);
    expect(t.heads[0]!.teslimYeri).toBe('ORN Depo');
    expect(siparisOzeti(r, t).hatalar).toEqual(['ORN-MIL: birim fiyat girin.']);
    expect(siparisOzeti(r, t).hataAlanlari).toEqual([`sp-${t.pays[0]!.id}-price`]);
    // Y2: dar görünümde her pay hücresinin etiketi var.
    expect([...kok.querySelectorAll(`[data-sp-satir="${t.pays[0]!.id}"] td`)].filter((td) => !td.classList.contains('acts')).every((td) => td.hasAttribute('data-l'))).toBe(true);
    // Sürüm değişince taslak yeniden kurulur.
    expect(taslak({ ...r, version: 4 }).pays[0]!.price).toBe(10);
  });

  it('R2: siparişte açılan firma karşılaştırmaya girmez', () => {
    const r = { ...talep(), quotes: [...talep().quotes, teklif('qy', '9', { k1: 1 }, { source: 'siparis' })] } as PurchaseRequest;
    expect(evaluate(r).elig.map((x) => x.q.id)).toEqual(expect.not.arrayContaining(['qy']));
  });

  it('onay bekleyen sipariş: öneren onaylayamaz, onaylayana düğmeler çizilir', () => {
    const r = { ...talep(), siparisOnerisi: { onayliTutar: 120, yeniTutar: 130, yeniFirmalar: [], gerekce: 'ORN gerekçe', onerenId: 'u1', onerenAdi: 'ORN kişi', zaman: 1, paylar: [{ itemId: 'k1', quoteId: 'qb', qty: 10, price: 12, exp: '2026-12-01', note: 'ORN not' }, { itemId: 'k2', quoteId: 'qa', qty: 4, price: 5, exp: '', note: '' }], basliklar: [{ quoteId: 'qb', yeniFirmaId: null, currency: null, poNo: '', orderDate: '2026-11-22', expectedDate: '2026-12-05', teslimYeri: 'ORN Depo', tedarikciNotu: '', icNot: '' }] } } as PurchaseRequest;
    expect(siparisOnerisiHTML(r, true, false)).toContain('data-act="sp-oneri-onayla"');
    // Y1: onaylayan siparişin satırlarını görür (firma, miktar, fiyat, termin).
    document.body.innerHTML = siparisOnerisiHTML(r, true, false);
    const metin = document.body.textContent ?? '';
    expect(metin).toContain('ORN fb');
    expect(metin).toContain('01.12.2026');
    expect(metin).toContain('ORN Depo');
    expect(document.querySelectorAll('[data-sa-siparis-onerisi-satirlari] td[data-l="Firma"]').length).toBe(2);
    expect(siparisOnerisiHTML(r, true, true)).not.toContain('data-act="sp-oneri-onayla"');
    expect(siparisOnerisiHTML(r, false, false)).not.toContain('data-act="sp-oneri-reddet"');
  });
});
