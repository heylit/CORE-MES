import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anahtarlar } from './anahtarlar.ts';
import { useCikis } from './oturum.ts';
import { zamanOrani } from '../arayuz/acilis-oyunlari.ts';
import { bekleyenGirisiOynat, girisGosterisiBaslat, gorunumuSakla, gosteriBitir, gosteriKur, useGosteri, useGosteriSuruyor } from './gorunum.ts';

const AYAR = { hareket: 'orta', acilis: 'lazer', acilisSuresi: 1.5, gecisHizi: 'normal' } as const;

afterEach(() => { act(() => { gosteriBitir(); }); localStorage.clear(); vi.unstubAllGlobals(); });

describe('acilis gosterisi', () => {
  it('gosteri oynarken ve giris gosterisi ayar beklerken suruyor; kapali acilista bekleme hemen biter', () => {
    const { result } = renderHook(() => useGosteriSuruyor());
    expect(result.current).toBe(false);
    act(() => { gosteriKur('lazer', null, null, true); });
    expect(result.current).toBe(true);
    act(() => { gosteriBitir(); });
    expect(result.current).toBe(false);
    act(() => { girisGosterisiBaslat('/api/giris-logosu'); });
    expect(result.current).toBe(true);
    act(() => { bekleyenGirisiOynat({ ...AYAR, acilis: 'yok' }); });
    expect(result.current).toBe(false);
  });

  it('giriste saklanan ayarla hemen kurulur, kabuk arkada girer', () => {
    const { result } = renderHook(() => useGosteri());
    gorunumuSakla(AYAR);
    act(() => { girisGosterisiBaslat('/api/giris-logosu'); });
    expect(result.current[0]).toMatchObject({ tur: 'lazer', sure: 1.5, logo: '/api/giris-logosu', kabukGirer: true });
  });

  it('cihazda ayar yoksa giris gosterisi ayar ilk gelince bir kez oynar', () => {
    const { result } = renderHook(() => useGosteri());
    act(() => { girisGosterisiBaslat('/api/giris-logosu'); });
    expect(result.current[0]).toBeNull();
    act(() => { bekleyenGirisiOynat(AYAR); });
    expect(result.current[0]).toMatchObject({ tur: 'lazer', kabukGirer: true });
    act(() => { result.current[1](); bekleyenGirisiOynat(AYAR); });
    expect(result.current[0]).toBeNull();
  });

  it('kapali acilis kurulmaz; her gosteri yeni sira alir ve bitince kalkar', () => {
    const { result } = renderHook(() => useGosteri());
    act(() => { gosteriKur('yok', null, null, false); });
    expect(result.current[0]).toBeNull();
    act(() => { gosteriKur('cmm', null, null, false); });
    const ilk = result.current[0]?.sira ?? 0;
    act(() => { gosteriKur('rastgele', 2, null, false); });
    expect(result.current[0]?.sira).toBeGreaterThan(ilk);
    act(() => { result.current[1](); });
    expect(result.current[0]).toBeNull();
  });

  it('acilis suresi oyunun saatini o oranda gerer; sure verilmezse oyun kendi suresiyle oynar', () => {
    expect(zamanOrani('cmm', null)).toBe(1);
    expect(zamanOrani('cmm', 4400)).toBe(0.5);
    expect(zamanOrani('cmm', 1100)).toBe(2);
  });

  it('cikis gosterisi dugmeye basildigi anda baslar, sunucuyu beklemez; cikis olmazsa kalkar', async () => {
    let cevapla: (r: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((ok) => { cevapla = ok; })));
    const istemci = new QueryClient();
    istemci.setQueryData(anahtarlar.gorunum, AYAR);
    istemci.setQueryData(anahtarlar.kurumLogosu, { logo: null });
    const sarici = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: istemci }, children);
    const { result } = renderHook(() => ({ cikis: useCikis(), gosteri: useGosteri()[0] }), { wrapper: sarici });
    act(() => { result.current.cikis.mutate(); });
    await waitFor(() => expect(result.current.gosteri).toMatchObject({ tur: 'lazer', logo: '/api/giris-logosu', kabukGirer: false }));
    act(() => { cevapla(new Response(JSON.stringify({ kod: 'MESGUL', mesaj: 'm' }), { status: 503 })); });
    await waitFor(() => expect(result.current.gosteri).toBeNull());
  });
});
