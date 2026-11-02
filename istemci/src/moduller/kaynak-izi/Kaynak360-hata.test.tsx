import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KaynakSec, Kisi360 } from './Kaynak360.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function ac(adres: string, durum: number, govde: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(durum, govde))));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>
          <Route path="/kaynak-izi" element={<KaynakSec />} />
          <Route path="/kaynak-izi/kisi/:id" element={<Kisi360 />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kaynak 360 hata gösterimi (KIZ-2)', () => {
  it('olmayan kaynak "bulunamadı" der, yeniden denetmez', async () => {
    ac('/kaynak-izi/kisi/999', 404, { kod: 'BULUNAMADI', mesaj: 'Kaynak bulunamadı.' });
    expect(await screen.findByText('Kaynak bulunamadı.')).toBeTruthy();
    expect(screen.queryByText('Veri alınamadı')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
  });

  it('arama kutusu sözleşmedeki 60 harfte durur; arama hatasında sunucu iletisi gösterilir', async () => {
    ac('/kaynak-izi', 400, { kod: 'DOGRULAMA', mesaj: 'En çok 60 karakter olabilir.', alan: 'metin' });
    expect(await screen.findByText('En çok 60 karakter olabilir.')).toBeTruthy();
    expect(screen.getByLabelText('Kod ya da ad ara').getAttribute('maxlength')).toBe('60');
  });
});
