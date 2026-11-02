import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KapaliSayfalarCevabi, KapaliSayfalarGovdesi } from '#paylasilan/sozlesme/ayarlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SAYFA_SATIRLARI, SayfaAyarlari, sayfaSatirlariniSuz } from './SayfaAyarlari.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(baslangic: string[], okumaDurumu = 200) {
  const yazilanlar: KapaliSayfalarGovdesi[] = [];
  let saklanan = baslangic;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/kapali-sayfalar') {
      return okumaDurumu === 200
        ? json(200, { kapali: saklanan } satisfies KapaliSayfalarCevabi)
        : json(okumaDurumu, { kod: 'SUNUCU', mesaj: 'Hata.' });
    }
    if (yol === '/kapali-sayfalar/degistir') {
      const govde = JSON.parse(secenek.body ?? '{}') as KapaliSayfalarGovdesi;
      yazilanlar.push(govde);
      saklanan = govde.kapali ? [...saklanan, govde.yol] : saklanan.filter((k) => k !== govde.yol);
      return json(200, { kapali: saklanan } satisfies KapaliSayfalarCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><SayfaAyarlari /></BildirimSaglayici></QueryClientProvider>);
  return istemci;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const altli = SAYFA_SATIRLARI.find((s) => s.altlar.length > 0);

describe('sayfa ayarları', () => {
  it('Sistem Ayarları listede yoktur; ikinci menüsü olan sayfanın alt sayfaları altında durur', () => {
    expect(SAYFA_SATIRLARI.some((s) => s.yol === '/ayarlar')).toBe(false);
    expect(altli).toBeTruthy();
  });

  it('kapatmak yolu listeye ekler; sunucunun cevabı ortak anahtara yazılır; kapalı sayfanın alt anahtarları kapalı ve kilitlidir', async () => {
    if (!altli) throw new Error('alt sayfası olan sayfa yok');
    const yazilanlar = sunucuKur([]);
    const istemci = ac();
    const anahtar = await screen.findByRole('switch', { name: altli.baslik });
    await waitFor(() => expect(anahtar.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(anahtar);
    await screen.findByText('Sayfa kapatıldı.');
    expect(yazilanlar).toEqual([{ yol: altli.yol, kapali: true }]);
    expect(istemci.getQueryData<KapaliSayfalarCevabi>(ortakAnahtarlar.kapaliSayfalar)).toEqual({ kapali: [altli.yol] });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${altli.baslik}`) }));
    const alt = screen.getByRole('switch', { name: `${altli.baslik}: ${altli.altlar[0]?.baslik}` });
    expect(alt.getAttribute('aria-checked')).toBe('false');
    expect((alt as HTMLButtonElement).disabled).toBe(true);
  });

  it('açmak yalnız o sayfayı gönderir; öteki kapalı sayfalar kapalı kalır', async () => {
    if (!altli) throw new Error('alt sayfası olan sayfa yok');
    const yazilanlar = sunucuKur([altli.yol, '/diger']);
    ac();
    const anahtar = await screen.findByRole('switch', { name: altli.baslik });
    await waitFor(() => expect(anahtar.getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(anahtar);
    await screen.findByText('Sayfa açıldı.');
    expect(yazilanlar).toEqual([{ yol: altli.yol, kapali: false }]);
  });

  it('liste alınamazsa anahtarlar kilitlidir ve hata gösterilir; hiçbir şey yazılmaz', async () => {
    if (!altli) throw new Error('alt sayfası olan sayfa yok');
    const yazilanlar = sunucuKur([], 500);
    ac();
    await screen.findByText('Sayfa durumları alınamadı; anahtarlar kilitli.');
    const anahtar = screen.getByRole('switch', { name: altli.baslik });
    expect((anahtar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(anahtar);
    expect(yazilanlar).toEqual([]);
  });

  it('alt sayfalar kapalı gelir, sayfanın düğmesiyle açılır ve kapanır', async () => {
    if (!altli) throw new Error('alt sayfası olan sayfa yok');
    const ilkAlt = `${altli.baslik}: ${altli.altlar[0]?.baslik}`;
    sunucuKur([]);
    ac();
    await screen.findByRole('switch', { name: altli.baslik });
    expect(screen.queryByRole('switch', { name: ilkAlt })).toBeNull();
    const dugme = screen.getByRole('button', { name: new RegExp(`^${altli.baslik}`) });
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    expect(dugme.textContent).toContain(`${altli.altlar.length} alt sayfa`);
    fireEvent.click(dugme);
    expect(dugme.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('switch', { name: ilkAlt })).toBeTruthy();
    fireEvent.click(dugme);
    expect(screen.queryByRole('switch', { name: ilkAlt })).toBeNull();
  });

  it('arama sayfa ve alt sayfa adında Türkçe harfe duyarlı geçer; eşleşen alt sayfa açık gelir, eşleşme yoksa söylenir', async () => {
    if (!altli) throw new Error('alt sayfası olan sayfa yok');
    const alt = altli.altlar[0];
    if (!alt) throw new Error('alt sayfa yok');
    expect(sayfaSatirlariniSuz(SAYFA_SATIRLARI, '')).toHaveLength(SAYFA_SATIRLARI.length);
    expect(sayfaSatirlariniSuz(SAYFA_SATIRLARI, altli.baslik.toLocaleUpperCase('tr'))).toContainEqual(altli);
    const altSonuc = sayfaSatirlariniSuz(SAYFA_SATIRLARI, alt.baslik);
    expect(altSonuc.find((s) => s.yol === altli.yol)?.altlar).toContainEqual(alt);
    sunucuKur([]);
    ac();
    await screen.findByRole('switch', { name: altli.baslik });
    fireEvent.change(screen.getByLabelText('Sayfa ara'), { target: { value: alt.baslik } });
    expect(screen.getByRole('switch', { name: `${altli.baslik}: ${alt.baslik}` })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sayfa ara'), { target: { value: 'zzzz-olmayan' } });
    expect(screen.getByText('Eşleşen sayfa yok.')).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('önbellekteki eski liste gösterilse de liste tazelenene kadar anahtarlar kilitlidir', async () => {
    if (!altli) throw new Error('alt sayfası olan sayfa yok');
    sunucuKur([altli.yol]);
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    istemci.setQueryData<KapaliSayfalarCevabi>(ortakAnahtarlar.kapaliSayfalar, { kapali: [] });
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><SayfaAyarlari /></BildirimSaglayici></QueryClientProvider>);
    const anahtar = screen.getByRole('switch', { name: altli.baslik });
    expect((anahtar as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(anahtar.getAttribute('aria-checked')).toBe('false'));
    await waitFor(() => expect((anahtar as HTMLButtonElement).disabled).toBe(false));
  });
});
