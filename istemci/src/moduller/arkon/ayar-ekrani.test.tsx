import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { ayarEkranlariniTopla, gorunenAyarEkranlari } from '../../ortak/rota/ayar-ekranlari.ts';
import { AYARLAR_SAYFASI, ArkonAyarlari } from './ArkonCercevesi.tsx';
import * as modul from './ayar-ekranlari.tsx';

// Sistem Ayarları'ndaki Arkon bölümü Arkon MES > Ayarlar'ın kendisidir: aynı ekran, aynı görünürlük.
describe('Arkon ayar ekranı', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('Arkon MES > Ayarlar maddesini gören görür', () => {
    const ekranlar = ayarEkranlariniTopla({ 'arkon/ayar-ekranlari.tsx': modul });
    const menu = IKINCI_MENULER.find((m) => m.kok === '/arkon')!;
    const maddeler = menu.gruplar.flatMap((g): readonly { anahtar: string; islem: string }[] => g.maddeler);
    const madde = maddeler.find((m) => m.anahtar === 'ayarlar')!;
    expect(ekranlar.map((e) => e.islem)).toEqual([madde.islem]);
    expect(gorunenAyarEkranlari(ekranlar, ['sayfa.arkon']).map((e) => e.ekran)).toEqual([ArkonAyarlari]);
    expect(gorunenAyarEkranlari(ekranlar, ['sayfa.kuyruk'])).toEqual([]);
  });

  it('Arkon ayarlarını açar; Arkon sayfa değiştirse de Sistem Ayarları adresi değişmez', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'admin', isMerkezleri: [], aktif: true } }))));
    let adres = '';
    function Adres() { adres = useLocation().pathname; return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/ayarlar']}>
            <Routes><Route path="/ayarlar" element={<ArkonAyarlari />} /></Routes>
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    expect(cerceve.getAttribute('src')).toMatch(new RegExp(`#${AYARLAR_SAYFASI}$`));
    expect(cerceve.parentElement?.classList.contains('tc-arkon-gomulu')).toBe(true);
    const pencere = cerceve.contentWindow!;
    act(() => { cerceve.dispatchEvent(new Event('load')); });
    act(() => {
      pencere.history.replaceState(null, '', '#kalite');
      pencere.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(adres).toBe('/ayarlar');
  });
});
