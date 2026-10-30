import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Istasyon360Cevabi, KaynakAramaCevabi, Kisi360Cevabi, Makine360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { Istasyon360, KaynakSec, Kisi360, Makine360 } from './Kaynak360.tsx';

const ARAMA: KaynakAramaCevabi = {
  satirlar: [
    { tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', aktif: true, ust: 'IM-1' },
    { tur: 'kisi', id: 7, kod: null, ad: 'Deneme Usta', aktif: true, ust: null },
  ],
  dahaVar: false,
};
const IST: Istasyon360Cevabi = {
  kaynak: { tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', aktif: true },
  isMerkezi: { id: 1, kod: 'IM-1', ad: 'Deneme Merkezi', aktif: true },
  tesis: {
    makineler: [{ tur: 'makine', id: 5, kod: 'MK-1', ad: 'Deneme Tezgah', aktif: true, durum: { durum: 'ariza', aciklama: 'Mil', degisme: '2026-10-30T08:00:00Z' } }],
    atananlar: [{ kisiId: 7, ad: 'Deneme Usta', yuzde: '60.00' }],
    yetkinler: [],
  },
  oee: { baslangic: '2026-10-24', bitis: '2026-10-30', oee: 0.625, kullanilabilirlik: null, performans: null, kalite: null },
  maliyet: null,
  gorunurBolumler: ['tesis', 'oee', 'maliyet'],
};
const MAK: Makine360Cevabi = {
  kaynak: { tur: 'makine', id: 5, kod: 'MK-1', ad: 'Deneme Tezgah', aktif: false },
  istasyon: { tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', aktif: true },
  tesis: null,
  gorunurBolumler: [],
};
const KIS: Kisi360Cevabi = {
  kaynak: { tur: 'kisi', id: 7, kod: null, ad: 'Deneme Usta', aktif: true },
  gorev: 'Tornacı',
  tesis: { atamalar: [{ tur: 'istasyon', id: 3, kod: 'IS-1', ad: 'Deneme Torna', yuzde: '60.00' }], istasyonYetkinlikleri: [], makineYetkinlikleri: [] },
  vardiya: null,
  izin: { bugunIzinli: true },
  isler: [{ isEmriId: 1, emirNo: 'UE-000001', parca: 'P-1 Deneme parça', saglam: 12, hurda: null }],
  maliyet: null,
  gorunurBolumler: ['tesis', 'izin', 'isler'],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur() {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    istekler.push(yol);
    if (yol.startsWith('/kaynak-izi/kaynaklar')) return Promise.resolve(json(200, ARAMA));
    if (yol === '/kaynak-izi/istasyonlar/3') return Promise.resolve(json(200, IST));
    if (yol === '/kaynak-izi/makineler/5') return Promise.resolve(json(200, MAK));
    if (yol === '/kaynak-izi/kisiler/7') return Promise.resolve(json(200, KIS));
    return Promise.resolve(json(404, { kod: 'BULUNAMADI', mesaj: 'Kaynak bulunamadı.' }));
  }));
  return istekler;
}
function ac(adres: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>
          <Route path="/kaynak-izi" element={<KaynakSec />} />
          <Route path="/kaynak-izi/istasyon/:id" element={<Istasyon360 />} />
          <Route path="/kaynak-izi/makine/:id" element={<Makine360 />} />
          <Route path="/kaynak-izi/kisi/:id" element={<Kisi360 />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kaynak 360 (kart 1325)', () => {
  it('arama türü ve üst kaydı gösterir; yazınca yeniden arar; satır 360\'ı açar', async () => {
    const istekler = sunucuKur();
    ac('/kaynak-izi');
    const tablo = await screen.findByRole('table', { name: 'Kaynaklar' });
    expect(within(tablo).getByText('IM-1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kod ya da ad ara'), { target: { value: 'usta' } });
    await waitFor(() => { expect(istekler).toContain('/kaynak-izi/kaynaklar?metin=usta'); });
    expect(within(tablo).getByRole('link', { name: 'Deneme Torna' }).getAttribute('href')).toBe('/kaynak-izi/istasyon/3');
    expect(within(tablo).getByRole('link', { name: 'Deneme Usta' }).getAttribute('href')).toBe('/kaynak-izi/kisi/7');
  });

  it('istasyon: makine durumu, atanan kişi ve OEE; veri yoksa çizgi, girilmemiş maliyet söylenir', async () => {
    sunucuKur();
    ac('/kaynak-izi/istasyon/3');
    expect(await screen.findByText('Arızalı')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Deneme Usta' }).getAttribute('href')).toBe('/kaynak-izi/kisi/7');
    expect(screen.getByText('%62.5')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBe(3);
    expect(screen.getByText('Yetkinliği girilmiş kişi yok.')).toBeTruthy();
    expect(screen.getByText('Girilmemiş')).toBeTruthy();
  });

  it('1322 a: yetkisiz bölüm gizlidir; pasif kaynak işaretlenir', async () => {
    sunucuKur();
    ac('/kaynak-izi/makine/5');
    expect(await screen.findByRole('heading', { name: 'Deneme Tezgah' })).toBeTruthy();
    expect(screen.getByText('Pasif')).toBeTruthy();
    expect(screen.getAllByText('Bu bölüm yetkinizle görünmüyor.').length).toBe(2);
  });

  it('kişi: atama, bugün izinli, son işler; vardiya ve maliyet yetkisi yoksa gizli; olmayan kaynak 404 iletisi', async () => {
    sunucuKur();
    ac('/kaynak-izi/kisi/7');
    expect(await screen.findByText('Bugün izinli')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Atamalar' })).getByText('%60')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Son işler' })).getByText('UE-000001')).toBeTruthy();
    expect(screen.getAllByText('Bu bölüm yetkinizle görünmüyor.').length).toBe(2);
    cleanup();
    ac('/kaynak-izi/kisi/abc');
    expect(screen.getByText('Kaynak bulunamadı.')).toBeTruthy();
  });
});
