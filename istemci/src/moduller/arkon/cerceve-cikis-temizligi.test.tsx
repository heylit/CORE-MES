import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { useCikis } from '../../ortak/veri/oturum.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { ArkonCercevesi } from './ArkonCercevesi.tsx';

// Karar 102 a: TMI oturumu kapanınca Arkon'un cihazdaki kişi verisi silinir; cihaz ayarları kalır. Sayfa değiştirmek çıkış değildir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); delete window.__tmiArkonBagla; });

function ekranKur() {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => new Response(JSON.stringify(String(adres).includes('/arkon/iletiler')
    ? { son: 1, iletiler: [] }
    : { kisi: { kimlik: '7', ad: 'Deneme', rol: 'admin', isMerkezleri: [], aktif: true } }))));
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
  return { istemci, ekran };
}
const hazir = () => waitFor(() => { if (window.__tmiArkonBagla === undefined) throw new Error('köprü yok'); });
const kisiVerisiYaz = () => { localStorage.setItem('arkon:opName', JSON.stringify('Ali Veli')); localStorage.setItem('arkon:station', JSON.stringify('CNC-1')); };

describe('Arkon çerçevesi çıkışta yerel veriyi siler', () => {
  it('oturum kapanınca kişi verisi gider, istasyon seçimi ve tema kalır', async () => {
    const { istemci } = ekranKur();
    await hazir();
    kisiVerisiYaz();

    act(() => { istemci.setQueryData<Kullanici | null>(ortakAnahtarlar.oturum, null); });

    await waitFor(() => expect(localStorage.getItem('arkon:opName')).toBeNull());
    expect(localStorage.getItem('arkon:station')).not.toBeNull();
    expect(localStorage.getItem('arkon:theme')).not.toBeNull();
  });

  it('oturum açıkken başka sayfaya geçip çerçeve kalkınca veri silinmez', async () => {
    const { ekran } = ekranKur();
    await hazir();
    kisiVerisiYaz();

    ekran.unmount();

    expect(localStorage.getItem('arkon:opName')).not.toBeNull();
  });

  it('Arkon sayfası açık değilken TMI çıkışı da kişi verisini siler (ortak çıkış kancası)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    kisiVerisiYaz();
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCikis(), { wrapper: ({ children }) => <QueryClientProvider client={istemci}>{children}</QueryClientProvider> });

    await act(async () => { await result.current.mutateAsync(); });

    await waitFor(() => expect(localStorage.getItem('arkon:opName')).toBeNull());
    expect(localStorage.getItem('arkon:station')).not.toBeNull();
  });
});
