import { describe, expect, it } from 'vitest';
import type { PurchaseRequest, RequestItem } from './tipler.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { bolmeKapaliNedeni, bolunemezNedeni, bolunmusKarar } from './kalem-kalem.ts';

const kalem = (ek: Partial<RequestItem> = {}): RequestItem => ({ id: 'k1', name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet', ...ek } as RequestItem);
const talep = (ek: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  id: 't-kural', no: 'ST-2026-003', title: 'Deneme', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'eval',
  items: [kalem()],
  quotes: [
    { id: 'qa', supplierId: '3', date: '2026-10-05', currency: 'TRY', prices: { k1: 100 } },
    { id: 'qb', supplierId: '4', date: '2026-10-05', currency: 'TRY', prices: { k1: 120 } },
  ],
  rfqs: [], log: [],
  ...ek,
} as unknown as PurchaseRequest);

describe('3442-5 bölme kuralları', () => {
  it('bağlı kalem, birleştirilen talebin kaynak kalemi ve miktarsız kalem bölünmez', () => {
    expect(bolunemezNedeni(kalem({ sabit: 'bag' }))).toMatch(/bağlı kalem bölünemez/);
    expect(bolunemezNedeni(kalem({ sabit: 'kaynak' }))).toMatch(/Birleştirilen talebin kalemi bölünemez/);
    expect(bolunemezNedeni(kalem({ qty: 0 }))).toMatch(/Miktarı girilmemiş/);
    expect(bolunemezNedeni(kalem())).toBeNull();
  });

  it('sipariş verilmiş ya da kapanmış talepte bölme kapalıdır', () => {
    expect(bolmeKapaliNedeni(talep({ status: 'ordered' }))).toMatch(/Sipariş verildi/);
    expect(bolmeKapaliNedeni(talep({ status: 'received' }))).toMatch(/Sipariş verildi/);
    expect(bolmeKapaliNedeni(talep({ status: 'eval' }))).toBeNull();
  });

  it('bölme kararı yeniden onaya gönderir: eski onaylar taşınmaz', () => {
    const r = talep({
      award: { mode: 'single', quoteId: 'qa', reason: '', by: 'Deneme', decidedAt: '2026-10-12',
        approvals: [{ id: 'o1', at: 1, by: '8', name: 'Deneme Onaylayan', decision: 'reject', note: '' }] } as unknown as PurchaseRequest['award'],
    });
    const { talep: n, metin } = bolunmusKarar(r, 'k1', { qa: 6, qb: 4 }, '');
    expect(n.award?.approvals).toEqual([]);
    expect(n.award?.mode).toBe('split');
    expect(n.status).toBe('approval');
    expect(metin).toContain('Karar onaya gönderildi');
  });

  it('pay tek tedarikçide kalırsa karar tek teklifli olur, kalem bölünmez', () => {
    const { talep: n } = bolunmusKarar(talep(), 'k1', { qa: 10, qb: 0 }, '');
    expect(n.award?.mode).toBe('single');
    expect(n.award?.quoteId).toBe('qa');
    expect(n.items!.map((x) => x.id)).toEqual(['k1']);
  });
});
