import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { rotaninSayfasi } from '../../ortak/rota/sayfa.ts';
import { KUYRUK_SAYFASI } from './ArkonCercevesi.tsx';
import { KUYRUK_ESKI_YOLU, rotalar } from './rotalar.tsx';

// Ana menüdeki Kuyruk yeni ekranı açar (541, 527 1 a); eski çerçeve Arkon'un Plan Kuyruğu'nu salt okunur /kuyruk/eski'de açar
// (arkon/web pano-planlama.ts KuyrukApp).
describe('Kuyruk sayfası', () => {
  const operator = ['arkon.operator', 'sayfa.arkon', 'sayfa.kuyruk'];
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('Kuyruk sayfasının ekranı Arkon modülündedir ve çerçeveli menüyle açılır', () => {
    expect(SAYFALAR.find((s) => s.yol === '/kuyruk')?.islem).toBe('sayfa.kuyruk');
    expect(rotalar.find((r) => r.yol === '/kuyruk')?.ekran).toBeDefined();
    expect(rotaninSayfasi('/kuyruk')).toBe('/kuyruk');
    // Eski adres sayfanın alt yoludur: aynı sayfa işlemiyle açılır.
    expect(rotaninSayfasi(KUYRUK_ESKI_YOLU)).toBe('/kuyruk');
    const menu = IKINCI_MENULER.find((m) => m.kok === '/kuyruk');
    expect(menu?.cerceveli).toBe(true);
    expect(menu?.gruplar.flatMap((g) => g.maddeler).filter((m) => maddeGorunurMu(m, operator)).map((m) => m.yol)).toEqual(['/kuyruk']);
  });

  it('eski çerçeve salt okunur kuyrukla açılır, Arkon sayfa değiştirse de adres eski Kuyruk\'ta kalır', async () => {
    const EskiKuyruk = rotalar.find((r) => r.yol === KUYRUK_ESKI_YOLU)?.ekran;
    if (!EskiKuyruk) throw new Error('eski Kuyruk rotası yok');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'operator', isMerkezleri: [], aktif: true } }))));
    let adres = '';
    function Adres() { adres = useLocation().pathname; return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={[KUYRUK_ESKI_YOLU]}>
            <Routes><Route path={KUYRUK_ESKI_YOLU} element={<EskiKuyruk />} /></Routes>
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    expect(cerceve.getAttribute('src')).toMatch(new RegExp(`#${KUYRUK_SAYFASI}$`));
    const pencere = cerceve.contentWindow!;
    act(() => { cerceve.dispatchEvent(new Event('load')); });
    act(() => {
      pencere.history.replaceState(null, '', '#ayarlar');
      pencere.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(adres).toBe(KUYRUK_ESKI_YOLU);
  });
});
