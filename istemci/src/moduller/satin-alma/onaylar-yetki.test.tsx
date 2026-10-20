import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AcilisCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OnaylarSayfasi } from './SatinAlma.tsx';

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200, headers: { 'content-type': 'application/json' } });
// Kişi uydurmadır.
const ACILIS: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};

function ac(islemler: string[]) {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = String(adres).replace('/api', '');
    if (yol === '/oturum') return json({ kullanici: { id: 7, ad: 'Deneme Alıcı', islemler } });
    return json(ACILIS);
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/satin-alma/onaylar']}>
          <Routes>
            <Route path="/satin-alma/onaylar" element={<OnaylarSayfasi />} />
            <Route path="/satin-alma" element={<p>Kök sayfa</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('Onaylar sayfası adresle açılınca (kayıt: satın almacı onay sayfasını görüyor)', () => {
  it('onay işlemi olmayan satın almacı köke döner, onay ekranı çizilmez', async () => {
    ac(['satin-alma.oku', 'satin-alma.yaz']);
    await screen.findByText('Kök sayfa');
    expect(document.querySelector('.sa-kok')).toBeNull();
  });

  it('onaylayan onay ekranını görür', async () => {
    ac(['satin-alma.oku', 'satin-alma.onayla']);
    await waitFor(() => expect(document.querySelector('.sa-kok')).not.toBeNull());
    expect(screen.queryByText('Kök sayfa')).toBeNull();
  });
});
