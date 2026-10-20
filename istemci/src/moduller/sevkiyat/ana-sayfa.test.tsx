import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { OzetCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import '../../ortak/arayuz/index.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
function panoyuAc(cevap: () => Response) {
  const fetchSahte = vi.fn(async () => cevap());
  vi.stubGlobal('fetch', fetchSahte);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><MemoryRouter>{anaSayfaKartlari.map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter></QueryClientProvider>);
  return fetchSahte;
}
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Sevkiyat pano kartları', () => {
  it('kartlar tek özet isteğiyle dolar ve sevkiyat sayfasına gider', async () => {
    const f = panoyuAc(() => json(200, { bekleyen: 5, gecikmis: 2 } satisfies OzetCevabi));
    await screen.findByText('5');
    expect(kart('Gecikmiş sevkiyat işi').textContent).toContain('2');
    expect(kart('Araca verilmemiş sevkiyat işi').getAttribute('href')).toBe('/sevkiyat');
    expect(kart('Geciken sevkiyat').textContent).toContain('5 iş araca verilmemiş');
    expect(kart('Geciken sevkiyat').getAttribute('href')).toBe('/sevkiyat');
    expect(f.mock.calls.map((c) => String((c as unknown as [string])[0]))).toEqual(['/api/sevkiyat/ozet']);
  });

  it('uç hata verirse "Alınamadı" der', async () => {
    panoyuAc(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    expect((await screen.findAllByText('Alınamadı')).length).toBe(3);
  });

  it('iş kartları sevkiyatı yürüten role, geciken kartı yönetici "Şirket özeti" bölümüne düşer', () => {
    expect(anaSayfaKartlari.map((k) => [k.anahtar, k.islem, k.bolum])).toEqual([
      ['sevkiyat-bekleyen', 'sevkiyat.onayla', 'is'], ['sevkiyat-gecikmis', 'sevkiyat.onayla', 'is'],
      ['sevkiyat-geciken', 'sevkiyat.oku', 'yonetim'],
    ]);
  });
});
