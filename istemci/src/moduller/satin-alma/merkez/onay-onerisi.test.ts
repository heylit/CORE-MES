import { beforeEach, describe, expect, it } from 'vitest';
import type { Approval, PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { S, bump } from './store.ts';
import { viewApproval } from './roles.ts';
import { oneriPenceresiHTML, oneriSeridiHTML, sonOneri } from './onay-onerisi.ts';

// Kart 3696: onaylayan kararı değiştirmez; öneriyle geri gönderir. Öneri ret kaydında durur, karar ekranında şerit olarak görünür.
const teklif = (id: string, fiyat: number, firma: string): Quote => ({
  id, supplierId: firma, supplierName: firma, date: '2026-09-01', validUntil: '', currency: 'TRY', fxRate: null,
  prices: { k1: fiyat }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
  leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
});
const oneriliRet: Approval = { id: 'o1', at: 100, by: '7', name: 'Deneme Onaycı', decision: 'rejected', note: 'Termin riski', oneri: { atama: { k1: 'q2' }, gerekce: 'Termin riski' } };
function talep(durum: PurchaseRequest['status'], onaylar: Approval[] = []): PurchaseRequest {
  return {
    id: 'a', no: 'T-a', title: 'Deneme a', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status: durum,
    items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [teklif('q1', 10, 'f1'), teklif('q2', 12, 'f2')], log: [], createdAt: 1,
    award: { mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: '2026-09-02', approvals: onaylar },
  };
}
beforeEach(() => {
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: 'Deneme A' } as Supplier, f2: { id: 'f2', name: 'Deneme B' } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS, approvalLimits: [{ max: null, role: 'Genel müdür' }] };
  S.me = { id: '7', email: '', name: 'Deneme Onaycı' };
  bump();
});
const ciz = (html: string): HTMLElement => { const k = document.createElement('div'); k.innerHTML = html; return k; };

describe('Onayda karşı öneri (3696)', () => {
  it('onay alanında Onayla, Reddet ve Öneriyle geri gönder yan yana durur', () => {
    const k = ciz(viewApproval(talep('approval')));
    expect(k.querySelector('[data-act="oneri-penceresi"]')?.textContent).toContain('Öneriyle geri gönder');
    expect(k.querySelector('[data-act="approve"]')).not.toBeNull();
    expect(k.querySelector('[data-act="reject"]')).not.toBeNull();
  });

  it('pencere her kalem için teklif seçtirir, bugünkü karar önseçili, gerekçe zorunlu alandır', () => {
    const p = ciz(oneriPenceresiHTML(talep('approval')));
    const sec = p.querySelector<HTMLSelectElement>('[data-oneri-kalem="k1"]')!;
    expect([...sec.options].map((o) => o.value)).toEqual(['q1', 'q2']);
    expect(sec.querySelector('option[selected]')?.getAttribute('value')).toBe('q1');
    expect(p.querySelector('#oy-oneri-gerekce')).not.toBeNull();
    expect(p.textContent).toContain('tüm onaylar sıfırlanır');
  });

  it('değerlendirmeye dönen talepte şerit gerekçeyi ve önerilen tedarikçiyi gösterir; yok sayılınca ve onaydayken görünmez', () => {
    const r = talep('eval', [oneriliRet]);
    expect(sonOneri(r)?.id).toBe('o1');
    const sirit = ciz(oneriSeridiHTML(r, new Set()));
    expect(sirit.textContent).toContain('Termin riski');
    expect(sirit.textContent).toContain('Deneme B');
    expect(sirit.querySelector('[data-act="kr-oneri-uygula"]')).not.toBeNull();
    expect(oneriSeridiHTML(r, new Set(['o1']))).toBe('');
    expect(oneriSeridiHTML(talep('approval', [oneriliRet]), new Set())).toBe('');
    expect(oneriSeridiHTML(talep('eval', [{ ...oneriliRet, oneri: undefined }]), new Set())).toBe('');
  });
});
