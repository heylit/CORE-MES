import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { OzetCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevap: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return yol === '/olcu-aletleri/ozet' ? cevap() : json(404, { kod: 'YOK', mesaj: yol });
  }));
  return yollar;
}

function panoyuAc() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{anaSayfaKartlari.map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const kart = () => screen.getByText('Vadesi geçen kalibrasyon').closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kalibrasyon pano kartı', () => {
  it('vadesi geçen sayısını özet ucundan alır (liste çekilmez) ve ölçü aletleri sayfasına götürür', async () => {
    const yollar = sunucuKur(() => json(200, { vadesiGecen: 3, yaklasan: 1 } satisfies OzetCevabi));
    panoyuAc();
    await screen.findByText('3');
    expect(kart().getAttribute('href')).toBe('/kalibrasyon');
    expect(kart().getAttribute('data-ton')).toBe('uyari');
    expect(yollar).toEqual(['/olcu-aletleri/ozet']);
  });

  it('sıfır vadesi geçen sıfır gösterir, uyarı tonu almaz; uç hata verirse "Alınamadı"', async () => {
    sunucuKur(() => json(200, { vadesiGecen: 0, yaklasan: 0 } satisfies OzetCevabi));
    panoyuAc();
    await screen.findByText('0');
    expect(kart().getAttribute('data-ton')).toBeNull();
    cleanup();
    sunucuKur(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    panoyuAc();
    await screen.findByText('Alınamadı');
  });

  it('kart uçtaki okuma kümesiyle görünür: sayfa ya da sayfasız okuma', () => {
    expect(anaSayfaKartlari).toHaveLength(1);
    expect(anaSayfaKartlari[0]).toMatchObject({ anahtar: 'kalibrasyon-vadesi-gecen', bolum: 'uyari', islem: 'sayfa.kalibrasyon', veya: ['kalibrasyon.oku'] });
  });
});
