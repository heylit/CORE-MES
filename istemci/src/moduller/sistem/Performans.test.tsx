import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MetrikDakikasi, MetriklerCevabi, SaatlikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { Performans } from './Performans.tsx';

const ISTEK = { sayi: 120, saniyede: 2, p50Ms: 25, p95Ms: 50, p99Ms: 100, istemciHatasi: 0, sunucuHatasi: 0, mesgul: 0 };
const dakika = (an: string, p95Ms: number): MetrikDakikasi => ({
  an, aralikSn: 60, istek: { ...ISTEK, p95Ms },
  uclar: [{ yontem: 'GET', yol: '/uretim-emirleri', ...ISTEK, p95Ms }],
  havuz: { boyut: 30, kullanimda: 4, bekleyen: 0, mesgul: 0 }, surecIslemciYuzde: 6, makineIslemciYuzde: 20,
  bellek: { rssBayt: 1, yiginBayt: 1, makineBosBayt: 1, makineToplamBayt: 2 }, olayDongusuP99Ms: null, veritabani: null,
});

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });

function sunucuKur() {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/saglik/metrikler') {
      return json({ dakikalar: [dakika('2026-11-01T10:00:00Z', 50), dakika('2026-11-01T10:01:00Z', 1000)] } satisfies MetriklerCevabi);
    }
    if (yol.startsWith('/saglik/metrikler/saatlik')) return json({ saatler: [] } satisfies SaatlikCevabi);
    return new Response('{}', { status: 404 });
  }));
  return yollar;
}

function ac() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Performans /></QueryClientProvider>);
}

describe('Performans', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('1 saat: kutular son dakikayı, grafikler dakikaları, tablo en yavaş ucu gösterir; değerler gizli tabloda da okunur', async () => {
    sunucuKur();
    ac();
    await waitFor(() => expect(screen.getByText('Yanıt süresi p95')).toBeTruthy());
    expect(screen.getByText('Yanıt süresi p95').nextElementSibling?.textContent).toBe('1.000 ms');
    expect(screen.getByText('4 / 30')).toBeTruthy();
    const p95Tablosu = screen.getByRole('table', { name: 'Yanıt süresi p95 (ms)' });
    expect(within(p95Tablosu).getAllByRole('row')).toHaveLength(3);
    const uclar = screen.getByRole('table', { name: 'En yavaş uçlar' });
    expect(within(uclar).getByText('GET /uretim-emirleri')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 saat' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('13 ay seçilince saatlik özet istenir; ölçü yoksa grafik "ölçü yok" der, sıfır çizmez', async () => {
    const yollar = sunucuKur();
    ac();
    await waitFor(() => expect(screen.getByText('Yanıt süresi p95')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '13 ay' }));
    await waitFor(() => expect(yollar).toContain('/saglik/metrikler/saatlik?aralik=yil'));
    await waitFor(() => expect(screen.getAllByText('Bu aralıkta ölçü yok.')).toHaveLength(4));
    expect(screen.getByRole('button', { name: '13 ay' }).getAttribute('aria-pressed')).toBe('true');
  });
});
