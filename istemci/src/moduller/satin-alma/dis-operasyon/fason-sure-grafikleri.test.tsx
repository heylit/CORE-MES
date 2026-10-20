import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FasonSureleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { FasonSureGrafikleri } from './FasonSureGrafikleri.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });

// Firma, malzeme ve operasyon adları uydurmadır.
const DOLU = {
  sureler: [
    { malzemeNo: 1, malzemeAdi: 'Deneme mil', operasyonTipiId: 2, operasyonAdi: 'Kaplama', firmaId: 3, firmaAdi: 'Deneme Kaplama', adet: 30, ornekSayisi: 1, ortalamaSureGun: 8 },
    { malzemeNo: 4, malzemeAdi: 'Deneme flanş', operasyonTipiId: 2, operasyonAdi: 'Kaplama', firmaId: 5, firmaAdi: 'Deneme Isıl', adet: 10, ornekSayisi: 2, ortalamaSureGun: 5.5 },
  ],
  terminUyumu: [
    { firmaId: 3, firmaAdi: 'Deneme Kaplama', ornekSayisi: 2, gecKalanSayisi: 1, ortalamaFarkGun: 2.5 },
    { firmaId: 5, firmaAdi: 'Deneme Isıl', ornekSayisi: 1, gecKalanSayisi: 0, ortalamaFarkGun: -1 },
  ],
} satisfies FasonSureleriCevabi;

function ac(cevap: () => Response): string[] {
  const adresler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => { adresler.push(adres); return cevap(); }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><FasonSureGrafikleri /></MemoryRouter>
    </QueryClientProvider>,
  );
  return adresler;
}
const kart = (baslik: string): HTMLElement => screen.getAllByText(baslik)[0]!.closest('.tc-grafik-karti') as HTMLElement;
const satirlar = (baslik: string): string[] => [...kart(baslik).querySelectorAll('table tr')].map((r) => r.textContent ?? '');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Fason süre ve termin grafikleri', () => {
  it('veri yoksa iki kart da "Veri yok" der; süzgeç seçicisi çıkmaz', async () => {
    const adresler = ac(() => json(200, { sureler: [], terminUyumu: [] } satisfies FasonSureleriCevabi));
    expect(await screen.findAllByText('Veri yok')).toHaveLength(2);
    expect(adresler[0]).toContain('/satin-alma-fason-sureleri?sonGun=365');
    expect(screen.queryByLabelText('Firma')).toBeNull();
    expect(document.querySelector('.tc-grafik-karti table')).toBeNull();
  });

  it('uç hata verirse iki kart da "Alınamadı" der', async () => {
    ac(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    expect(await screen.findAllByText('Alınamadı')).toHaveLength(2);
  });

  it('süre kartı malzeme, operasyon, firma ve adet kırılımını; termin kartı firma başına farkı gün olarak yazar, gecikme hata tonunda', async () => {
    ac(() => json(200, DOLU));
    await screen.findAllByText('Fason termin uyumu');
    await waitFor(() => expect(satirlar('Gerçekleşen fason süresi')).toHaveLength(2));
    expect(satirlar('Gerçekleşen fason süresi')).toEqual([
      'Deneme mil · Kaplama · Deneme Kaplama · 30 adet8 gün', 'Deneme flanş · Kaplama · Deneme Isıl · 10 adet5,5 gün',
    ]);
    expect(satirlar('Fason termin uyumu')).toEqual(['Deneme Kaplama (2 iş)2,5 gün', 'Deneme Isıl (1 iş)-1 gün']);
    expect([...kart('Fason termin uyumu').querySelectorAll('.tc-cubuk-satir')].map((s) => s.getAttribute('data-ton'))).toEqual(['hata', null]);
  });

  it('firma süzgeci iki kartı, malzeme süzgeci yalnız süre kartını daraltır; hepsi elenirse "Veri yok"', async () => {
    ac(() => json(200, DOLU));
    const firma = await screen.findByLabelText('Firma');
    fireEvent.change(firma, { target: { value: '5' } });
    expect(satirlar('Gerçekleşen fason süresi')).toEqual(['Deneme flanş · Kaplama · Deneme Isıl · 10 adet5,5 gün']);
    expect(satirlar('Fason termin uyumu')).toEqual(['Deneme Isıl (1 iş)-1 gün']);
    fireEvent.change(firma, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Malzeme'), { target: { value: '1' } });
    expect(satirlar('Gerçekleşen fason süresi')).toEqual(['Deneme mil · Kaplama · Deneme Kaplama · 30 adet8 gün']);
    expect(satirlar('Fason termin uyumu')).toHaveLength(2);
    fireEvent.change(firma, { target: { value: '5' } });
    expect(within(kart('Gerçekleşen fason süresi')).getByText('Veri yok')).toBeTruthy();
  });
});
