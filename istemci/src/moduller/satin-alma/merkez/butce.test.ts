import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButceKullanimiCevabi, DegerlendirmeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { PurchaseRequest, Quote, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import './tasiyici.ts';
import { butceyiUnut } from './butce.ts';
import { viewApproval, viewRequestRequester } from './roles.ts';
import { headerFacts } from './views.ts';

// Kart 2479: bütçe kullanımı sunucudan okunur (2454); birim adları ve tutarlar uydurmadır.
const teklif: Quote = {
  id: 'q1', supplierId: 'f1', supplierName: 'f1', date: '2026-09-01', validUntil: '', currency: 'TRY', fxRate: null,
  prices: { k1: 10 }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
  leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
};
function talep(ek: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: 't1', no: 'T-1', title: 'Deneme alım', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status: 'approval',
    items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [teklif], log: [], createdAt: 1, version: 4,
    award: { mode: 'single', quoteId: 'q1', reason: '', by: '', decidedAt: '2026-09-02', approvals: [] },
    ...ek,
  };
}
function kur(r: PurchaseRequest): void {
  S.requests = { [r.id]: r };
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: 'Deneme Tedarikçi' } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS, approvalLimits: [{ max: null, role: 'Genel müdür' }] };
  S.me = { id: '7', email: '', name: 'Deneme Onaycı' };
  bump();
}
type Kirilim = DegerlendirmeCevabi['butce'];
const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
let istekler: string[] = [];
function sunucu(kirilim: Kirilim | 'hata', yil: ButceKullanimiCevabi | null = null): void {
  istekler = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = String(adres).replace('/api', '');
    istekler.push(yol);
    if (yol.endsWith('/degerlendirme')) return kirilim === 'hata' ? json({ kod: 'ic', mesaj: 'hata' }, 500) : json({ butce: kirilim });
    if (yol.startsWith('/satin-alma-butce-kullanimi') && yil) return json(yil);
    return json({ kod: 'yok', mesaj: 'yok' }, 404);
  }));
}
const ciz = (html: string): HTMLElement => { const k = document.createElement('div'); k.innerHTML = html; document.body.append(k); return k; };
const kutu = (k: HTMLElement) => k.querySelector<HTMLElement>('[data-sa-butce][data-sa-butce-yer="onay"]')!;
const satir = (b: string | null, butce: string | null, kullanilan: string, buAlim: string) => ({ birim: b, butce, yil: 2026, kullanilan, buAlim });

