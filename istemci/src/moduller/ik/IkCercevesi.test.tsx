import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { temaYaz, temayiSifirla } from '../../ortak/veri/tema.ts';
import { VERI_KANALI } from './acilis.ts';
import { IkCercevesi } from './IkCercevesi.tsx';
import { sayfaKur } from './sayfa.ts';
import { IK_PAKETI } from './uygulama/paket.ts';

// Borç 177: tema değişince çerçeve yeniden kurulmaz (açık form kaybolmasın); tema çerçeveye iletiyle gider.
const KULLANICI: Kullanici = { id: 5, ad: 'Deneme Uzman', islemler: ['sayfa.ik', 'ik.oku'] };
type JsdomSinifi = new (html: string, secenek: Record<string, unknown>) => { window: Window & typeof globalThis };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); temayiSifirla(); });

function ac() {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => (adres.endsWith('/oturum')
    ? new Response(JSON.stringify({ kullanici: KULLANICI } satisfies OturumCevabi), { status: 200 })
    : new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'Yok.' }), { status: 404 }))));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/ik']}><IkCercevesi /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}

describe('İK çerçevesi ve tema', () => {
  it('tema değişince çerçeve aynı kalır, sayfası yeniden kurulmaz; yeni tema çerçeveye iletiyle gider', async () => {
    temaYaz('light');
    ac();
    const cerceve = await waitFor(() => { const c = document.querySelector('iframe'); expect(c).not.toBeNull(); return c!; }, { timeout: 10000 });
    const belge = cerceve.getAttribute('srcdoc');
    expect(belge).toContain('"tema":"light"');
    // Çerçevenin ilk veri isteği kabuğa yanıt yolunu verir.
    const pencere = cerceve.contentWindow!;
    const gonderilen = vi.spyOn(pencere, 'postMessage');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: VERI_KANALI, yon: 'istek', id: 1, tip: 'ben' }, origin: 'null', source: pencere }));
    });
    act(() => { temaYaz('dark'); });
    expect(document.querySelector('iframe')).toBe(cerceve);
    expect(cerceve.getAttribute('srcdoc')).toBe(belge);
    expect(gonderilen).toHaveBeenCalledWith({ kanal: VERI_KANALI, yon: 'tema', tema: 'dark' }, '*');
  });

  it('çerçevedeki uygulama tema iletisiyle görünümünü değiştirir, yeniden kurulmaz', async () => {
    const KOKEN = 'https://tmi.invalid';
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const p = new Sinif(sayfaKur({ koken: KOKEN, tema: 'light', paket: IK_PAKETI, yaziTipi: '' }), { url: `${KOKEN}/`, runScripts: 'dangerously', pretendToBeVisual: true }).window;
    p.scrollTo = () => undefined;
    const ilet = (data: unknown) => { p.dispatchEvent(new p.MessageEvent('message', { data, origin: KOKEN, source: p })); };
    ilet({
      kanal: VERI_KANALI, yon: 'yanit', id: 1, ok: true,
      veri: { kisi: { id: 5, ad: 'Deneme Uzman' }, rol: 'ik', saltOkunur: false, secenekler: {} },
    });
    const kok = p.document.getElementById('ik')!;
    const kabuk = (): Element => { const e = kok.querySelector('[data-theme]') ?? kok; return e; };
    await vi.waitFor(() => { expect(kabuk().getAttribute('data-theme')).toBe('light'); });
    const ilkKabuk = kabuk();
    ilet({ kanal: VERI_KANALI, yon: 'tema', tema: 'dark' });
    expect(kabuk()).toBe(ilkKabuk);
    expect(kabuk().getAttribute('data-theme')).toBe('dark');
    ilet({ kanal: VERI_KANALI, yon: 'tema', tema: '<b>' });
    expect(kabuk().getAttribute('data-theme')).toBe('dark');
    p.close();
  });
});
