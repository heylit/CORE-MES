import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Istasyon360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { Istasyon360 } from './Kaynak360.tsx';

type Oee = NonNullable<Istasyon360Cevabi['oee']>;
const OEE: Oee = { baslangic: '2026-10-24', bitis: '2026-10-30', oee: 0, kullanilabilirlik: 0, performans: null, kalite: null, veriEksik: false, vardiyaDisi: null };
function ac(oee: Oee) {
  const cevap: Istasyon360Cevabi = {
    kaynak: { tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', aktif: true }, isMerkezi: null, tesis: null, oee, maliyet: null, gorunurBolumler: ['oee'],
  };
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(cevap), { status: 200 }))));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/kaynak-izi/istasyon/3']}>
        <Routes><Route path="/kaynak-izi/istasyon/:id" element={<Istasyon360 />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kaynak 360 OEE kartı (KIZ-4)', () => {
  it('vardiya dışı üretim yazılır ve OEE\'ye girmediği söylenir', async () => {
    ac({ ...OEE, vardiyaDisi: { calismaDk: 90, saglam: 1200 } });
    expect(await screen.findByText(/Vardiya dışı: 1\.200 sağlam, 1,5 sa çalışma; OEE'ye girmez\./)).toBeTruthy();
  });

  it('veri eksikse OEE ve performans yerine rozet; vardiya dışı üretim yoksa not çıkmaz', async () => {
    ac({ ...OEE, oee: null, veriEksik: true, vardiyaDisi: { calismaDk: 0, saglam: 0 } });
    expect((await screen.findAllByText('Veri eksik')).length).toBe(2);
    expect(screen.queryByText(/Vardiya dışı/)).toBeNull();
  });
});
