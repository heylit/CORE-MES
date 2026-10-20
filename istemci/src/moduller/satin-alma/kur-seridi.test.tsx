import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { KurFaizOzeti } from '#paylasilan/sozlesme/finans.ts';
import type { AcilisCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IsKutusuSayfasi } from './SatinAlma.tsx';

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200, headers: { 'content-type': 'application/json' } });
// Kişi ve kurlar uydurmadır.
const OZET: KurFaizOzeti = {
  bugun: '2026-10-13',
  kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-13', kur: '41.500000', girenAd: 'Deneme Satinalma', giris: '2026-10-13T06:44:00.000Z' }],
  faizler: [],
  sonGiris: { tur: 'kur', giris: '2026-10-13T06:44:00.000Z', girenAd: 'Deneme Satinalma' },
};
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
    if (yol === '/finans/kur-ozeti') return json(OZET);
    if (yol === '/satin-alma-stok-yok-istekleri') return json({ istekler: [] });
    return json(ACILIS);
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BildirimSaglayici><MemoryRouter initialEntries={['/satin-alma']}><IsKutusuSayfasi /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('Satın alma ana sayfasında kur ve faiz şeridi (kart #953)', () => {
  it('kur yazabilen satın almacı şeridi merkezin üstünde görür', async () => {
    ac(['satin-alma.yaz', 'finans.kur-yaz']);
    const baslik = await screen.findByText('Günlük kur ve faiz');
    const kok = document.querySelector('.sa-kok')!;
    expect(kok).not.toBeNull();
    expect(baslik.compareDocumentPosition(kok) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('finans işlemi olmayan satın almacı şeridi görmez', async () => {
    ac(['satin-alma.yaz']);
    await waitFor(() => expect(document.querySelector('.sa-kok')).not.toBeNull());
    expect(screen.queryByText('Günlük kur ve faiz')).toBeNull();
  });
});
