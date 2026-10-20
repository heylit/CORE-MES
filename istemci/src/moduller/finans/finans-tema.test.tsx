import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { temaYaz, temayiSifirla } from '../../ortak/veri/tema.ts';
import { FinansCercevesi, sayfaKur } from './FinansCercevesi.tsx';
import { prototipYukle } from './prototip.ts';

// Tema değişince çerçeve yeniden kurulmaz (açık form kaybolmasın); tema çerçeveye iletiyle gider. Kişi adı uydurmadır.
const KULLANICI: Kullanici = { id: 5, ad: 'Deneme Okuyan', islemler: ['sayfa.finans', 'musteri-tedarikci.oku'] };
type JsdomSinifi = new (html: string, secenek: Record<string, unknown>) => { window: Window & typeof globalThis };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); temayiSifirla(); });

describe('Finans çerçevesi ve tema', () => {
  it('tema değişince çerçeve aynı kalır, sayfası yeniden kurulmaz; yeni tema çerçeveye iletiyle gider', async () => {
    temaYaz('light');
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => (adres.endsWith('/oturum')
      ? new Response(JSON.stringify({ kullanici: KULLANICI } satisfies OturumCevabi), { status: 200 })
      : new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'Yok.' }), { status: 404 }))));
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/finans/firmalar']}><FinansCercevesi /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
    const cerceve = await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const belge = cerceve.getAttribute('srcdoc');
    expect(belge).toContain('"tema":"light"');
    const pencere = cerceve.contentWindow as Window;
    const giden: unknown[] = [];
    vi.spyOn(pencere, 'postMessage').mockImplementation((ileti: unknown) => { giden.push(ileti); });
    // Çerçevenin ilk iletisi kabuğa yanıt yolunu verir.
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' }, origin: 'null', source: pencere })); });
    act(() => { temaYaz('dark'); });
    expect(screen.getByTitle('Finans ve Muhasebe')).toBe(cerceve);
    expect(cerceve.getAttribute('srcdoc')).toBe(belge);
    expect(giden).toContainEqual({ kanal: 'finans', yon: 'tema', tema: 'dark' });
  });

  it('çerçevedeki prototip tema iletisiyle temasını değiştirir; açık pencere korunur; geçersiz tema yok sayılır', async () => {
    const KOKEN = 'https://tmi.invalid';
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const html = sayfaKur(await prototipYukle(), { koken: KOKEN, kapsam: 'firma', islemler: [], kullanici: { id: 5, ad: 'Deneme Okuyan' }, tema: 'light' });
    const p = new Sinif(html, { url: `${KOKEN}/`, runScripts: 'dangerously', pretendToBeVisual: true }).window;
    p.scrollTo = () => undefined;
    const ilet = (data: unknown) => { p.dispatchEvent(new p.MessageEvent('message', { data, origin: KOKEN, source: p })); };
    const kok = p.document.documentElement;
    await vi.waitFor(() => { expect(kok.dataset.theme).toBe('light'); });
    const cekmece = p.document.getElementById('drawer')!;
    cekmece.hidden = false;
    cekmece.innerHTML = '<input id="acik-alan" value="yazilan">';
    ilet({ kanal: 'finans', yon: 'tema', tema: 'dark' });
    expect(kok.dataset.theme).toBe('dark');
    expect((p.document.getElementById('acik-alan') as HTMLInputElement).value).toBe('yazilan');
    ilet({ kanal: 'finans', yon: 'tema', tema: '<b>' });
    expect(kok.dataset.theme).toBe('dark');
    ilet({ kanal: 'baska', yon: 'tema', tema: 'light' });
    expect(kok.dataset.theme).toBe('dark');
    p.close();
  });
});
