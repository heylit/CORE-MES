import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { temaYaz, temayiSifirla } from '../../ortak/veri/tema.ts';
import { ArkonCercevesi } from './ArkonCercevesi.tsx';

// Kabuktaki tema düğmesi açık Arkon çerçevesini de değiştirir; çerçeve yeniden kurulmaz.
describe('Arkon çerçevesi ortak temayı izler', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); temayiSifirla(); localStorage.clear(); });

  it('kabukta tema değişince çerçevedeki Arkon aynı temaya geçer', async () => {
    temaYaz('light');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'admin', isMerkezleri: [], aktif: true } }))));
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler: ['sayfa.arkon'] });
    const ekran = render(
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/arkon/operator']}>
            <Routes><Route path="/arkon/:sayfa" element={<ArkonCercevesi />} /></Routes>
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    expect(JSON.parse(localStorage.getItem('arkon:theme') ?? 'null')).toBe('light');
    const pencere = cerceve.contentWindow;
    if (!pencere) throw new Error('çerçeve penceresi yok');
    const olaylar = vi.fn();
    pencere.addEventListener('arkon-tema', olaylar);

    act(() => { temaYaz('dark'); });

    expect(olaylar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(pencere.localStorage.getItem('arkon:theme') ?? 'null')).toBe('dark');
    expect(ekran.container.querySelector('iframe')).toBe(cerceve);
  });
});
