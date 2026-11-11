import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { FaturaEslemesiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { FaturaEslemesi, kalaniDagit, tutarCoz } from './FaturaEslemesi.tsx';
import { ESLEME_ROTASI, eslemeYolu } from './acik.ts';
import { EslemeBaglantisi, eslemeyeUygun } from './EslemeBaglantisi.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Adlar ve tutarlar uydurmadır.
const CEVAP: FaturaEslemesiCevabi = {
  belgeId: 7, belgeNo: 'DNM-2642', firmaAdi: 'Deneme Tedarik', belgeTutari: '132.00', paraBirimi: 'TRY', siparisParaBirimi: 'TRY', surum: 0,
  satirlar: [
    { siparisSatiriId: 1, kalemAdi: 'Deneme stoklu', miktar: '10', birim: 'adet', siparisTutari: '100.00', yol: 'stok', tutar: null, baskaBelgelerden: null },
    { siparisSatiriId: 2, kalemAdi: 'Deneme hizmet', miktar: '4', birim: 'saat', siparisTutari: '20.00', yol: 'genel_gider', tutar: null, baskaBelgelerden: '25.00' },
  ],
  bayat: [], eslenmemisKalan: '132.00', oran: 0.166667, esleme: 'yok',
};

interface Istek { yontem: string; yol: string; govde: unknown }
function ac(islemler: string[], cevap: () => Response = () => json(200, CEVAP), kapali: string[] | null = null) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined });
    // Kapalı liste verildiyse oturum ondan sonra gelir: sayfa listeyi görmeden eşleme isteği atmasın (sıra belirli).
    if (yol === '/oturum') { if (kapali !== null) await new Promise((r) => setTimeout(r, 30)); return json(200, { kullanici: { id: 9, ad: 'Deneme Muhasebe', islemler } }); }
    if (yol === '/kapali-sayfalar' && kapali !== null) return json(200, { kapali });
    if (yol.startsWith('/satin-alma-fatura-eslemeleri/7')) return cevap();
    return json(404, {});
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[eslemeYolu(7)]}>
        <BildirimSaglayici><Routes>
          <Route path={ESLEME_ROTASI} element={<FaturaEslemesi />} />
          <Route path="/finans/kayitlar" element={<p>Kayıtlar sayfası</p>} />
        </Routes></BildirimSaglayici>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('2642 b, 2675: fatura eşlemesi ekranı (Finans)', () => {
  it('tutar çözümü: virgül ondalık, nokta yalnız binlik (Arayüz A1); dağıtım yalnız kalanı yalnız boş satırlara verir (A2)', () => {
    expect(tutarCoz('1.250,50')).toBe('1250.50');
    expect(tutarCoz('1.250')).toBe('1250');
    expect(tutarCoz('12,5')).toBe('12.5');
    expect(tutarCoz('12.5')).toBeNull();
    expect(tutarCoz('1.25,00')).toBeNull();
    expect(tutarCoz('0')).toBeNull();
    expect(tutarCoz('1,234')).toBeNull();
    expect(kalaniDagit(CEVAP.satirlar, '100.01', {})).toEqual({ 1: '83,34', 2: '16,67' });
    // Stok satırına 100 girildi: kalan 32 yalnız boş hizmet satırına; girilen alan aynı kalır.
    expect(kalaniDagit(CEVAP.satirlar, '132.00', { 1: '100' })).toEqual({ 1: '100', 2: '32,00' });
    expect(kalaniDagit(CEVAP.satirlar, '132.00', { 1: '140' })).toEqual({ 1: '140' });
  });

  it('para birimi farklı siparişte mükerrer notu çıkmaz (Maliyet)', async () => {
    ac(['finans.oku', 'finans.yaz'], () => json(200, { ...CEVAP, paraBirimi: 'USD' }));
    expect(await screen.findByText(/Eşlenmemiş kalan: 132,00 USD/)).toBeTruthy();
    expect(screen.queryByText(/Başka faturalarda/)).toBeNull();
  });

  it('yazar: kalan uyarısı, aşımda Kaydet kapalı, mükerrer eşleme notu; kayıt tam listeyi sürümle gönderir', async () => {
    const istekler = ac(['finans.oku', 'finans.yaz']);
    expect(await screen.findByText(/Eşlenmemiş kalan: 132,00 ₺/)).toBeTruthy();
    expect(screen.getByText('Genel gider')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Fatura eşlemesi: DNM-2642/ })).toBeTruthy();
    expect(screen.getByText(/Deneme Tedarik · Fatura tutarı/)).toBeTruthy();
    const stok = screen.getByLabelText('Deneme stoklu: faturaya düşen (₺)');
    fireEvent.change(stok, { target: { value: '12.5' } });
    expect(stok.getAttribute('aria-describedby')).toBe('finans-fe-gecersiz');
    expect(document.getElementById('finans-fe-gecersiz')?.textContent).toMatch(/Geçersiz tutar/);
    fireEvent.change(stok, { target: { value: '140' } });
    expect(await screen.findByText(/fatura tutarını 8,00 ₺ aşıyor/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(stok, { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Deneme hizmet: faturaya düşen (₺)'), { target: { value: '10' } });
    expect(screen.getByText(/Başka faturalarda 25,00 ₺ eşli/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((x) => x.yontem === 'POST')).toBe(true));
    expect(istekler.find((x) => x.yontem === 'POST')).toEqual({ yontem: 'POST', yol: '/satin-alma-fatura-eslemeleri/7/kaydet',
      govde: { surum: 0, satirlar: [{ siparisSatiriId: 1, tutar: '100' }, { siparisSatiriId: 2, tutar: '10' }] } });
  });

  it('salt okur: girdi, Kaydet ve dağıt yok (Arayüz K8); okuma yetkisi yoksa istek atılmaz', async () => {
    ac(['finans.maliyet-oku']);
    expect(await screen.findByText('Deneme stoklu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
    expect(screen.queryByRole('button', { name: /dağıt/ })).toBeNull();
    expect(screen.queryByLabelText(/faturaya düşen/)).toBeNull();
    cleanup();
    const istekler = ac(['satin-alma.oku']);
    expect(await screen.findByText(/finans okuma yetkisi/)).toBeTruthy();
    expect(istekler.some((x) => x.yol.startsWith('/satin-alma-fatura-eslemeleri'))).toBe(false);
  });

  it('siparişsiz ya da iptal fatura: sunucu iletisi boş durum olarak, form yok (Arayüz K7)', async () => {
    ac(['finans.oku', 'finans.yaz'], () => json(422, { kod: 'GECERSIZ', mesaj: 'İptal edilmiş fatura eşlenemez.' }));
    expect(await screen.findByText('İptal edilmiş fatura eşlenemez.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('2675: sorgu Finans anahtarıyla, uç Satın Alma\'nın; adresle açılınca "Kayıtlara dön" Finans kayıtlarına gider', async () => {
    const istekler = ac(['finans.oku']);
    expect(await screen.findByText('Deneme stoklu')).toBeTruthy();
    expect(istekler.some((x) => x.yontem === 'GET' && x.yol === '/satin-alma-fatura-eslemeleri/7')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Kayıtlara dön/ }));
    expect(await screen.findByText('Kayıtlar sayfası')).toBeTruthy();
  });

  it('2675 Mimar N2: satın alma siparişleri kapalıysa sayfa boş durum, eşleme isteği yok', async () => {
    const istekler = ac(['finans.oku', 'finans.yaz'], undefined, ['/satin-alma']);
    expect(await screen.findByText(/Satın alma kapalı/)).toBeTruthy();
    expect(istekler.some((x) => x.yol.startsWith('/satin-alma-fatura-eslemeleri'))).toBe(false);
  });
});

const BELGE = { id: 7, yon: 'gider', durum: 'acik', satinAlmaSiparisi: { talepId: 't', teklifId: 'k' } } as const;
function baglanti(islemler: string[], belge: Record<string, unknown>, kapali: string[] = []) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    yollar.push(adres.replace('/api', ''));
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Muhasebe', islemler } });
    if (yol === '/kapali-sayfalar') return json(200, { kapali });
    return json(404, {});
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/finans/kayitlar']}>
        <Routes>
          <Route path="/finans/kayitlar" element={<EslemeBaglantisi belge={{ ...BELGE, ...belge } as never} />} />
          <Route path={ESLEME_ROTASI} element={<p>Eşleme sayfası</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Oturum ve kapalı liste geldikten sonra karar verilmiş olur; "görünmez" denetimi bundan sonra anlamlıdır.
  return async () => {
    await waitFor(() => expect(yollar).toEqual(expect.arrayContaining(['/oturum', '/kapali-sayfalar'])));
    await new Promise((r) => setTimeout(r, 20));
  };
}

describe('2675: fatura ayrıntısında "Sipariş satırlarına eşle" bağlantısı', () => {
  it('yalnız siparişli, iptal olmayan gider belgesinde', () => {
    expect(eslemeyeUygun(BELGE)).toBe(true);
    expect(eslemeyeUygun({ ...BELGE, yon: 'gelir' })).toBe(false);
    expect(eslemeyeUygun({ ...BELGE, durum: 'iptal' })).toBe(false);
    expect(eslemeyeUygun({ ...BELGE, satinAlmaSiparisi: null })).toBe(false);
  });

  it('maliyet okuyana görünür ve eşleme adresine gider', async () => {
    baglanti(['finans.maliyet-oku'], {});
    fireEvent.click(await screen.findByRole('button', { name: 'Sipariş satırlarına eşle' }));
    expect(await screen.findByText('Eşleme sayfası')).toBeTruthy();
  });

  it('finans okuma yetkisi yoksa ya da satın alma siparişleri kapalıysa görünmez', async () => {
    await baglanti(['satin-alma.oku'], {})();
    expect(screen.queryByRole('button', { name: 'Sipariş satırlarına eşle' })).toBeNull();
    cleanup();
    await baglanti(['finans.oku'], {}, ['/satin-alma/siparisler'])();
    expect(screen.queryByRole('button', { name: 'Sipariş satırlarına eşle' })).toBeNull();
  });
});
