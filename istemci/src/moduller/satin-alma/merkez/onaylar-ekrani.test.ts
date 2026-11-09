import { beforeEach, describe, expect, it } from 'vitest';
import type { Approval, PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { viewApproval, viewApprovals } from './roles.ts';

// Kart 2422: Onaylar ekranının küçük işleri (sıra, kişinin kendi kararları, yeniden gönderilen karar, salt okunur ad alanı).
const teklif: Quote = {
  id: 'q1', supplierId: 'f1', supplierName: 'f1', date: '2026-09-01', validUntil: '', currency: 'TRY', fxRate: null,
  prices: { k1: 10 }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
  leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
};
const onay = (by: string, decision: Approval['decision'], at: number, note = ''): Approval => ({ id: `${by}-${at}`, at, by, name: `Deneme ${by}`, decision, note });
function talep(id: string, ek: Partial<PurchaseRequest> = {}, onaylar: Approval[] = []): PurchaseRequest {
  return {
    id, no: `T-${id}`, title: `Deneme ${id}`, department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status: 'approval',
    items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [teklif], log: [], createdAt: 1,
    award: { mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: '2026-09-02', approvals: onaylar },
    ...ek,
  };
}
function kur(talepler: PurchaseRequest[]): void {
  S.requests = Object.fromEntries(talepler.map((t) => [t.id, t]));
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: 'Deneme Tedarikçi' } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS, approvalLimits: [{ max: null, role: 'Genel müdür' }] };
  S.me = { id: '7', email: '', name: 'Deneme Onaycı' };
  bump();
}
const ciz = (html: string): HTMLElement => { const k = document.createElement('div'); k.innerHTML = html; return k; };
const bekleyenler = (k: HTMLElement) => [...k.querySelectorAll('.jobs')[0]!.querySelectorAll('.job .no')].map((e) => e.textContent);

beforeEach(() => kur([]));

describe('Onaylar ekranı (2422)', () => {
  it('bekleyenler önce acil, sonra ihtiyaç tarihi; tarihsiz sonda', () => {
    kur([
      talep('a', { needDate: '2026-11-20' }), talep('b', { needDate: '' , priority: 'urgent' }),
      talep('c', { needDate: '2026-11-12' }), talep('d', { needDate: '2026-11-25', priority: 'urgent' }), talep('e'),
    ]);
    expect(bekleyenler(ciz(viewApprovals()))).toEqual(['T-d', 'T-b', 'T-c', 'T-a', 'T-e']);
  });

  it('"Son kararlarınız" yalnız bu kişinin kararlarıdır; başkasının kararı girmez', () => {
    kur([
      talep('a', { status: 'ordered' }, [onay('7', 'approved', 100)]),
      talep('b', { status: 'ordered' }, [onay('9', 'approved', 200)]),
    ]);
    const son = ciz(viewApprovals()).querySelectorAll('.jobs')[1]!;
    expect([...son.querySelectorAll('.job .no')].map((e) => e.textContent)).toEqual(['T-a']);
    kur([talep('b', { status: 'ordered' }, [onay('9', 'approved', 200)])]);
    expect(ciz(viewApprovals()).textContent).not.toContain('Son kararlarınız');
  });

  it('yeniden gönderilen karar listede işaretli; ayrıntıda önceki ret notu ve retten sonraki hareketler üstte', () => {
    const r = talep('a', { log: [{ id: 'l1', at: 50, by: '3', t: 'Teklif girildi' }, { id: 'l2', at: 150, by: '3', t: 'Vade 60 güne çıktı' }] }, [onay('9', 'rejected', 100, 'vade kısa')]);
    kur([r, talep('b')]);
    const liste = ciz(viewApprovals());
    expect(liste.querySelectorAll('.jobs')[0]!.querySelectorAll('.flag.warn').length).toBe(1);
    const ay = ciz(viewApproval(r)).querySelector('.sa-yeniden')!;
    expect(ay.textContent).toContain('vade kısa');
    expect(ay.textContent).toContain('Vade 60 güne çıktı');
    expect(ay.textContent).not.toContain('Teklif girildi');
    expect(ciz(viewApproval(talep('b'))).querySelector('.sa-yeniden')).toBeNull();
  });

  it('onay alanında salt okunur "Adınız" alanı yok; not alanı ve düğmeler yerinde', () => {
    const k = ciz(viewApproval(talep('a')));
    expect(k.querySelector('#ap-name')).toBeNull();
    expect(k.querySelector('#ap-note')).not.toBeNull();
    expect(k.querySelector('[data-act="approve"]')).not.toBeNull();
  });
});
