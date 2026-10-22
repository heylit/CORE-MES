import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SiparisOzetiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevap: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return yol === '/siparisler/ozet' ? cevap() : json(404, { kod: 'YOK', mesaj: yol });
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
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;
const OZET: SiparisOzetiCevabi = {
  acikTeklif: 4, yaklasanTermin: 2, gecikenSiparis: 1,
  aylik: [{ ay: '2026-09', sayi: 3 }, { ay: '2026-10', sayi: 0 }],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Siparişler pano kartları', () => {
  it('dört kart özet ucunu bir kez okur; teklif, termin, gecikme sayılır ve aylık seri çizilir', async () => {
    const yollar = sunucuKur(() => json(200, OZET));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Açık teklif').textContent).toContain('4'));
    expect(kart('Termini yaklaşan sipariş').textContent).toContain('2');
    expect(kart('Termini geçmiş sipariş').getAttribute('data-ton')).toBe('uyari');
    expect(kart('Açık teklif').getAttribute('href')).toBe('/siparisler/teklifler');
    const tablo = await screen.findByRole('table', { name: 'Aylık sipariş' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['09.263 sipariş', '10.260 sipariş']);
    expect(yollar).toEqual(['/siparisler/ozet']);
  });

  it('uç reddederse dört kart da "Alınamadı" gösterir', async () => {
    sunucuKur(() => json(403, { kod: 'YETKI', mesaj: 'x' }));
    panoyuAc();
    await vi.waitFor(() => expect(screen.getAllByText('Alınamadı')).toHaveLength(4));
  });

  it('teklif ve eğilim siparişi yazana, termin ve gecikme okuyana görünür; işlemi olmayan görmez', () => {
    const gorunen = (islemler: string[]) => gorunenKartlar(anaSayfaKartlari, islemler).map((k) => k.anahtar);
    expect(gorunen(['siparisler.oku'])).toEqual(['siparisler-geciken', 'siparisler-yaklasan-termin']);
    expect(gorunen(['siparisler.oku', 'siparisler.yaz'])).toHaveLength(4);
    expect(gorunen(['sayfa.siparisler'])).toEqual([]);
  });
});
