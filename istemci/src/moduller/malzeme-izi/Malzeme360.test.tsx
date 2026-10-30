import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Malzeme360Cevabi, MalzemeAramaCevabi } from '#paylasilan/sozlesme/malzeme-izi.ts';
import { Malzeme360, MalzemeSec } from './Malzeme360.tsx';

const ARAMA: MalzemeAramaCevabi = {
  satirlar: [{ id: 9, kod: 'HM-000009', ad: 'Deneme çubuk', tur: 'hammadde', birim: 'kg' }], toplam: 1, sayfa: 1, sayfaBoyu: 50,
};
const V360: Malzeme360Cevabi = {
  kart: { id: 9, kod: 'HM-000009', ad: 'Deneme çubuk', tur: 'hammadde', birim: 'kg', onayDurumu: 'aktif' },
  stok: { toplam: '880', kullanilabilir: '820', gruplar: [{ grup: 'kullanilabilir', miktar: '820' }, { grup: 'kalite', miktar: '60' }] },
  gelecek: [{ siparisNo: 'SA-000412', tarih: '2026-11-04', miktar: '700', birim: 'kg' }, { siparisNo: 'SA-000418', tarih: null, miktar: '500', birim: 'kg' }],
  partiler: [
    { partiId: 1, lotNo: 'LT-000001', tedarikciPartiNo: 'TP-1', kayitZamani: '2026-10-28T11:20:00.000Z', acikNcr: true },
    { partiId: 2, lotNo: 'LT-000002', tedarikciPartiNo: null, kayitZamani: '2026-10-20T08:00:00.000Z', acikNcr: false },
  ],
  paraGorunur: true,
  para: {
    ortalamaAlis: { tryBirimFiyat: '41.5', teslimSayisi: 3 },
    sonAlis: { birimFiyat: '1.2', paraBirimi: 'EUR', tryBirimFiyat: '43.2', zaman: '2026-10-28T11:20:00.000Z' },
    kg: null,
  },
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur(v: Malzeme360Cevabi = V360) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istekler.push(yol);
    if (yol.startsWith('/malzeme-izi/malzemeler?')) return json(200, ARAMA);
    if (yol === '/malzeme-izi/malzemeler/9') return json(200, v);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Malzeme kartı bulunamadı.' });
  }));
  return istekler;
}
function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>
          <Route path="/malzeme-izi" element={<MalzemeSec />} />
          <Route path="/malzeme-izi/:id" element={<Malzeme360 />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Malzeme 360 (kart 1296)', () => {
  it('arama metni sunucuya gider; satır 360 bağlantısıdır', async () => {
    const istekler = sunucuKur();
    ac('/malzeme-izi');
    const kod = await screen.findByText('HM-000009');
    expect(kod.closest('a')?.getAttribute('href')).toBe('/malzeme-izi/9');
    fireEvent.change(screen.getByLabelText('Kod ya da ad ara'), { target: { value: 'çubuk' } });
    await vi.waitFor(() => expect(istekler.some((y) => y.includes('metin=%C3%A7ubuk'))).toBe(true));
  });

  it('şerit stok grupları ve siparişte gelen toplamı; tarihsiz sipariş "Tarihsiz"; açık NCR partisi işaretli', async () => {
    sunucuKur();
    ac('/malzeme-izi/9');
    expect(await screen.findByRole('heading', { name: 'Deneme çubuk' })).toBeTruthy();
    const serit = screen.getByRole('list', { name: 'Malzemenin hâli' });
    expect(within(serit).getByText('Kullanılabilir').closest('li')?.textContent).toContain('820 kg');
    expect(within(serit).getByText('Kalite bekleyen / red').closest('li')?.textContent).toContain('60 kg');
    expect(within(serit).getByText('Siparişte (gelecek)').closest('li')?.textContent).toContain('1.200 kg');
    expect(screen.getByText('Tarihsiz')).toBeTruthy();
    expect(within(screen.getByText('LT-000001').closest('tr')!).getByText('Açık NCR')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Stok/ }).getAttribute('href')).toBe('/stok/malzemeler/9');
  });

  it('fiyat yoksa "—", sıfır yazılmaz; finans yetkisi yoksa fiyat bölümü yerine not', async () => {
    sunucuKur();
    ac('/malzeme-izi/9');
    const para = (await screen.findByText('kg fiyatı (referans)')).closest('div')!;
    expect(para.textContent).toContain('—');
    expect(screen.getByText('Ortalama alış').closest('div')!.textContent).toContain('41,50 TL/kg');
    cleanup();
    sunucuKur({ ...V360, paraGorunur: false, para: null, stok: null, gelecek: [] });
    ac('/malzeme-izi/9');
    expect(await screen.findByText('Fiyatlar finans yetkisiyle görünür.')).toBeTruthy();
    expect(screen.getByText('Stokta bakiye ve açık sipariş yok.')).toBeTruthy();
    expect(screen.getByText('Bu kartın stok bakiyesi yok.')).toBeTruthy();
  });

  it('olmayan kart hata kutusu gösterir', async () => {
    sunucuKur();
    ac('/malzeme-izi/77');
    expect(await screen.findByRole('button', { name: /Yeniden|Yenile/ })).toBeTruthy();
  });
});
