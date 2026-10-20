import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KarsilamaCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { anahtarlar } from '../veri/anahtarlar.ts';
import { useOturum } from '../veri/oturum.ts';
import { gosteriBitir, gosteriKur } from '../veri/gorunum.ts';
import { karsilamaDonemi } from '../veri/karsilama.ts';
import { KARSILAMA_SURESI_MS, Karsilama } from './Karsilama.tsx';

const KISI: Kullanici = { id: 7, ad: 'Deneme Operatör', islemler: [] };
// Sunucunun gerçek cevap biçimi; metin deneme metnidir. Saatler eşit: gece hiç yoktur, sonuç saate bağlı değildir.
const ACIK = { acik: true, metin: 'Deneme karşılama', geceMetni: 'Deneme gece', gunduzBaslangic: 6, geceBaslangic: 6 } satisfies KarsilamaCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(karsilama: KarsilamaCevabi = ACIK) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/karsilama') return json(200, karsilama);
    if (yol === '/oturum') return json(200, { kullanici: null } satisfies OturumCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}

function ac(istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={istemci}><Karsilama kisiId={KISI.id} ad={KISI.ad} /></QueryClientProvider>);
  return istemci;
}

const pencere = () => screen.findByRole('dialog', { name: ACIK.metin });

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { cleanup(); act(() => { gosteriBitir(); }); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Karşılama', () => {
  it('ayardaki metinle ve kişinin adıyla çıkar; düğmeyle kapanır; aynı sekmede yeniden açılışta çıkmaz ve ayar sorulmaz', async () => {
    const yollar = sunucuKur();
    ac();
    const kutu = await pencere();
    expect(kutu.textContent).toContain(KISI.ad);
    expect(screen.getByRole('heading', { name: ACIK.metin })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Başlayalım' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(yollar).toEqual(['/karsilama']);

    cleanup();
    const istemci = ac();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(istemci.getQueryState(anahtarlar.karsilama)?.status).toBe('pending');
    expect(yollar).toEqual(['/karsilama']);
  });

  it('açılış gösterisi oynarken beklenir, gösteri bitince gelir', async () => {
    const yollar = sunucuKur();
    act(() => { gosteriKur('lazer', null, null, true); });
    const istemci = ac();
    await waitFor(() => expect(istemci.getQueryState(anahtarlar.karsilama)?.status).toBe('success'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.sessionStorage.getItem('tmi.karsilama')).toBeNull();
    act(() => { gosteriBitir(); });
    expect(await pencere()).toBeTruthy();
    expect(yollar).toEqual(['/karsilama']);
  });

  it('Esc ile kapanır', async () => {
    sunucuKur();
    ac();
    fireEvent.keyDown(await pencere(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('kendiliğinden kapanır; süre dolmadan yerinde kalır', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sunucuKur();
    ac();
    await pencere();
    act(() => { vi.advanceTimersByTime(KARSILAMA_SURESI_MS - 100); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ayar kapalıyken hiç çıkmaz', async () => {
    sunucuKur({ ...ACIK, acik: false });
    const istemci = ac();
    await waitFor(() => expect(istemci.getQueryState(anahtarlar.karsilama)?.status).toBe('success'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(KISI.ad)).toBeNull();
  });

  it('başka kişinin işareti bu kişiyi susturmaz', async () => {
    window.sessionStorage.setItem('tmi.karsilama', '99');
    sunucuKur();
    ac();
    expect((await pencere()).textContent).toContain(KISI.ad);
  });

  it('oturumsuz cevap (biten oturum) işareti siler; oturum sürerken işaret kalır', async () => {
    window.sessionStorage.setItem('tmi.karsilama', String(KISI.id));
    function Oturum() {
      const oturum = useOturum();
      return <p>{oturum.isSuccess ? 'okundu' : 'bekliyor'}</p>;
    }
    sunucuKur();
    render(<QueryClientProvider client={new QueryClient()}><Oturum /></QueryClientProvider>);
    await screen.findByText('okundu');
    expect(window.sessionStorage.getItem('tmi.karsilama')).toBeNull();
    cleanup();

    window.sessionStorage.setItem('tmi.karsilama', String(KISI.id));
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { kullanici: KISI } satisfies OturumCevabi)));
    render(<QueryClientProvider client={new QueryClient()}><Oturum /></QueryClientProvider>);
    await screen.findByText('okundu');
    expect(window.sessionStorage.getItem('tmi.karsilama')).toBe(String(KISI.id));
  });

  it('gece saatinde gece metniyle ve koyu kartla, gündüz saatinde gündüz metniyle çıkar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    const saatler = { gunduzBaslangic: 6, geceBaslangic: 18 };
    // Tesis saati İstanbul'dur (UTC+3): 18:30Z akşam 21:30, 06:00Z sabah 09:00.
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 14, 18, 30)));
    sunucuKur({ ...ACIK, ...saatler });
    ac();
    const gece = await screen.findByRole('dialog', { name: ACIK.geceMetni });
    expect(gece.getAttribute('data-theme')).toBe('dark');
    cleanup();

    window.sessionStorage.clear();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 14, 6, 0)));
    sunucuKur({ ...ACIK, ...saatler });
    ac();
    const gunduz = await pencere();
    expect(gunduz.getAttribute('data-theme')).toBeNull();
  });
});

describe('karsilamaDonemi', () => {
  it('varsayılan 06-18 gündüz, 18-06 gece; sınır saatleri yeni döneme aittir', () => {
    expect([5, 6, 12, 17, 18, 23, 0].map((s) => karsilamaDonemi(s, 6, 18)))
      .toEqual(['gece', 'gunduz', 'gunduz', 'gunduz', 'gece', 'gece', 'gece']);
  });

  it('gündüz gece yarısını aşabilir; iki saat aynıysa gece yoktur', () => {
    expect([19, 23, 3, 8, 12].map((s) => karsilamaDonemi(s, 20, 8))).toEqual(['gece', 'gunduz', 'gunduz', 'gece', 'gece']);
    expect([0, 6, 18, 23].map((s) => karsilamaDonemi(s, 6, 6))).toEqual(['gunduz', 'gunduz', 'gunduz', 'gunduz']);
  });
});
