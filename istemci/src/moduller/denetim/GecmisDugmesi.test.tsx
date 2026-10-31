import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { GecmisDugmesi } from './disari.ts';

const MUDUR: Kullanici = { id: 2, ad: 'Deneme Müdür', islemler: ['sayfa.denetim', 'denetim.oku'] };
const OPERATOR: Kullanici = { id: 3, ad: 'Deneme Operatör', islemler: ['sayfa.terminal'] };
const KAYITLAR = [{ tablo: 'musteri_tedarikci_firma', anahtar: { id: 7 } }, { tablo: 'musteri_tedarikci_adres', anahtar: { id: 70 } }];

function Adres() {
  const yer = useLocation();
  return <p>{`${yer.pathname}${yer.search}`}</p>;
}

function ac(kullanici: Kullanici) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kullanici } satisfies OturumCevabi), { status: 200 })));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/firmalar']}>
        <Routes>
          <Route path="/firmalar" element={<><p>Firma kartı</p><GecmisDugmesi kayitlar={KAYITLAR} /></>} />
          <Route path="/denetim" element={<Adres />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('GecmisDugmesi', () => {
  it('denetim.oku taşıyan görür; basınca Denetim Kaydı kayıt listesiyle açılır', async () => {
    ac(MUDUR);
    fireEvent.click(await screen.findByRole('button', { name: 'Geçmiş' }));
    expect(await screen.findByText(`/denetim?kayitlar=${encodeURIComponent(JSON.stringify(KAYITLAR))}`)).toBeTruthy();
  });

  it('denetim.oku taşımayan düğmeyi görmez', async () => {
    ac(OPERATOR);
    await screen.findByText('Firma kartı');
    await new Promise((bitti) => { setTimeout(bitti, 50); });
    expect(screen.queryByRole('button', { name: 'Geçmiş' })).toBeNull();
  });

  it('yönlendiricisiz ağaçta çizilmez, hata vermez', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kullanici: MUDUR } satisfies OturumCevabi), { status: 200 })));
    render(<QueryClientProvider client={new QueryClient()}><p>Önizleme</p><GecmisDugmesi kayitlar={KAYITLAR} /></QueryClientProvider>);
    await screen.findByText('Önizleme');
    await new Promise((bitti) => { setTimeout(bitti, 50); });
    expect(screen.queryByRole('button', { name: 'Geçmiş' })).toBeNull();
  });
});
