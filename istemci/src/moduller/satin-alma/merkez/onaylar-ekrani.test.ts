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
const bekleyenler = (k: HTMLElement) => [...k.querySelectorAll('.sa-oy-liste .no')].map((e) => e.textContent);

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

describe('Onay listesi tablosu (3466-2)', () => {
  it('bekleme süresi son "onaya gönderildi" kaydından; kayıt yoksa karar gününden; ikisi de yoksa tire', async () => {
    const { beklemeMetni, onayaGidis } = await import('./roles.ts');
    const r = talep('a', { log: [{ id: 'l1', at: 1_000, by: '3', t: 'Karar: X, 10 TL. Onaya gönderildi.' }, { id: 'l2', at: 2_000, by: '3', t: 'Not eklendi' }] });
    expect(onayaGidis(r)).toBe(1_000);
    expect(onayaGidis(talep('b'))).toBe(Date.parse('2026-09-02T00:00:00'));
    expect(onayaGidis(talep('c', { award: { mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: '', approvals: [] } }))).toBeNull();
    expect(beklemeMetni(null)).toBe('–');
    expect(beklemeMetni(0, 5 * 3_600_000)).toBe('5 saat');
    expect(beklemeMetni(0, 72 * 3_600_000)).toBe('3 gün');
  });

  it('önerilen seçilmediyse dikkat rozeti ve kararın sırası; özet sayılar yazılır', () => {
    const ucuz: Quote = { ...teklif, id: 'q0', supplierId: 'f1', prices: { k1: 1 } };
    kur([talep('a', { quotes: [teklif, ucuz] })]);
    const k = ciz(viewApprovals());
    const satir = k.querySelector('.sa-oy-liste tbody tr')!;
    expect(satir.textContent).toContain('önerilen seçilmedi');
    expect(satir.textContent).toContain('2. sıradaki teklif');
    expect(k.querySelectorAll('.sa-oy-ozet').length).toBe(4);
  });

  it('bölünmüş karar: kalem kalem dağılım salt okunur matriste, her kalemin seçili hücresi kararın tedarikçisidir', () => {
    const q2: Quote = { ...teklif, id: 'q2', supplierId: 'f2', prices: { k1: 12, k2: 7 } };
    const q1: Quote = { ...teklif, prices: { k1: 10, k2: 9 } };
    const r = talep('a', {
      items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }, { id: 'k2', materialId: null, name: 'Deneme ikinci', spec: '', qty: 4, unit: 'adet' }],
      quotes: [q1, q2],
      award: { mode: 'split', quoteId: null, splits: { k1: 'q1', k2: 'q2' }, reason: '', by: '', decidedAt: '2026-09-02', approvals: [] },
    });
    kur([r]);
    S.suppliers['f2'] = { id: 'f2', name: 'Deneme İkinci' } as Supplier;
    const k = ciz(viewApproval(r));
    const matris = k.querySelector('[data-sa-onay-dagilimi] .sa-kr-genis')!;
    expect(matris).not.toBeNull();
    const secili = (kalem: string) => matris.querySelector(`[data-kr-kalem="${kalem}"] .sa-kr-hucre.sec`)?.getAttribute('data-qid');
    expect([secili('k1'), secili('k2')]).toEqual(['q1', 'q2']);
    // Salt okunur: hücreler devre dışı, "Böl" ve "Tümünü ver" düğmesi yok.
    expect([...matris.querySelectorAll('.sa-kr-hucre')].every((h) => h.hasAttribute('disabled'))).toBe(true);
    expect(matris.querySelector('[data-act="kk-bol"], [data-act="kr-tek"]')).toBeNull();
    // Tek tedarikçili karar bu bölümü çizmez.
    expect(ciz(viewApproval(talep('b'))).querySelector('[data-sa-onay-dagilimi]')).toBeNull();
  });
});
