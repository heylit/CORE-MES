import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import type { LogoGidenIzlemeCevabi, LogoHazirlikCevabi } from '#paylasilan/sozlesme/logo.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { LogoOzeti } from './LogoOzeti.tsx';

// 3737 a: değerler uydurma deneme değerleridir.
const T = '2099-11-26T08:00:00.000Z';
const yonetim: EntegrasyonYonetimiCevabi = {
  baglanti: { anaAyar: 'logo.baglanti', acik: true, tanimli: true, karsiUc: 'Logo yardımcısı', sonTest: null },
  akislar: [], gunluk: [], bugunHata: 2,
};
const hazirlik: LogoHazirlikCevabi = {
  baglanti: 'acik', ortam: { adres: null, anahtarTanimli: true }, ayarlar: [], sonBirimSetiOkuma: null, akislar: [],
  yardimci: { durum: 'ayni', ileti: '', calisanOzet: null, derlemeZamani: null, pakettekiOzet: null, sonBakis: T },
};
const giden: LogoGidenIzlemeCevabi = { sayac: { durdu: 1, yenidenDenenecek: 0, kartBekliyor: 0, projeBekliyor: 0, sirada: 0 }, belgeler: [], kesildi: false };

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });
function sunucuKur() {
  const yollar: string[] = [];
  const yanit: Record<string, unknown> = { '/logo/yonetim': yonetim, '/logo/hazirlik': hazirlik, '/logo/giden': giden };
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return json(yanit[yol]);
  }));
  return yollar;
}
function cizdir(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  return render(<QueryClientProvider client={istemci}><MemoryRouter><LogoOzeti /></MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo özet şeridi (3737)', () => {
  it('ayrıntıyı gören: bağlantı hazırlığa, gitmeyen kutusu Gitmeyen belgelere gider', async () => {
    sunucuKur();
    cizdir(['sayfa.logo', 'saglik.ayrinti-oku']);
    expect(await screen.findByText('Açık')).toBeTruthy();
    expect(await screen.findByText('Güncel')).toBeTruthy();
    expect(await screen.findByText('1 durdu · 0 yeniden denenecek')).toBeTruthy();
    const hedefler = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hedefler).toEqual(['/logo/hazirlik', '/logo/hazirlik', '/logo/gitmeyen']);
  });

  it('ayrıntı yetkisi olmayan: yalnız bağlantı ve bugün; hazırlık ve giden uçları çağrılmaz', async () => {
    const yollar = sunucuKur();
    cizdir(['sayfa.logo']);
    expect(await screen.findByText('Açık')).toBeTruthy();
    expect(screen.queryByText('Gitmeyen belgeler')).toBeNull();
    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(yollar).toEqual(['/logo/yonetim']);
  });
});
