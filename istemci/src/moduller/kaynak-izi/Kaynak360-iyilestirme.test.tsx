import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { KaynakAramaCevabi, Kisi360Cevabi, Makine360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { KaynakSec, Kisi360, Makine360 } from './Kaynak360.tsx';

const ARAMA: KaynakAramaCevabi = { satirlar: [{ tur: 'kisi', id: 7, kod: 'SC-7', ad: 'Deneme Usta', aktif: true, ust: null }], dahaVar: false };
const KIS: Kisi360Cevabi = {
  kaynak: { tur: 'kisi', id: 7, kod: 'SC-7', ad: 'Deneme Usta', aktif: true },
  gorev: 'Tornacı',
  tesis: { atamalar: [{ tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', yuzde: '62.50' }], istasyonYetkinlikleri: [], makineYetkinlikleri: [] },
  vardiya: null, izin: null,
  isler: [
    { isEmriId: 1, emirNo: 'UE-000001', adim: '10 Kaba torna', parca: 'P-1 Deneme parça', saglam: 12, hurda: null },
    { isEmriId: 2, emirNo: 'UE-000001', adim: '20 İnce torna', parca: 'P-1 Deneme parça', saglam: null, hurda: null },
  ],
  maliyet: { saatMaliyeti: '1250.5', paraBirimi: 'TRY' },
  gorunurBolumler: ['tesis', 'isler', 'maliyet'],
};
const MAK: Makine360Cevabi = {
  kaynak: { tur: 'makine', id: 5, kod: 'MK-1', ad: 'Deneme Tezgah', aktif: true }, istasyon: null,
  tesis: { durum: null, atananlar: [], yetkinler: [] }, gorunurBolumler: ['tesis'],
};
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });

function Arac() {
  const git = useNavigate();
  const konum = useLocation();
  return <><button type="button" onClick={() => { void git(-1); }}>Test geri</button><output aria-label="Adres">{konum.pathname + konum.search}</output></>;
}
function ac(adres: string) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn((a: string) => {
    istekler.push(a.replace('/api', ''));
    return Promise.resolve(json(a.includes('/kaynaklar') ? ARAMA : a.includes('/makineler/') ? MAK : KIS));
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[adres]}>
        <Arac />
        <Routes>
          <Route path="/kaynak-izi" element={<KaynakSec />} />
          <Route path="/kaynak-izi/kisi/:id" element={<Kisi360 />} />
          <Route path="/kaynak-izi/makine/:id" element={<Makine360 />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kaynak 360 iyileştirmeleri (KIZ-5)', () => {
  it('arama metni adreste durur; 360\'tan Geri dönünce aynı arama ve liste gelir', async () => {
    const istekler = ac('/kaynak-izi');
    fireEvent.change(screen.getByLabelText('Kod ya da ad ara'), { target: { value: 'usta' } });
    await waitFor(() => { expect(screen.getByLabelText('Adres').textContent).toBe('/kaynak-izi?metin=usta'); });
    fireEvent.click(within(await screen.findByRole('table', { name: 'Kaynaklar' })).getByRole('link', { name: 'Deneme Usta' }));
    expect(await screen.findByRole('heading', { name: 'Deneme Usta' })).toBeTruthy();
    const geriOncesi = istekler.length;
    fireEvent.click(screen.getByRole('button', { name: 'Test geri' }));
    await waitFor(() => { expect((screen.getByLabelText('Kod ya da ad ara') as HTMLInputElement).value).toBe('usta'); });
    expect(await screen.findByRole('link', { name: 'Deneme Usta' })).toBeTruthy();
    expect(istekler.slice(geriOncesi)).not.toContain('/kaynak-izi/kaynaklar?');
  });

  it('kişi başlığında sicil; işlerde adım sütunu; yüzde ve para virgülle', async () => {
    ac('/kaynak-izi/kisi/7');
    expect(await screen.findByText('SC-7')).toBeTruthy();
    const isler = screen.getByRole('table', { name: 'Son işler' });
    expect(within(isler).getByText('10 Kaba torna')).toBeTruthy();
    expect(within(isler).getByText('20 İnce torna')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Atamalar' })).getByText('%62,5')).toBeTruthy();
    expect(screen.getByText('1.250,50 TRY/saat')).toBeTruthy();
  });

  it('makine 360 geliştirici notu göstermez', async () => {
    ac('/kaynak-izi/makine/5');
    expect(await screen.findByRole('heading', { name: 'Deneme Tezgah' })).toBeTruthy();
    expect(screen.queryByText(/Arkon'dan gelecek/)).toBeNull();
  });
});
