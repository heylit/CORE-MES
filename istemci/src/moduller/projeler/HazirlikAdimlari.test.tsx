import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { TalimatSablonlariCevabi, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { HazirlikAdimlari } from './HazirlikAdimlari.tsx';

type Sablon = TalimatSablonuCevabi['sablon'];
type Adim = Sablon['adimlar'][number];
const adim = (sira: number, baslik: string, asama: Adim['asama'], kontrol: Adim['kontrol'] = { tur: 'yok' }): Adim => ({
  sira, baslik, metin: null, kontrol, zorunlu: false, medya: [], asama, hedefSureDk: null, sahneHareketi: null,
});
const ozet = (id: number, ad: string, ek: Partial<Sablon> = {}): Sablon => ({
  id, kod: `TS-D${String(id)}`, ad, sartname: null, aktif: true, surum: 2, adimSayisi: 0, kontrolSayisi: 0, resimSayisi: 0, videoSayisi: 0,
  operasyonTipi: { id: 3, kod: 'CNC', ad: 'CNC işleme' }, emreGelir: true, adimlar: [], ...ek,
});
const GELEN = ozet(7, 'Deneme CNC hazırlığı', {
  adimlar: [
    adim(1, 'Bağlama aparatını hazırla', 'on_hazirlik'),
    adim(2, 'Takım boylarını ölç', 'hazirlik', { tur: 'olcum', ad: 'Boy', alt: null, ust: null, birim: 'mm' }),
    adim(3, 'Programı onayla', 'hazirlik', { tur: 'onay' }),
    adim(4, 'İlk parçayı işle', 'uretim'),
  ],
});
const GELMEYEN = ozet(2, 'Deneme kopya şablon', { emreGelir: false, adimlar: [adim(1, 'Gelmeyen adım', 'hazirlik')] });
const KAPALI = ozet(4, 'Deneme kapalı şablon', { aktif: false, adimlar: [adim(1, 'Kapalı adım', 'hazirlik')] });
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function Konum() { const k = useLocation(); return <p>{`gidilen ${k.pathname}${k.search}`}</p>; }

function kur(islemler: Kullanici['islemler'], listeDurumu = 200) {
  const kullanici: Kullanici = { id: 6, ad: 'Deneme Şablon', islemler };
  const istenen: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istenen.push(yol);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/rota/talimat-sablonlari') {
      if (listeDurumu !== 200) return json(listeDurumu, { kod: 'YETKI_YOK', mesaj: 'Yetki yok.' });
      return json(200, { sablonlar: [GELEN, GELMEYEN, KAPALI].map(({ adimlar: _a, ...o }) => o) } satisfies TalimatSablonlariCevabi);
    }
    const s = [GELEN, GELMEYEN, KAPALI].find((x) => yol === `/rota/talimat-sablonlari/${String(x.id)}`);
    if (s) return json(200, { sablon: s } satisfies TalimatSablonuCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={istemci}><MemoryRouter initialEntries={['/proje-gorevlerim/sablonlar']}>
      <Routes><Route path="/proje-gorevlerim/sablonlar" element={<HazirlikAdimlari />} /><Route path="*" element={<Konum />} /></Routes>
    </MemoryRouter></QueryClientProvider>,
  );
  return { istenen, container };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3494-2 a: operasyon başına işaretlenecekler talimat şablonundan, tek ekranda', () => {
  it('yalnız emre gelen açık şablonun yalnız hazırlık adımlarını gösterir; düğme şablonu seçili açar', async () => {
    const { istenen } = kur(['sayfa.recete-rota']);
    const tablo = await screen.findByRole('table', { name: 'Operasyon başına işaretlenecekler' });
    await within(tablo).findByText('Bağlama aparatını hazırla');
    expect(within(tablo).getByText('Takım boylarını ölç')).toBeTruthy();
    expect(within(tablo).getByText('Programı onayla')).toBeTruthy();
    expect(within(tablo).getAllByText('Kontrollü').length).toBe(1);
    expect(within(tablo).queryByText('İlk parçayı işle')).toBeNull();
    expect(within(tablo).queryByText(/Deneme kopya şablon|Deneme kapalı şablon/)).toBeNull();
    expect(istenen.filter((y) => y.startsWith('/rota/talimat-sablonlari/'))).toEqual(['/rota/talimat-sablonlari/7']);
    fireEvent.click(within(tablo).getByRole('button', { name: 'Deneme CNC hazırlığı: talimatta düzenle' }));
    expect(await screen.findByText('gidilen /recete-rota/sartnameler?sablon=7')).toBeTruthy();
  });

  it('reçete-rota sayfası yoksa düzenle düğmesi yoktur', async () => {
    kur([]);
    const tablo = await screen.findByRole('table', { name: 'Operasyon başına işaretlenecekler' });
    await within(tablo).findByText('Deneme CNC hazırlığı');
    expect(within(tablo).queryByRole('button', { name: /talimatta düzenle/ })).toBeNull();
  });

  it('rota okuyamayan kartı görmez', async () => {
    const { istenen, container } = kur(['sayfa.recete-rota'], 403);
    await waitFor(() => { expect(istenen).toContain('/rota/talimat-sablonlari'); });
    await waitFor(() => { expect(container.textContent).toBe(''); });
  });
});
