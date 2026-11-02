import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { Istasyon360Cevabi, KaynakAramaCevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { Istasyon360, KaynakSec } from './Kaynak360.tsx';

const ARAMA: KaynakAramaCevabi = { satirlar: [{ tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', aktif: true, ust: 'IM-1' }], dahaVar: false };
const IST: Istasyon360Cevabi = {
  kaynak: { tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', aktif: true }, isMerkezi: null, tesis: null, oee: null, maliyet: null, gorunurBolumler: [],
};
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });

function Geri() {
  const git = useNavigate();
  return <button type="button" onClick={() => { void git(-1); }}>Test geri</button>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kaynak 360 arama gezinmesi (KIZ-1)', () => {
  it('addaki bağlantı tek geçmiş kaydı ekler; bir kez "Geri" aramaya döner', async () => {
    vi.stubGlobal('fetch', vi.fn((adres: string) => Promise.resolve(json(adres.includes('/kaynak-izi/kaynaklar') ? ARAMA : IST))));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/kaynak-izi']}>
          <Geri />
          <Routes>
            <Route path="/kaynak-izi" element={<KaynakSec />} />
            <Route path="/kaynak-izi/istasyon/:id" element={<Istasyon360 />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(within(await screen.findByRole('table', { name: 'Kaynaklar' })).getByRole('link', { name: 'Deneme Torna' }));
    expect(await screen.findByRole('heading', { name: 'Deneme Torna' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Test geri' }));
    expect(await screen.findByRole('table', { name: 'Kaynaklar' })).toBeTruthy();
  });
});
