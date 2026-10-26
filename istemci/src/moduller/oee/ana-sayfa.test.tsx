import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { OeeCevabi, OeeOlcusu } from '#paylasilan/sozlesme/oee.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const olcu = (o: Partial<OeeOlcusu> = {}): OeeOlcusu => ({
  planliDk: 480, takvimDk: 2880, calismaDk: 420, standartDk: 384, saglam: 98, hurda: 2, red: 0, suresizSaglam: 0,
  vardiyaDisi: { calismaDk: 0, standartDk: 0, saglam: 0, hurda: 0, red: 0 },
  kullanilabilirlik: 0.875, veriEksik: false, performans: 0.9, kalite: 0.98, oee: 0.8, teep: 0.13, kisiPayi: 1,
  makineMaliyeti: null, iscilikMaliyeti: null, birimMaliyet: null, ...o,
});
const cevap = (tesis: Partial<OeeOlcusu>): OeeCevabi => ({
  pencere: { baslangic: '2099-10-04T21:00:00.000Z', bitis: '2099-10-06T21:00:00.000Z' },
  maliyetGorunur: false,
  tesis: olcu(tesis),
  isMerkezleri: [
    { id: 1, kod: 'IM-A', ad: 'Deneme merkez A', ...olcu({ oee: 0.82 }) },
    { id: 2, kod: 'IM-B', ad: 'Deneme merkez B', ...olcu({ oee: 0.45 }) },
    { id: 3, kod: 'IM-C', ad: 'Deneme merkez C', ...olcu({ oee: null }) },
  ],
  istasyonlar: [],
  makineler: [],
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return yol.startsWith('/oee?') ? yanit() : json(404, { kod: 'YOK', mesaj: yol });
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
const tesis = () => screen.getByText('Tesis OEE, son 7 gün').closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('OEE pano kartları', () => {
  it('iki kart son 7 günü tek istekle okur; tesis OEE ve bileşenleri, iş merkezleri çubukla, hesaplanamayan çizilmez', async () => {
    const yollar = sunucuKur(() => json(200, cevap({})));
    panoyuAc();
    await vi.waitFor(() => expect(tesis().textContent).toContain('%80'));
    expect(tesis().textContent).toContain('Kullanım %87,5 · Performans %90 · Kalite %98');
    expect(tesis().getAttribute('href')).toBe('/oee');
    const tablo = await screen.findByRole('table', { name: 'İş merkezi OEE, son 7 gün' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['Deneme merkez A%82', 'Deneme merkez B%45']);
    expect(document.querySelector('.tc-cubuk-satir[data-ton="uyari"]')?.textContent).toContain('Deneme merkez B');
    expect(yollar).toHaveLength(1);
    expect(yollar[0]).toMatch(/^\/oee\?baslangic=\d{4}-\d{2}-\d{2}&bitis=\d{4}-\d{2}-\d{2}$/);
  });

  it('hesaplanamayan tesis OEE "Veri yok"tur, sıfır uydurulmaz; uç reddederse "Alınamadı"', async () => {
    sunucuKur(() => json(200, cevap({ oee: null, performans: null })));
    panoyuAc();
    await vi.waitFor(() => expect(tesis().textContent).toContain('Veri yok'));
    expect(tesis().textContent).toContain('Vardiya takvimine göre');
    cleanup();
    sunucuKur(() => json(403, { kod: 'YETKI', mesaj: 'x' }));
    panoyuAc();
    await vi.waitFor(() => expect(tesis().textContent).toContain('Alınamadı'));
  });

  it('kartlar OEE ucunun yetkisiyle görünür; sayfa işlemi tek başına yetmez', () => {
    const gorunen = (islemler: string[]) => gorunenKartlar(anaSayfaKartlari, islemler).map((k) => k.anahtar);
    expect(gorunen(['oee.oku'])).toEqual(['oee-tesis', 'oee-is-merkezi']);
    expect(gorunen(['sayfa.oee'])).toEqual([]);
  });
});
