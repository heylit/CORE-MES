import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OranOzeti } from '#paylasilan/sozlesme/finans.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { KurFaizSeridi, oranEskiMi } from './KurFaizSeridi.tsx';
import { ustSeritler } from './ust-serit.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
// Kişi, kur ve oranlar uydurmadır.
const OZET: OranOzeti = {
  bugun: '2026-10-13',
  kurlar: [
    { paraBirimi: 'USD', tarih: '2026-10-13', alis: '41.500000', satis: '41.600000', oncekiAlis: '41.200000', oncekiSatis: '41.300000', girenAd: 'Deneme Satinalma', giris: '2026-10-13T06:44:00.000Z', surum: 2 },
    { paraBirimi: 'EUR', tarih: '2026-10-10', alis: '45.100000', satis: '45.200000', oncekiAlis: '45.300000', oncekiSatis: '45.400000', girenAd: 'Deneme Muhasebe', giris: '2026-10-10T06:00:00.000Z', surum: 1 },
  ],
  faizler: [
    { tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: '42.0000', oncekiYillikYuzde: '40.0000', not: null, girenAd: 'Deneme Muhasebe', giris: '2026-10-01T07:00:00.000Z' },
    { tur: 'mevduat', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-08-01', yillikYuzde: '35.0000', oncekiYillikYuzde: null, not: null, girenAd: 'Deneme Muhasebe', giris: '2026-08-01T07:00:00.000Z' },
  ],
  sonGiris: { tur: 'kur', giris: '2026-10-13T06:44:00.000Z', girenAd: 'Deneme Satinalma' },
  gecmis: [
    { tur: 'kur', paraBirimi: 'USD', deger: '41.500000', ikinciDeger: '41.600000', tarih: '2026-10-13', duzeltme: true, girenAd: 'Deneme Satinalma', giris: '2026-10-13T06:44:00.000Z' },
    { tur: 'kredi', paraBirimi: 'TRY', deger: '42.0000', ikinciDeger: null, tarih: '2026-10-01', duzeltme: false, girenAd: 'Deneme Muhasebe', giris: '2026-10-01T07:00:00.000Z' },
  ],
};

type Istek = { yontem: string; yol: string; govde: unknown; kimlik: string | null };
function sunucuKur(islemler: string[], faizYanit?: () => Response | Promise<Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined, kimlik: new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler } });
    if (yol === '/finans/oran-ozeti') return json(200, OZET);
    if (yol.startsWith('/finans/oran-araligi')) {
      return json(200, { kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-10', alis: '41.200000', satis: '41.300000' }, { paraBirimi: 'USD', tarih: '2026-10-13', alis: '41.500000', satis: '41.600000' }], faizler: [] });
    }
    if (yol === '/finans/kur-ciftleri/ekle' || yol === '/finans/kur-ciftleri/guncelle') return json(200, {});
    if (yol === '/finans/oranlar/ekle') return faizYanit ? faizYanit() : json(200, { id: 1 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><KurFaizSeridi /></BildirimSaglayici></QueryClientProvider>);
}
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Ortak kur ve faiz şeridi (939, 952 a, 953 a; 2238)', () => {
  it('giriş yapan herkese bildirilir: modül şeridi oturum işlemiyle', () => {
    expect(ustSeritler.map((s) => [s.anahtar, s.islem])).toEqual([['kur-faiz', 'oturum']]);
  });

  it('1089 a: panelde herkes grafiği görür, son 90 gün okunur; toplu yükleme yalnız finans.kur-yaz olana', async () => {
    const istekler = sunucuKur(['musteri-tedarikci.oku']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /^USD/ }));
    expect(screen.getByText('Kur ve faiz grafiği')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.tc-kfg-ozet')?.textContent).toBe('41,5 13.10.2026en düşük 41,2 · en yüksek 41,5'));
    expect(istekler.some((i) => i.yol === '/finans/oran-araligi?baslangic=2026-07-15&bitis=2026-10-13')).toBe(true);
    expect(screen.queryByText('Toplu yükleme')).toBeNull();
    cleanup();
    sunucuKur(['finans.kur-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /^USD/ }));
    expect(screen.getByText('Toplu yükleme')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Şablonu indir' })).toBeTruthy();
  });

  it('herkes alış / satış kurunu ve TRY yıllık faizlerini görür; eski kurun ve 30 günden eski oranın günü yazılır; finans işlemi yoksa form yok', async () => {
    const istekler = sunucuKur(['musteri-tedarikci.oku']);
    ac();
    expect((await screen.findByRole('button', { name: /^USD/ })).getAttribute('title')).toBe('Son kur girişi: bugün 09:44, Deneme Satinalma');
    expect(screen.queryByText(/Son kur girişi/)).toBeNull();
    expect(document.querySelector('[data-kfs="kur-USD"]')?.textContent).toBe('USD41,5 / 41,6arttı, önceki 41,2');
    expect(document.querySelector('[data-kfs="kur-EUR"]')?.textContent).toBe('EUR45,1 / 45,2azaldı, önceki 45,310.10');
    expect(document.querySelector('[data-kfs="kur-GBP"]')?.textContent).toBe('GBPyok');
    expect(document.querySelector('[data-kfs="faiz-kredi"]')?.textContent).toBe('Kredi%42arttı, önceki 40');
    expect(document.querySelector('[data-kfs="faiz-mevduat"]')?.textContent).toBe('Mevduat%3501.08');
    expect(document.querySelector('[data-kfs="faiz-politika"]')?.textContent).toBe('Politikayok');
    expect(screen.queryByText('Bugün girilmedi')).toBeNull();
    expect(screen.queryByText('Güncelle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^USD/ }));
    expect(screen.getByText('Kur ve faiz girişi finans ve satın almadadır.')).toBeTruthy();
    expect(screen.getByText('Kredi: TRY %42 · USD yok · EUR yok')).toBeTruthy();
    expect(screen.getByText('USD 41,5 / 41,6')).toBeTruthy();
    expect(screen.getByText('TRY yıllık %42')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kurları kaydet' })).toBeNull();
    expect(screen.getByText('düzeltme')).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('eskime sınırı 30 gündür', () => {
    expect(oranEskiMi('2026-09-13', '2026-10-13')).toBe(false);
    expect(oranEskiMi('2026-09-12', '2026-10-13')).toBe(true);
  });

  it('finans.kur-yaz bugünün alış ve satışını birlikte yazar: bugün girilmiş olan sürümüyle düzeltilir, girilmemiş olana satır açılır, değişmeyen gitmez', async () => {
    const istekler = sunucuKur(['finans.kur-yaz']);
    ac();
    expect(await screen.findByText('Bugün girilmedi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^USD/ }));
    expect((screen.getByLabelText('USD alış') as HTMLInputElement).value).toBe('41,5');
    expect((screen.getByLabelText('USD satış') as HTMLInputElement).value).toBe('41,6');
    fireEvent.change(screen.getByLabelText('USD satış'), { target: { value: '41,75' } });
    fireEvent.change(screen.getByLabelText('EUR alış'), { target: { value: '45,2' } });
    fireEvent.change(screen.getByLabelText('EUR satış'), { target: { value: '45,3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kurları kaydet' }));
    await vi.waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect(yazmalar(istekler).map((i) => [i.yol, i.govde])).toEqual([
      ['/finans/kur-ciftleri/guncelle', { paraBirimi: 'USD', alis: 41.5, satis: 41.75, tarih: '2026-10-13', surum: 2 }],
      ['/finans/kur-ciftleri/ekle', { paraBirimi: 'EUR', alis: 45.2, satis: 45.3, tarih: '2026-10-13' }],
    ]);
    // Kur çifti uçları tekrar korumalıdır: her yazma kendi istek kimliğiyle gider.
    const kimlikler = yazmalar(istekler).map((i) => i.kimlik);
    expect(kimlikler.every((k) => /^[0-9a-f-]{36}$/.test(k ?? ''))).toBe(true);
    expect(new Set(kimlikler).size).toBe(2);
  });

  it('eksik ya da ters kur çifti gönderilmez ve neden söylenir', async () => {
    const istekler = sunucuKur(['finans.kur-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /^USD/ }));
    fireEvent.change(screen.getByLabelText('GBP alış'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kurları kaydet' }));
    expect(screen.getByRole('alert').textContent).toBe('GBP için alış ve satış ikisi de sıfırdan büyük olmalı.');
    fireEvent.change(screen.getByLabelText('GBP satış'), { target: { value: '54' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kurları kaydet' }));
    expect(screen.getByRole('alert').textContent).toBe('GBP satış kuru alıştan küçük olamaz.');
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('yıllık faiz tür ve para birimi başına bugünden geçerli yazılır; yalnız değişen gider', async () => {
    const istekler = sunucuKur(['finans.kur-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /^USD/ }));
    expect((screen.getByLabelText('TRY kredi %') as HTMLInputElement).value).toBe('42');
    fireEvent.change(screen.getByLabelText('USD politika %'), { target: { value: '4,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faizi kaydet' }));
    await vi.waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toEqual({ tur: 'politika', paraBirimi: 'USD', yillikYuzde: 4.25, gecerlilikBaslangic: '2026-10-13', not: null });
  });

  it('FNS-40: cevabı gelmeyen faiz gönderimi aynı istek kimliğiyle yinelenir', async () => {
    let kopar = true;
    const istekler = sunucuKur(['finans.kur-yaz'], () => { if (kopar) { kopar = false; throw new TypeError('ağ koptu'); } return json(200, { id: 1 }); });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /^USD/ }));
    fireEvent.change(screen.getByLabelText('TRY mevduat %'), { target: { value: '36' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faizi kaydet' }));
    await vi.waitFor(() => expect(yazmalar(istekler)).toHaveLength(2), { timeout: 4000 });
    const [ilk, yineleme] = yazmalar(istekler).map((i) => i.kimlik);
    expect(ilk).toMatch(/^[0-9a-f-]{36}$/);
    expect(yineleme).toBe(ilk);
  });

  it('özet okunamazsa şerit çizilmez', async () => {
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => (adres.endsWith('/oturum')
      ? json(200, { kullanici: { id: 9, ad: 'Deneme', islemler: [] } })
      : json(500, { kod: 'SUNUCU', mesaj: 'Hata' }))));
    ac();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('.tc-kfs')).toBeNull();
  });
});
