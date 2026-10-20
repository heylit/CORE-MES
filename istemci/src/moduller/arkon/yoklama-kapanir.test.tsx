import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { ArkonCercevesi } from './ArkonCercevesi.tsx';
import { ILETI_ARALIGI_MS, SANAL_SUNUCU, bagla } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';

// Y13 (kart #862): Arkon'un olay akışı TMI penceresinde döner; çerçeve kalkınca (başka sayfa, çıkış) kapatılmazsa her ziyaret bir yoklama döngüsü
// daha bırakır ve çıkıştan sonra da istek atar.
const BUS = `${window.location.origin}${SANAL_SUNUCU}/api/bus?c=cihaz-1`;
const ILETILER = '/arkon/iletiler';

const pencereKur = () => {
  const pencere = { document: window.document, location: window.location, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {} } as unknown as Window & typeof globalThis;
  pencere.Response = window.Response;
  return pencere;
};
const akisAc = (pencere: Window & typeof globalThis): EventSource => new pencere.EventSource(BUS);

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); delete window.__tmiArkonBagla; });

describe('Arkon olay akışı çerçeveyle kapanır', () => {
  it('bagla\'nın döndürdüğü işlev açık akışların hepsini kapatır; sonra TMI\'ye okuma gitmez', async () => {
    vi.useFakeTimers();
    const yollar: string[] = [];
    const istemci = { get: async (yol: string) => { yollar.push(yol); return { son: 1, iletiler: [] }; }, post: async () => undefined } as unknown as Istemci;
    const pencere = pencereKur();
    const kapat = bagla(pencere, { istemci });
    const birinci = akisAc(pencere);
    const ikinci = akisAc(pencere);
    ikinci.close();
    akisAc(pencere);
    await vi.advanceTimersByTimeAsync(ILETI_ARALIGI_MS);
    const kapanirken = yollar.filter((y) => y.startsWith(ILETILER)).length;
    expect(kapanirken).toBeGreaterThan(0);

    kapat();
    expect(birinci.readyState).toBe(2);
    await vi.advanceTimersByTimeAsync(ILETI_ARALIGI_MS * 5);
    expect(yollar.filter((y) => y.startsWith(ILETILER))).toHaveLength(kapanirken);
  });

  const ekranKur = () => {
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => new Response(JSON.stringify(String(adres).includes('/arkon/iletiler')
      ? { son: 1, iletiler: [] }
      : { kisi: { kimlik: '7', ad: 'Deneme', rol: 'admin', isMerkezleri: [], aktif: true } }))));
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler: ['sayfa.arkon'] });
    return render(
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/arkon/operator']}>
            <Routes><Route path="/arkon/:sayfa" element={<ArkonCercevesi />} /></Routes>
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
  };
  const baglan = async (): Promise<(p: Window & typeof globalThis) => void> => waitFor(() => {
    if (window.__tmiArkonBagla === undefined) throw new Error('köprü yok');
    return window.__tmiArkonBagla;
  });

  it('çerçeve kalkınca (başka sayfa ya da çıkış) Arkon\'un açtığı akış kapanır', async () => {
    const ekran = ekranKur();
    const pencere = pencereKur();
    (await baglan())(pencere);
    const akis = akisAc(pencere);
    expect(akis.readyState).not.toBe(2);

    ekran.unmount();
    expect(akis.readyState).toBe(2);
  });

  it('çerçeve kendi içinde yeniden yüklenince eski sayfanın akışı kapanır, yenisi açık kalır', async () => {
    ekranKur();
    const eski = pencereKur();
    const bagla = await baglan();
    bagla(eski);
    const eskiAkis = akisAc(eski);
    const yeni = pencereKur();
    bagla(yeni);
    const yeniAkis = akisAc(yeni);
    expect(eskiAkis.readyState).toBe(2);
    expect(yeniAkis.readyState).not.toBe(2);
  });
});
