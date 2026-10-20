import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';
import { adimSirasi, ilerlemeNoktalari } from './views.ts';
import type { PurchaseRequest, RequestStatus } from './tipler.ts';

const talep = (r: Partial<PurchaseRequest> & { status: RequestStatus }): PurchaseRequest => ({
  id: 't1', no: 'ST-2026-001', title: 'Deneme', department: '', requester: '', needDate: '', notes: '', priority: 'normal',
  items: [{ id: 'k1', name: 'Deneme kalem', spec: '', qty: 1, unit: 'adet' }], quotes: [], rfqs: [], log: [], createdAt: 0, ...r,
} as PurchaseRequest);
const karar = (decision?: 'approved' | 'rejected') => ({ mode: 'single', quoteId: 'q1', approvals: decision ? [{ decision, by: '', at: 0 }] : [] }) as unknown as PurchaseRequest['award'];

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('talebin altı adımı (kart #939)', () => {
  it('şimdiki adım durumdan ve onaydan çıkar; reddedilen karar karar adımına döner, iptal -1', () => {
    expect(adimSirasi(talep({ status: 'draft', items: [] }))).toBe(0);
    expect(adimSirasi(talep({ status: 'draft' }))).toBe(1);
    expect(adimSirasi(talep({ status: 'rfq' }))).toBe(1);
    expect(adimSirasi(talep({ status: 'eval' }))).toBe(2);
    expect(adimSirasi(talep({ status: 'eval', award: karar('rejected') }))).toBe(2);
    expect(adimSirasi(talep({ status: 'approval', award: karar() }))).toBe(3);
    expect(adimSirasi(talep({ status: 'approval', award: karar('approved') }))).toBe(4);
    expect(adimSirasi(talep({ status: 'ordered', award: karar('approved') }))).toBe(5);
    expect(adimSirasi(talep({ status: 'received', award: karar('approved') }))).toBe(6);
    expect(adimSirasi(talep({ status: 'cancelled' }))).toBe(-1);
  });

  it('listedeki noktalar biteni, şimdikini ve kalanı ayırır', () => {
    const el = document.createElement('div');
    el.innerHTML = ilerlemeNoktalari(talep({ status: 'approval', award: karar() }));
    expect(el.querySelector('.sa-noktalar')?.getAttribute('aria-label')).toBe('Adım 4/6: Onay');
    expect([...el.querySelectorAll('i')].map((i) => i.className)).toEqual(['done', 'done', 'done', 'cur', '', '']);
    el.innerHTML = ilerlemeNoktalari(talep({ status: 'received', award: karar('approved') }));
    expect(el.querySelector('.sa-noktalar')?.getAttribute('aria-label')).toBe('Bütün adımlar tamam');
  });

  it('talep ekranında altı adım, şimdiki adımın bölümü açık, "Şimdi yapılacak" kutusu tek birincil düğmeyle', async () => {
    const t: Talep = {
      id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
      oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
      kalemler: [{ id: '00000000-0000-4000-8000-0000000000c1', katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '2', birim: 'adet', kategori: '' }],
      teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
    };
    const acilis: AcilisCevabi = {
      kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [t], tedarikciler: [], firmaKartlari: [], katalog: [],
      ayarlar: {
        sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
        kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } })));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector(`tr[data-id="${t.id}"]`)).not.toBeNull());
    expect(kok.querySelector(`tr[data-id="${t.id}"] .sa-noktalar`)?.getAttribute('aria-label')).toBe('Adım 2/6: Teklif');
    kok.querySelector<HTMLElement>(`tr[data-id="${t.id}"]`)!.click();
    await vi.waitFor(() => expect(kok.querySelector('.sa-ilerleme')).not.toBeNull());

    const adimlar = [...kok.querySelectorAll('.sa-ilerleme li')];
    expect(adimlar.map((li) => li.querySelector('.al')!.textContent)).toEqual(['Talep', 'Teklif', 'Karar', 'Onay', 'Sipariş', 'Teslim']);
    expect(adimlar.map((li) => li.className)).toEqual(['done', 'cur', '', '', '', '']);
    expect(kok.querySelector('.sa-ilerleme [aria-current="step"] .al')?.textContent).toBe('Teklif');
    expect([...kok.querySelectorAll('.fsec')].map((s) => (s as HTMLElement).dataset.sec)).toEqual(['items', 'quotes', 'compare', 'approval', 'order', 'delivery', 'log']);
    expect(kok.querySelector('.fsec.open')?.getAttribute('data-sec')).toBe('quotes');
    expect([...kok.querySelectorAll('.fsec')].map((s) => ['done', 'cur'].find((c) => s.classList.contains(c)) ?? '')).toEqual(['done', 'cur', '', '', '', '', '']);
    const kutu = kok.querySelector('.sa-simdi')!;
    expect(kutu.textContent).toContain('Şimdi yapılacak, bekleyen: Satın alma');
    expect(kutu.querySelectorAll('.btn.primary')).toHaveLength(1);
    expect(kok.querySelector('.ract .btn.primary')).toBeNull();

    // Adıma basmak bölümünü açar.
    kok.querySelector<HTMLElement>('.sa-ilerleme li:nth-child(4) button')!.click();
    expect(kok.querySelector('.fsec.open')?.getAttribute('data-sec')).toBe('approval');
    kapat();
  });
});
