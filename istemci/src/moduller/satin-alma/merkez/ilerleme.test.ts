import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri } from './test-ekrani.ts';
import { adimSirasi, ilerlemeNoktalari } from './views.ts';
import type { PurchaseRequest, RequestStatus } from './tipler.ts';

const talep = (r: Partial<PurchaseRequest> & { status: RequestStatus }): PurchaseRequest => ({
  id: 't1', no: 'ST-2026-001', title: 'Deneme', department: '', requester: '', needDate: '', notes: '', priority: 'normal',
  items: [{ id: 'k1', name: 'Deneme kalem', spec: '', qty: 1, unit: 'adet' }], quotes: [], rfqs: [], log: [], createdAt: 0, ...r,
} as PurchaseRequest);
const TED = {
  firmaId: 41, ad: 'ORN- Tedarikçi', vergiNo: null, yetkili: 'ORN- Yetkili', telefon: null, eposta: 'orn@ornek.invalid', sehir: null, firmaAktif: true, firmaSurum: null,
  durum: 'aktif', kaliteDurumu: null, puan: null, notlar: '', kategoriler: [], degerlendirmeler: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z',
} as unknown as AcilisCevabi['tedarikciler'][number];
const karar = (decision?: 'approved' | 'rejected') => ({ mode: 'single', quoteId: 'q1', approvals: decision ? [{ decision, by: '', at: 0 }] : [] }) as unknown as PurchaseRequest['award'];

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('talebin yedi adımı (kart #939, 3467 Teklif al)', () => {
  it('şimdiki adım durumdan ve onaydan çıkar; reddedilen karar karar adımına döner, iptal -1', () => {
    expect(adimSirasi(talep({ status: 'draft', items: [] }))).toBe(0);
    expect(adimSirasi(talep({ status: 'draft' }))).toBe(1);
    expect(adimSirasi(talep({ status: 'rfq' }))).toBe(2);
    expect(adimSirasi(talep({ status: 'eval' }))).toBe(3);
    expect(adimSirasi(talep({ status: 'eval', award: karar('rejected') }))).toBe(3);
    expect(adimSirasi(talep({ status: 'approval', award: karar() }))).toBe(4);
    expect(adimSirasi(talep({ status: 'approval', award: karar('approved') }))).toBe(5);
    expect(adimSirasi(talep({ status: 'ordered', award: karar('approved') }))).toBe(6);
    expect(adimSirasi(talep({ status: 'received', award: karar('approved') }))).toBe(7);
    expect(adimSirasi(talep({ status: 'cancelled' }))).toBe(-1);
  });

  it('listedeki noktalar biteni, şimdikini ve kalanı ayırır', () => {
    const el = document.createElement('div');
    el.innerHTML = ilerlemeNoktalari(talep({ status: 'approval', award: karar() }));
    expect(el.querySelector('.sa-noktalar')?.getAttribute('aria-label')).toBe('Adım 5/7: Onay');
    expect([...el.querySelectorAll('i')].map((i) => i.className)).toEqual(['done', 'done', 'done', 'done', 'cur', '', '']);
    el.innerHTML = ilerlemeNoktalari(talep({ status: 'received', award: karar('approved') }));
    expect(el.querySelector('.sa-noktalar')?.getAttribute('aria-label')).toBe('Bütün adımlar tamam');
  });

  it('talep ekranında yedi adım, şimdiki adımın bölümü açık, "Şimdi yapılacak" kutusu tek birincil düğmeyle; Teklif al adımında istek, e-posta taslağı ve kayıt', async () => {
    const t: Talep = {
      id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
      oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
      kalemler: [{ id: '00000000-0000-4000-8000-0000000000c1', katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '2', birim: 'adet', kategori: '' }],
      teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
    };
    const acilis: AcilisCevabi = {
      kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [t], tedarikciler: [TED], firmaKartlari: [], katalog: [],
      ayarlar: {
        sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
        kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
      },
    };
    const yazilan: { adres: string; govde: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      if (ayar?.method === 'POST') {
        const govde: unknown = JSON.parse(String(ayar.body));
        yazilan.push({ adres, govde });
        return new Response(JSON.stringify({ ...t, ...(govde as object), surum: 2 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
    talepSatiri(kok, t.id)!.click();
    const serit = () => kok.querySelector('[role="tablist"][aria-label="Talebin adımları"]');
    await vi.waitFor(() => expect(serit()).not.toBeNull());

    // 2412-2: altı adım ve geçmiş tek sekme şeridinde; şimdiki adım seçili, gövdede onun bölümü.
    const sekmeler = [...serit()!.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(sekmeler.map((s) => s.dataset.sekme)).toEqual(['items', 'rfq', 'quotes', 'compare', 'approval', 'order', 'delivery', 'log']);
    expect(sekmeler.map((s) => s.textContent)).toEqual(['Kalemler', 'Teklif al', 'Teklifler', 'Karar', 'Onay', 'Sipariş', 'Teslim', 'Geçmiş']);
    expect(serit()!.querySelector('[aria-selected="true"]')?.getAttribute('data-sekme')).toBe('rfq');
    expect(kok.querySelector('#main .sa-adim-govde')?.getAttribute('data-sec')).toBe('rfq');
    const kutu = kok.querySelector('.sa-ekran-simdi')!;
    expect(kutu.textContent).toContain('Şimdi yapılacak');
    expect(kutu.textContent).toContain('Bekleyen: Satın alma.');
    expect(kok.querySelectorAll('#sa-ekran .tc-dugme-birincil')).toHaveLength(1);
    // 3466-b b: ana düğme ve diğer işlemler bantta, başlıkta değil.
    expect(kutu.querySelector('.tc-dugme-birincil')).not.toBeNull();
    expect(kutu.querySelector('[aria-label$="diğer işlemler"]')).not.toBeNull();
    expect(kok.querySelector('.tc-sbaslik-eylem')).toBeNull();

    // 3467: Teklif al adımı tedarikçi seçimi, e-posta taslağı ve kaydı adımın içinde taşır (pencere açılmaz).
    const kutucuk = () => kok.querySelector<HTMLInputElement>(`#main [data-rfq="${String(TED.firmaId)}"]`)!;
    expect(kutucuk().checked).toBe(false);
    kutucuk().click();
    kutucuk().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(kok.querySelector<HTMLSelectElement>('#rfq-prev')!.value).toBe(''));
    const prev = kok.querySelector<HTMLSelectElement>('#rfq-prev')!;
    prev.value = String(TED.firmaId);
    prev.dispatchEvent(new Event('change', { bubbles: true }));
    expect(kok.querySelector('#rfq-alici')?.textContent).toBe('orn@ornek.invalid');
    expect(kok.querySelector('#rfq-konu')?.textContent).toBe('Fiyat teklifi talebi, ST-2026-001 Deneme talep');
    expect(kok.querySelector('#rfq-out')?.textContent).toContain('Sayın ORN- Yetkili,');
    expect(kok.querySelector('#rfq-out')?.textContent).not.toContain('Konu:');
    const posta = kok.querySelector<HTMLAnchorElement>('#rfq-posta')!;
    expect(posta.hidden).toBe(false);
    expect(posta.getAttribute('href')).toMatch(/^mailto:orn%40ornek\.invalid\?subject=Fiyat%20teklifi%20talebi/);
    // Seçim yeniden çizimde korunur (adım her kayıtta yeniden çizilir).
    sekmeler[0]!.click();
    await vi.waitFor(() => expect(kok.querySelector('#main .sa-adim-govde')?.getAttribute('data-sec')).toBe('items'));
    sekmeler[1]!.click();
    await vi.waitFor(() => expect(kok.querySelector('#main .sa-adim-govde')?.getAttribute('data-sec')).toBe('rfq'));
    expect(kutucuk().checked).toBe(true);
    expect(kok.querySelector('#rfq-alici')?.textContent).toBe('orn@ornek.invalid');
    kok.querySelector<HTMLButtonElement>('#main [data-act="mark-rfq"]')!.click();
    await vi.waitFor(() => expect(yazilan.length).toBeGreaterThan(0));
    expect(JSON.stringify(yazilan.map((y) => y.govde))).toContain('"firmaId":41');
    await vi.waitFor(() => expect(kok.querySelector('#main .sa-adim-govde')?.getAttribute('data-sec')).toBe('rfq'));
    expect(kok.querySelector('#main')?.textContent).toContain('Teklif istekleri');
    // Cevabı beklenen tedarikçi yeniden seçilemez (Arayüz 3467-1).
    await vi.waitFor(() => expect(kutucuk().disabled).toBe(true));
    expect(kutucuk().checked).toBe(false);

    // Adıma basmak bölümünü açar.
    sekmeler[4]!.click();
    await vi.waitFor(() => expect(kok.querySelector('#main .sa-adim-govde')?.getAttribute('data-sec')).toBe('approval'));
    kapat();
  });
});
