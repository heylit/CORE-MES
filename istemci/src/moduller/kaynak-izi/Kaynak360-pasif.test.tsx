import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { KaynakAramaCevabi, Makine360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { KaynakSec, Makine360 } from './Kaynak360.tsx';

const ARAMA: KaynakAramaCevabi = { satirlar: [{ tur: 'kisi', id: 8, kod: null, ad: 'Eski Usta', aktif: false, ust: null }], dahaVar: false };
const MAK: Makine360Cevabi = {
  kaynak: { tur: 'makine', id: 5, kod: 'MK-1', ad: 'Deneme Tezgah', aktif: true }, istasyon: null,
  tesis: {
    durum: null,
    atananlar: [{ kisiId: 8, ad: 'Eski Usta', aktif: false, yuzde: '100.00' }],
    yetkinler: [{ kisiId: 9, ad: 'Etkin Usta', aktif: true }],
  },
  gorunurBolumler: ['tesis'],
};
function ac(adres: string) {
  vi.stubGlobal('fetch', vi.fn((a: string) => Promise.resolve(new Response(JSON.stringify(a.includes('/kaynaklar') ? ARAMA : MAK), { status: 200 }))));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>
          <Route path="/kaynak-izi" element={<KaynakSec />} />
          <Route path="/kaynak-izi/makine/:id" element={<Makine360 />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kaynak 360 pasif kişi (KIZ-3 a)', () => {
  it('çipte pasif kişi işaretlenir, etkin kişi işaretlenmez', async () => {
    ac('/kaynak-izi/makine/5');
    const bakanlar = await screen.findByRole('list', { name: 'Bakan kişiler' });
    expect(within(bakanlar).getByText('Pasif')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Yetkin kişiler' })).queryByText('Pasif')).toBeNull();
  });

  it('aramada pasif kişi "Pasif" rozetiyle listelenir', async () => {
    ac('/kaynak-izi');
    const tablo = await screen.findByRole('table', { name: 'Kaynaklar' });
    expect(await within(tablo).findByText('Eski Usta')).toBeTruthy();
    expect(within(tablo).getByText('Pasif')).toBeTruthy();
  });
});
