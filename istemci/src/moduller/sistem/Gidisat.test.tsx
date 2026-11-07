import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MetrikDakikasi, MetriklerCevabi, SaatlikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { Gidisat } from './Gidisat.tsx';

const MB = 1024 * 1024;
const ISTEK = { sayi: 120, saniyede: 2, p50Ms: 25, p95Ms: 50, p99Ms: 100, istemciHatasi: 0, sunucuHatasi: 0, mesgul: 0 };
const dakika = (an: string, p95Ms: number, y: Partial<MetrikDakikasi> = {}): MetrikDakikasi => ({
  an, aralikSn: 60, istek: { ...ISTEK, p95Ms },
  uclar: [{ yontem: 'GET', yol: '/uretim-emirleri', ...ISTEK, p95Ms }],
  havuz: { boyut: 30, kullanimda: 4, bekleyen: 0, mesgul: 0 }, surecIslemciYuzde: 6, makineIslemciYuzde: 20,
  bellek: { rssBayt: 200 * MB, yiginBayt: 100 * MB, makineBosBayt: 4096 * MB, makineToplamBayt: 8192 * MB }, olayDongusuP99Ms: null, veritabani: null, ...y,
});

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });

function sunucuKur() {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/saglik/metrikler') {
      return json({ dakikalar: [dakika('2026-11-01T10:00:00Z', 50), dakika('2026-11-01T10:01:00Z', 1200, { olayDongusuP99Ms: 640, anaIsParcacigiYuzde: 88 })] } satisfies MetriklerCevabi);
    }
    if (yol.startsWith('/saglik/metrikler/saatlik')) return json({ saatler: [] } satisfies SaatlikCevabi);
    return new Response('{}', { status: 404 });
  }));
  return yollar;
}

function ac(ek?: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Gidisat ek={ek} /></QueryClientProvider>);
}

const grafik = (ad: string) => screen.getByRole('table', { name: ad }).closest('figure') as HTMLElement;

describe('Gidişat (2231)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('yedi grafik sade adlarıyla çizilir; her birinin altında veriden çıkan yorum vardır', async () => {
    sunucuKur();
    ac(<p>ek grafik</p>);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Sunucunun yanıt süresi' })).toBeTruthy());
    expect(['Sunucunun yanıt süresi', 'Kullanım yoğunluğu', 'Sunucunun yükü', 'Bellek', 'Sunucunun meşguliyeti', 'Takılma süresi', 'Veritabanı hatları']
      .map((ad) => grafik(ad).querySelector('.tc-sistem-yorum')?.getAttribute('data-ton')))
      .toEqual(['uyari', 'tamam', 'tamam', 'tamam', 'uyari', 'uyari', 'tamam']);
    expect(within(grafik('Sunucunun yanıt süresi')).getByText('1 ölçüde sınır aşıldı.')).toBeTruthy();
    expect(within(grafik('Takılma süresi')).getByText('Sunucu tıkandı.')).toBeTruthy();
    expect(within(grafik('Veritabanı hatları')).getByText('4 / 30')).toBeTruthy();
    expect(within(grafik('Sunucunun yanıt süresi')).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('ek grafik')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'En yavaş işlemler' })).getByText('GET /uretim-emirleri')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 saat' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('13 ay seçilince saatlik özet istenir; ölçü yoksa grafik "ölçü yok" der, sıfır çizmez', async () => {
    const yollar = sunucuKur();
    ac();
    await waitFor(() => expect(screen.getByRole('table', { name: 'Sunucunun yanıt süresi' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '13 ay' }));
    await waitFor(() => expect(yollar).toContain('/saglik/metrikler/saatlik?aralik=yil'));
    await waitFor(() => expect(screen.getAllByText('Bu aralıkta ölçü yok.')).toHaveLength(7));
    expect(screen.getByRole('button', { name: '13 ay' }).getAttribute('aria-pressed')).toBe('true');
  });
});
