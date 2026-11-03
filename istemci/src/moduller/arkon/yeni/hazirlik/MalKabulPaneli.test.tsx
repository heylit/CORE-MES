import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { MalKabulPaneli } from './MalKabulPaneli.tsx';

// 2027: terminalin mal kabul paneli Stok'un uçlarını kullanır; terminal iş kaydına yazmaz.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cevap = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function ac(islemler: string[]) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return cevap(200, { kullanici: { id: 5, ad: 'Deneme Depocu', islemler } });
    if (yol === '/stok/acik-siparis-satirlari') return cevap(200, { satirlar: [] });
    return cevap(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><MalKabulPaneli /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return yollar;
}

describe('terminal mal kabul paneli (2027)', () => {
  it('stok.giris olan depo kullanıcısı Stok\'un bekleyen kabullerini okur', async () => {
    const yollar = ac(['sayfa.uretim-terminali', 'stok.giris']);
    expect(await screen.findByText(/Açık sipariş satırı yok/)).toBeTruthy();
    expect(yollar).toContain('/stok/acik-siparis-satirlari');
  });
  it('stok.giris olmayan kişide Stok\'a istek gitmez', async () => {
    const yollar = ac(['sayfa.uretim-terminali']);
    expect(await screen.findByText('Mal kabul için stok girişi yetkisi gerekir.')).toBeTruthy();
    expect(yollar.filter((y) => y.startsWith('/stok/'))).toEqual([]);
  });
});
