import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { viewApproval } from './roles.ts';
import { enIyiler } from './onay-karsilastirma.ts';

// 3466-1 (karar C): onaylayanın ekranında teklifler tedarikçi kartları olarak yan yana.
const teklif = (id: string, supplierId: string, ek: Partial<Quote>): Quote => ({
  id, supplierId, supplierName: supplierId, date: '2026-11-01', validUntil: '', currency: 'TRY', fxRate: null,
  prices: {}, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
  leadDays: 7, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '', ...ek,
});
function talep(): PurchaseRequest {
  return {
    id: 't1', no: 'ORN-SAT-1', title: 'ORN- deneme', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'approval',
    items: [
      { id: 'k1', materialId: null, name: 'ORN- kalem 1', spec: '', qty: 10, unit: 'adet' },
      { id: 'k2', materialId: null, name: 'ORN- kalem 2', spec: '', qty: 2, unit: 'adet' },
    ],
    rfqs: [], log: [], createdAt: 1,
    quotes: [
      teklif('qa', 'fa', { prices: { k1: 100, k2: 50 } }),
      teklif('qb', 'fb', { prices: { k1: 2, k2: 1 }, currency: 'EUR', fxRate: 40 }),
      // Eksik kalemli ve en ucuz: TL karşılığı ve net maliyette en iyi sayılmaz.
      teklif('qc', 'fc', { prices: { k1: 10 } }),
    ],
    award: { mode: 'single', quoteId: 'qa', reason: 'ORN- gerekçe', by: '', decidedAt: '2026-11-02', approvals: [] },
  } as PurchaseRequest;
}
beforeEach(() => {
  S.requests = { t1: talep() };
  S.materials = {};
  S.suppliers = Object.fromEntries(['fa', 'fb', 'fc'].map((id) => [id, { id, name: `ORN-Tedarikçi ${id}` } as Supplier]));
  S.settings = { ...DEFAULT_SETTINGS, approvalLimits: [{ max: null, role: 'Genel müdür' }] };
  S.me = { id: '7', email: '', name: 'ORN- Onaycı' };
  bump();
});
const ciz = (): HTMLElement => { const k = document.createElement('div'); k.innerHTML = viewApproval(S.requests.t1!); return k; };
const kartlar = (k: HTMLElement) => [...k.querySelectorAll<HTMLElement>('.sa-oy-kart')];

