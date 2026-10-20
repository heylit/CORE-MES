import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { rotaninSayfasi } from '../../ortak/rota/sayfa.ts';
import { KUYRUK_SAYFASI, PlanKuyrugu } from './ArkonCercevesi.tsx';
import { rotalar } from './rotalar.tsx';

// Ana menüdeki Kuyruk, Arkon'un Plan Kuyruğu'nu salt okunur açar (arkon/web pano-planlama.ts KuyrukApp).
describe('Kuyruk sayfası', () => {
  const operator = ['arkon.operator', 'sayfa.arkon', 'sayfa.kuyruk'];
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('Kuyruk sayfasının ekranı Arkon modülündedir ve çerçeveli menüyle açılır', () => {
    expect(SAYFALAR.find((s) => s.yol === '/kuyruk')?.islem).toBe('sayfa.kuyruk');
    expect(rotalar.find((r) => r.yol === '/kuyruk')?.ekran).toBe(PlanKuyrugu);
    expect(rotaninSayfasi('/kuyruk')).toBe('/kuyruk');
    const menu = IKINCI_MENULER.find((m) => m.kok === '/kuyruk');
    expect(menu?.cerceveli).toBe(true);
    expect(menu?.gruplar.flatMap((g) => g.maddeler).filter((m) => maddeGorunurMu(m, operator)).map((m) => m.yol)).toEqual(['/kuyruk']);
  });

  it('çerçeve salt okunur kuyrukla açılır, Arkon sayfa değiştirse de adres Kuyruk\'ta kalır', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'operator', isMerkezleri: [], aktif: true } }))));
    let adres = '';
    function Adres() { adres = useLocation().pathname; return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/kuyruk']}>
            <Routes><Route path="/kuyruk" element={<PlanKuyrugu />} /></Routes>
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
    expect(adres).toBe('/kuyruk');
  });
});