beforeEach(() => { butceyiUnut(); document.body.innerHTML = ''; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('bütçe kullanımı ekranda (2479)', () => {
  it('onayda birim başına "bu alımla" oranı yıl ve KDV notuyla; oran tabana yuvarlanır, aşım tutardan', async () => {
    sunucu([satir('Bakım', '1000.00', '900.00', '96.00'), satir('Kalıphane', '500.00', '400.00', '100.00'), satir('Üretim', '200.00', '150.00', '60.00')]);
    kur(talep());
    const k = ciz(viewApproval(S.requests.t1!));
    expect(kutu(k).textContent).toContain('…');
    await vi.waitFor(() => expect(kutu(k).querySelectorAll('[data-sa-butce-satir]')).toHaveLength(3));
    const [bakim, kalip, uretim] = [...kutu(k).querySelectorAll<HTMLElement>('[data-sa-butce-satir]')];
    expect(kutu(k).textContent).toContain('2026 bütçesi');
    expect(kutu(k).textContent).toContain('KDV hariç');
    // %99,6 "%100" görünmez; eşitlik aşım değildir; aşan birimde rozet.
    expect(bakim!.textContent).toContain('bu alımla %99');
    expect(bakim!.querySelector('[data-sa-butce-asim]')).toBeNull();
    expect(kalip!.textContent).toContain('bu alımla %100');
    expect(kalip!.querySelector('[data-sa-butce-asim]')).toBeNull();
    expect(uretim!.querySelector('[data-sa-butce-asim]')!.textContent).toContain('aşıyor');
    expect(bakim!.textContent).toContain('996 ₺ / 1.000 ₺');
    expect(istekler).toEqual(['/satin-alma-talepleri/t1/degerlendirme']);
  });

  it('siparişli talepte de oran (kullanılan + bu alım) / bütçe; bütçesiz ve boş birim ayrı yazılır; üçten fazlası "+n birim"', async () => {
    sunucu([satir('Bakım', '1000.00', '500.00', '100.00'), satir(null, null, '50.00', '10.00'), satir('Kalıphane', '0.00', '0.00', '5.00'), satir('Üretim', '100.00', '0.00', '1.00')]);
    kur(talep({ status: 'ordered' }));
    const k = ciz(viewApproval(S.requests.t1!));
    await vi.waitFor(() => expect(kutu(k).querySelectorAll('[data-sa-butce-satir]')).toHaveLength(3));
    const metin = kutu(k).textContent!;
    expect(metin).toContain('bu alımla %60');
    expect(metin).toContain('Belirtilmemiş birim');
    expect(metin.match(/bütçe tanımlı değil/g)).toHaveLength(2);
    expect(metin).toContain('+1 birim daha');
  });

  it('veri sonradan gelince yazılmakta olan onay notu ve odak yerinde kalır', async () => {
    let ver: (() => void) | null = null;
    istekler = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((coz) => { ver = () => coz(json({ butce: [satir('Bakım', '1000.00', '100.00', '50.00')] })); })));
    kur(talep());
    const k = ciz(viewApproval(S.requests.t1!));
    const not = k.querySelector<HTMLInputElement>('#ap-note')!;
    not.focus();
    not.value = 'vade kısa';
    await vi.waitFor(() => expect(ver).not.toBeNull());
    ver!();
    await vi.waitFor(() => expect(kutu(k).textContent).toContain('bu alımla %15'));
    expect(k.querySelector<HTMLInputElement>('#ap-note')).toBe(not);
    expect(not.value).toBe('vade kısa');
    expect(document.activeElement).toBe(not);
  });

  it('okunamazsa kutu "okunamadı" der, onay düğmeleri yerinde kalır', async () => {
    sunucu('hata');
    kur(talep());
    const k = ciz(viewApproval(S.requests.t1!));
    await vi.waitFor(() => expect(kutu(k).textContent).toContain('okunamadı'));
    expect(k.querySelector('[data-act="approve"]')).not.toBeNull();
  });

  it('başlıkta "kullanıldı": açık talepte bu alım eklenmez, siparişlide eklenir; kararsız talep yılın kullanımından okur', async () => {
    sunucu([satir('Bakım', '1000.00', '380.00', '50.00')]);
    kur(talep());
    headerFacts(S.requests.t1!);
    await vi.waitFor(() => expect(headerFacts(S.requests.t1!).join(' ')).toContain('Bakım 2026 bütçesi: kullanıldı %38'));
    kur(talep({ status: 'ordered', version: 5 }));
    headerFacts(S.requests.t1!);
    await vi.waitFor(() => expect(headerFacts(S.requests.t1!).join(' ')).toContain('kullanıldı %43'));

    butceyiUnut();
    const yil = new Date().getFullYear();
    sunucu([], { yil, birimler: [{ birim: 'Bakım', butce: '200.00', kullanilan: '50.00', hesaplanamayanKalem: 0 }, { birim: null, butce: null, kullanilan: '5.00', hesaplanamayanKalem: 1 }] });
    kur(talep({ award: undefined, status: 'eval' }));
    expect(headerFacts(S.requests.t1!).join(' ')).toContain('bütçe …');
    await vi.waitFor(() => expect(headerFacts(S.requests.t1!).join(' ')).toContain(`Bakım ${yil} bütçesi: kullanıldı %25`));
    expect(istekler).toEqual([`/satin-alma-butce-kullanimi?yil=${yil}`]);
    // Bütçesi tanımlı olmayan birimde başlıkta bütçe bilgisi yoktur.
    kur(talep({ award: undefined, status: 'eval', department: 'Depo' }));
    expect(headerFacts(S.requests.t1!).join(' ')).not.toContain('bütçe');
  });

  it('talep eden ekranı bütçe uçlarını çağırmaz', () => {
    sunucu([]);
    kur(talep());
    ciz(viewRequestRequester(S.requests.t1!));
    expect(istekler).toEqual([]);
  });
});