describe('Onaylar ayrıntısı: tedarikçi kartları (3466-1)', () => {
  it('karar ilk kart ve işaretli; her kart aynı sayıda satır taşır (hiza)', () => {
    const k = kartlar(ciz());
    expect(k.length).toBe(3);
    expect(k[0]!.classList.contains('karar')).toBe(true);
    expect(k[0]!.textContent).toContain('ORN-Tedarikçi fa');
    expect(new Set(k.map((x) => x.children.length)).size).toBe(1);
    const sayi = Number(ciz().querySelector<HTMLElement>('.sa-oy-kartlar')!.style.getPropertyValue('--sa-oy-satir'));
    expect(sayi).toBe(k[0]!.children.length);
  });

  it('dövizli teklifte kalem fiyatının büyük sayısı TL, özgün para alt satırda', () => {
    const b = kartlar(ciz()).find((x) => x.textContent?.includes('ORN-Tedarikçi fb'))!;
    const kalem = [...b.querySelectorAll('.sa-oy-satir')].find((s) => s.textContent?.includes('ORN- kalem 1'))!;
    const deger = kalem.querySelector('.sa-oy-v')!;
    expect(deger.firstChild?.textContent).toMatch(/80/);
    expect(deger.querySelector('.sub')!.textContent).toMatch(/€/);
  });

  it('eksik kalemli teklif TL karşılığı ve net maliyette en iyi sayılmaz; karara göre fark yazılır', () => {
    const k = kartlar(ciz());
    const c = k.find((x) => x.textContent?.includes('ORN-Tedarikçi fc'))!;
    const satir = (kart: HTMLElement, ad: string) => [...kart.querySelectorAll('.sa-oy-satir')].find((s) => s.querySelector('.sa-oy-k')?.textContent?.startsWith(ad))!;
    expect(satir(c, 'Net bugünkü maliyet').classList.contains('best')).toBe(false);
    expect(c.querySelector('.sa-oy-fark')!.textContent).toContain('tek başına seçilemez');
    expect(k[0]!.querySelector('.sa-oy-fark')!.textContent).toContain('Kararda seçilen');
    const b = k.find((x) => x.textContent?.includes('ORN-Tedarikçi fb'))!;
    expect(b.querySelector('.sa-oy-fark')!.textContent).toMatch(/Karardan .* ucuz/);
    expect(satir(b, 'Net bugünkü maliyet').classList.contains('best')).toBe(true);
  });

  it('uyarılarda iyi durum en sonda; önerilen seçilmediyse en başta', () => {
    const u = [...ciz().querySelectorAll('.sa-oy-uyari .flag')].map((e) => e.textContent ?? '');
    expect(u[0]).toContain('Önerilen teklif');
    expect(u[0]).toContain('seçilmedi');
    expect(u.some((t) => t.includes('1 kaleme teklif vermedi'))).toBe(true);
  });

  it('bekleyen kararda sayfada not ve düğmeler, telefon çubuğunda Reddet ret penceresini açar', () => {
    const k = ciz();
    expect(k.querySelector('#ap-note')).not.toBeNull();
    expect(k.querySelectorAll('[data-onay-eylemi="onayla"]').length).toBe(1);
    expect(k.querySelector('.sa-oy-alt [data-act="ret-penceresi"]')).not.toBeNull();
    S.requests.t1 = { ...talep(), status: 'ordered', award: { ...talep().award!, approvals: [{ id: 'o1', at: 5, by: '7', name: 'ORN- Onaycı', decision: 'approved', note: '' }] } };
    const sonra = ciz();
    expect(sonra.querySelector('.sa-oy-alt')).toBeNull();
    expect(sonra.querySelector('#ap-note')).toBeNull();
    expect(sonra.querySelector('.sa-oy-gecmis')!.textContent).toContain('Onaylandı');
  });
});

describe('Arayüz 3466 kod sonrası', () => {
  it('para tutarı bölünmez; bilinmeyen ödeme yöntemi boş değil "Belirtilmedi"', () => {
    S.requests.t1!.quotes[0] = { ...S.requests.t1!.quotes[0]!, payMethod: 'gecersiz' } as unknown as Quote;
    const k = kartlar(ciz());
    const yontem = k.map((x) => [...x.querySelectorAll('.sa-oy-satir')].find((s) => s.querySelector('.sa-oy-k')?.textContent?.startsWith('Ödeme yöntemi'))!.querySelector('.sa-oy-v')!.textContent);
    expect(yontem.every((t) => t === 'Belirtilmedi')).toBe(true);
    const b = k.find((x) => x.textContent?.includes('ORN-Tedarikçi fb'))!;
    const kalem = [...b.querySelectorAll('.sa-oy-satir')].find((s) => s.textContent?.includes('ORN- kalem 1'))!;
    expect(kalem.querySelectorAll('.sa-oy-v .sub .sa-oy-nowrap').length).toBe(2);
  });
});

describe('enIyiler', () => {
  it('yalnız uygun ve değeri olanlar; tek değer ya da hepsi eşitse yok', () => {
    expect([...enIyiler([3, 1, 2], 'min', [true, true, true])]).toEqual([1]);
    expect([...enIyiler([3, 1, 2], 'min', [true, false, true])]).toEqual([2]);
    expect([...enIyiler([5, null], 'max', [true, true])]).toEqual([]);
    expect([...enIyiler([4, 4], 'max', [true, true])]).toEqual([]);
  });
});
