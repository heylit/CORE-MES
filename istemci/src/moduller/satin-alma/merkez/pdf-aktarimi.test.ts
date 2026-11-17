import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
import type { PdfEkraniBaglami } from '../pdf-teklif/ekran.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri, sekme } from './test-ekrani.ts';

// 3404: PDF ekranı burada açılmaz; teklif tablosunun aktarımı ve kayıtta PDF'in teklife eklenmesi ölçülür.
const acilan: PdfEkraniBaglami[] = [];
vi.mock('../pdf-teklif/ekran.ts', () => ({ pdfOkuAc: (b: PdfEkraniBaglami) => { acilan.push(b); } }));

const talep: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'ORN talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'ORN Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'teklif_isteniyor', iptalNedeni: '', agirliklar: null,
  kalemler: [
    { id: '00000000-0000-4000-8000-0000000000c1', katalogId: null, ad: 'ORN kalem 1', ozellik: '', miktar: '10', birim: 'kg', kategori: '' },
    { id: '00000000-0000-4000-8000-0000000000c2', katalogId: null, ad: 'ORN kalem 2', ozellik: '', miktar: '5', birim: 'kg', kategori: '' },
  ],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'ORN Alıcı' }, talepler: [talep], tedarikciler: [], katalog: [],
  firmaKartlari: [{ id: 41, ad: 'ORN Kartlı Firma' }],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }, { paraBirimi: 'EUR', kur: '36', aylikFaizYuzdesi: '1' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; acilan.length = 0; });

describe('3404: PDF tekliften toplu teklif tablosuna', () => {
  it('aktarım tabloya taslak yazar, sunucuya gitmez; kayıttan sonra PDF teklife eklenir', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
      istekler.push(`${i?.method ?? 'GET'} ${adres}`);
      // Talep kaydı yavaş döner: PDF eki ancak kayıt bittikten sonra gönderilmeli (teklif sunucuda yoksa bağ 404 olur).
      if (i?.method === 'POST' && !adres.includes('ek-bagla')) { await new Promise((bitti) => { setTimeout(bitti, 40); }); istekler.push(`BITTI ${adres}`); }
      return new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    Element.prototype.scrollIntoView = () => {};
    window.scrollTo = () => {};
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, bildirim: { bildir: () => 0, kaldir: () => {} } });
    await vi.waitFor(() => expect(talepSatiri(kok, talep.id)).not.toBeNull());
    talepSatiri(kok, talep.id)!.click();
    await vi.waitFor(() => expect(sekme(kok, 'quotes')).not.toBeNull());
    sekme(kok, 'quotes')!.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-act="pdf-oku"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('[data-act="pdf-oku"]')!.click();
    expect(acilan).toHaveLength(1);
    const k1 = talep.kalemler[0]!.id;
    acilan[0]!.aktar({
      supplierId: '41', currency: 'EUR', date: '2026-11-17', validUntil: '2026-12-01', payDays: 60, discountPct: 0, shipping: 45, deliveryIncluded: false, leadDays: 28,
      prices: { [k1]: 4.85 }, note: 'PDF teklif ORN-TK-1', pdf: { ozet: 'a'.repeat(64), ad: 'ORN-teklif.pdf' },
    });
    const once = istekler.length;
    expect(kok.querySelector<HTMLSelectElement>('#bulk select[data-bf="supplierId"][data-col="0"]')!.value).toBe('41');
    expect(kok.querySelector<HTMLInputElement>(`#bulk [data-bi="${k1}"][data-col="0"]`)!.value).toMatch(/^4,85/);
    expect(kok.querySelector<HTMLElement>('#bulk-bar')!.hidden).toBe(false);
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-bf="deliveryIncluded"][data-col="0"]')!.checked).toBe(false);
    expect(kok.querySelector<HTMLInputElement>('#bulk [data-bf="shipping"][data-col="0"]')!.value).toMatch(/^45/);
    expect(istekler.slice(once).filter((y) => !y.startsWith('GET'))).toEqual([]);
    kok.querySelector<HTMLElement>('[data-act="bulk-save"]')!.click();
    await vi.waitFor(() => expect(istekler.some((y) => /^POST .*\/teklifler\/[^/]+\/ek-bagla$/.test(y))).toBe(true));
    const kayitBitti = istekler.findIndex((y) => y.startsWith('BITTI') && y.includes('/satin-alma-talepleri/'));
    const ek = istekler.findIndex((y) => y.includes('ek-bagla'));
    expect(kayitBitti).toBeGreaterThanOrEqual(0);
    expect(kayitBitti).toBeLessThan(ek);
    kapat();
  });
});
