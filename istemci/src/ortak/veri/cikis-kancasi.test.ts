import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anahtarlar } from './anahtarlar.ts';
import { cikistaCalistir, useCikis } from './oturum.ts';

afterEach(() => { vi.unstubAllGlobals(); });

function cikisKur(durum: number) {
  vi.stubGlobal('fetch', vi.fn(async () => (durum === 204
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify({ kod: 'MESGUL', mesaj: 'm' }), { status: durum }))));
  const istemci = new QueryClient();
  istemci.setQueryData(anahtarlar.oturum, { id: 1, ad: 'a', islemler: [] });
  const sarici = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: istemci }, children);
  return { istemci, ...renderHook(() => useCikis(), { wrapper: sarici }) };
}

// Modül sayfası açık değilken de cihazdaki verisini çıkışta silebilsin (Arkon, karar 102 a).
describe('cikista calistir kancasi', () => {
  it('cikis basarili olunca her kanca bir kez calisir; hata veren kanca otekileri ve cikisi durdurmaz', async () => {
    const calisan: string[] = [];
    const birak = [
      cikistaCalistir(() => { calisan.push('ilk'); }),
      cikistaCalistir(() => { throw new Error('bozuk'); }),
      cikistaCalistir(async () => { throw new Error('bozuk async'); }),
      cikistaCalistir(async () => { calisan.push('son'); }),
    ];
    const { istemci, result } = cikisKur(204);
    act(() => { result.current.mutate(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calisan).toEqual(['ilk', 'son']);
    expect(istemci.getQueryData(anahtarlar.oturum)).toBeNull();
    birak.forEach((b) => { b(); });
  });

  it('cikis olmazsa kanca calismaz; birakilan kanca sonraki cikista calismaz', async () => {
    const kanca = vi.fn();
    const birak = cikistaCalistir(kanca);
    const ret = cikisKur(503);
    act(() => { ret.result.current.mutate(); });
    await waitFor(() => expect(ret.result.current.isError).toBe(true));
    expect(kanca).not.toHaveBeenCalled();
    birak();
    const tamam = cikisKur(204);
    act(() => { tamam.result.current.mutate(); });
    await waitFor(() => expect(tamam.result.current.isSuccess).toBe(true));
    expect(kanca).not.toHaveBeenCalled();
  });
});
