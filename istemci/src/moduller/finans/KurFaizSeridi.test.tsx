import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KurFaizOzeti } from '#paylasilan/sozlesme/finans.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { KurFaizSeridi, yillikFaiz } from './KurFaizSeridi.tsx';
import { ustSeritler } from './ust-serit.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
// Kişi ve kurlar uydurmadır.
const OZET: KurFaizOzeti = {
  bugun: '2026-10-13',
  kurlar: [
    { paraBirimi: 'USD', tarih: '2026-10-13', kur: '41.500000', girenAd: 'Deneme Satinalma', giris: '2026-10-13T06:44:00.000Z', surum: 2 },
    { paraBirimi: 'EUR', tarih: '2026-10-10', kur: '45.100000', girenAd: 'Deneme Muhasebe', giris: '2026-10-10T06:00:00.000Z', surum: 1 },
  ],
  faizler: [{ paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', aylikYuzde: '3.5000', girenAd: 'Deneme Muhasebe', giris: '2026-10-01T07:00:00.000Z' }],
  gunlukFaizler: [], faizBirimi: 'aylik',
  sonGiris: { tur: 'kur', giris: '2026-10-13T06:44:00.000Z', girenAd: 'Deneme Satinalma' },
  gecmis: [
    { tur: 'kur', paraBirimi: 'USD', deger: '41.500000', tarih: '2026-10-13', duzeltme: true, girenAd: 'Deneme Satinalma', giris: '2026-10-13T06:44:00.000Z' },
    { tur: 'faiz', paraBirimi: 'TRY', deger: '3.5000', tarih: '2026-10-01', duzeltme: false, girenAd: 'Deneme Muhasebe', giris: '2026-10-01T07:00:00.000Z' },
  ],
};

type Istek = { yontem: string; yol: string; govde: unknown; kimlik: string | null };
function sunucuKur(islemler: string[], faizYanit?: () => Response | Promise<Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined, kimlik: new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler } });
    if (yol === '/finans/kur-ozeti') return json(200, OZET);
    if (yol.startsWith('/finans/kur-faiz-araligi')) return json(200, { kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-10', kur: '41.200000' }, { paraBirimi: 'USD', tarih: '2026-10-13', kur: '41.500000' }], faizler: [] });
    if (yol === '/finans/kurlar/ekle' || yol === '/finans/kurlar/guncelle') return json(200, {});
    if (yol === '/finans/faizler/ekle') return faizYanit ? faizYanit() : json(200, { id: 1 });
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

describe('Ortak kur ve faiz şeridi (939, 952 a, 953 a)', () => {
  it('giriş yapan herkese bildirilir: modül şeridi oturum işlemiyle', () => {
    expect(ustSeritler.map((s) => [s.anahtar, s.islem])).toEqual([['kur-faiz', 'oturum']]);
  });

  it('1089 a: panelde herkes kur grafiğini görür, son 90 gün okunur; toplu yükleme yalnız finans.kur-yaz olana', async () => {
    const istekler = sunucuKur(['musteri-tedarikci.oku']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Son giriş/ }));
    expect(screen.getByText('Kur ve faiz grafiği')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.tc-kfg-ozet')?.textContent).toBe('41,5 13.10.2026en düşük 41,2 · en yüksek 41,5'));
    expect(istekler.some((i) => i.yol === '/finans/kur-faiz-araligi?baslangic=2026-07-15&bitis=2026-10-13')).toBe(true);
    expect(screen.queryByText('Toplu yükleme')).toBeNull();
    cleanup();
    sunucuKur(['finans.kur-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kur ve faizi güncelle' }));
    expect(screen.getByText('Toplu yükleme')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Şablonu indir' })).toBeTruthy();
  });

  it('finans işlemi olmayan kişi değerleri, eski kurun gününü ve son girişleri görür; güncelleme düğmesi ve formu yok', async () => {
    const istekler = sunucuKur(['musteri-tedarikci.oku']);
    ac();
    expect((await screen.findByText(/Son giriş:/)).textContent).toBe('Son giriş: bugün 09:44, Deneme Satinalma');
    expect(document.querySelector('[data-kfs="kur-USD"]')?.textContent).toBe('USD41,5');
    expect(document.querySelector('[data-kfs="kur-EUR"]')?.textContent).toBe('EUR45,110.10');
    expect(document.querySelector('[data-kfs="kur-GBP"]')?.textContent).toBe('GBPyok');
    expect(document.querySelector('[data-kfs="faiz-TRY"]')?.textContent).toBe('TRY faiz%3,5/ay');
    expect(screen.queryByText('Bugün girilmedi')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kur ve faizi güncelle' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Son giriş/ }));
    expect(screen.getByText('Kur ve faiz girişi finans ve satın almadadır.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kurları kaydet' })).toBeNull();
    expect(screen.getByText('düzeltme')).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('finans.kur-yaz bugünün kurlarını birlikte yazar: bugün girilmiş olan sürümüyle düzeltilir, girilmemiş olana satır açılır, değişmeyen gitmez', async () => {
    const istekler = sunucuKur(['finans.kur-yaz']);
    ac();
    expect(await screen.findByText('Bugün girilmedi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kur ve faizi güncelle' }));
    expect((screen.getByLabelText('USD kuru') as HTMLInputElement).value).toBe('41,5');
    fireEvent.change(screen.getByLabelText('USD kuru'), { target: { value: '41,75' } });
    fireEvent.change(screen.getByLabelText('EUR kuru'), { target: { value: '45,2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kurları kaydet' }));
    await vi.waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect(yazmalar(istekler).map((i) => [i.yol, i.govde])).toEqual([
      ['/finans/kurlar/guncelle', { paraBirimi: 'USD', tarih: '2026-10-13', kur: 41.75, surum: 2 }],
      ['/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: '2026-10-13', kur: 45.2 }],
    ]);
  });

  it('geçersiz kur gönderilmez ve neden söylenir (reddedilen)', async () => {
    const istekler = sunucuKur(['finans.kur-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kur ve faizi güncelle' }));
    fireEvent.change(screen.getByLabelText('GBP kuru'), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kurları kaydet' }));
    expect(screen.getByRole('alert').textContent).toBe('GBP kuru sıfırdan büyük bir sayı olmalı.');
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('faiz bugünden geçerli yazılır, yıllık karşılığı yanında; yalnız değişen para birimi gider', async () => {
    const istekler = sunucuKur(['finans.kur-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kur ve faizi güncelle' }));
    expect(screen.getByText('yıllık %42')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('USD aylık faiz (%)'), { target: { value: '0,4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Faizi kaydet' }));
    await vi.waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]?.govde).toEqual({ paraBirimi: 'USD', gecerlilikBaslangic: '2026-10-13', aylikYuzde: 0.4 });
    expect(yillikFaiz(3.5)).toBeCloseTo(42, 6);
  });

  it('FNS-40: cevabı gelmeyen faiz gönderimi aynı istek kimliğiyle yinelenir', async () => {
    let kopar = true;
    const istekler = sunucuKur(['finans.kur-yaz'], () => { if (kopar) { kopar = false; throw new TypeError('ağ koptu'); } return json(200, { id: 1 }); });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kur ve faizi güncelle' }));
    fireEvent.change(screen.getByLabelText('TRY aylık faiz (%)'), { target: { value: '3,6' } });
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
