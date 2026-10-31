import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCikis } from '../../ortak/veri/oturum.ts';
// Kanca, açılışta yüklenen rota dosyasıyla kurulur; hiçbir Arkon ekranı açılmaz.
import './rotalar.tsx';

// Karar 102 a: TMI oturumu kapanınca Arkon'un cihazdaki kişi verisi silinir; cihaz ayarları kalır. Yeni ekran da aynı yerel depoyu kullanır.
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('Arkon çıkış temizliği', () => {
  it('Arkon sayfası hiç açılmadan TMI çıkışı kişi verisini siler, istasyon seçimi kalır', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    localStorage.setItem('arkon:opName', JSON.stringify('Deneme Kisi'));
    localStorage.setItem('arkon:station', JSON.stringify('CNC-1'));
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCikis(), { wrapper: ({ children }) => <QueryClientProvider client={istemci}>{children}</QueryClientProvider> });

    await act(async () => { await result.current.mutateAsync(); });

    await waitFor(() => expect(localStorage.getItem('arkon:opName')).toBeNull());
    expect(localStorage.getItem('arkon:station')).not.toBeNull();
  });
});
