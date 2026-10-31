import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { ayarEkranlariniTopla, gorunenAyarEkranlari } from '../../ortak/rota/ayar-ekranlari.ts';
import * as modul from './ayar-ekranlari.tsx';
import { ArkonAyarBolumu } from './yeni/ArkonYeni.tsx';
import { sunucuKur, YONETICI } from './yeni/test-ortak.tsx';

// Sistem Ayarları'ndaki Arkon bölümü Üretim Hazırlık > Ayarlar'ın kendisidir (yeni ekran): aynı ekran, aynı görünürlük.
describe('Arkon ayar ekranı', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

  it('Üretim Hazırlık > Ayarlar maddesini gören görür', () => {
    const ekranlar = ayarEkranlariniTopla({ 'arkon/ayar-ekranlari.tsx': modul });
    const menu = IKINCI_MENULER.find((m) => m.kok === '/arkon')!;
    const maddeler = menu.gruplar.flatMap((g): readonly { anahtar: string; islem: string }[] => g.maddeler);
    const madde = maddeler.find((m) => m.anahtar === 'ayarlar')!;
    expect(ekranlar.map((e) => e.islem)).toEqual([madde.islem]);
    expect(gorunenAyarEkranlari(ekranlar, ['sayfa.arkon']).map((e) => e.ekran)).toEqual([ArkonAyarBolumu]);
    expect(gorunenAyarEkranlari(ekranlar, ['sayfa.kuyruk'])).toEqual([]);
  });

  it('yeni ekranın Ayarlar sayfasını çerçevesiz açar; Sistem Ayarları adresi değişmez', async () => {
    sunucuKur(YONETICI);
    let adres = '';
    function Adres() { adres = useLocation().pathname; return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/ayarlar']}>
            <Routes><Route path="/ayarlar" element={<ArkonAyarBolumu />} /></Routes>
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const bolum = await screen.findByRole('region', { name: 'Ayarlar' }, { timeout: 10000 });
    expect(bolum.getAttribute('data-sayfa')).toBe('ayarlar');
    expect(await screen.findByRole('tablist', { name: 'Ayarlar bölümleri' }, { timeout: 10000 })).toBeTruthy();
    expect(ekran.container.querySelector('iframe')).toBeNull();
    expect(adres).toBe('/ayarlar');
  }, 20000);
});
