import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DepoSekmeleri } from './DepoIsleri.tsx';

// 3388 a: depo istasyonunda Mal kabul sekmesi yalnız stok.giris olana; sayı satın alma ve fason satırlarıdır. Değerler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
const satir = (id: number, malzemeTur: string, isEmriId: number | null = null) => ({
  id, siparisNo: `S-${String(id)}`, talepNo: '', tedarikciAdi: 'ORN', malzemeId: id, malzemeTur, kalemAdi: 'ORN', miktar: '1.000', kalanMiktar: '1.000', birim: 'adet', beklenenTeslim: null, isEmriId,
});

function ac(islemler: string[]) {
  const f = vi.fn(async (adres: string) => {
    if (adres.endsWith('/oturum')) return json({ kullanici: { id: 3, ad: 'ORN Depocu', islemler } });
    if (adres.includes('/stok/acik-siparis-satirlari')) return json({ satirlar: [satir(1, 'hammadde'), satir(2, 'hizmet', 9), satir(3, 'hizmet')] });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', f);
  const sec = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DepoSekmeleri secili="toplama" sec={sec} /></QueryClientProvider>);
  return { f, sec };
}

describe('depo terminali sekmeleri (3388 a)', () => {
  it('stok.giris olana Mal kabul sekmesi bekleyen sayısıyla görünür', async () => {
    const { sec } = ac(['stok.giris']);
    const sekme = await screen.findByRole('tab', { name: /Mal kabul · 2/ });
    expect(screen.getByRole('tab', { name: /Toplama listesi/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(sekme);
    expect(sec).toHaveBeenCalledWith('mal-kabul');
  });

  it('stok.giris olmayan depocuda sekme yoktur, Stok\'a istek gitmez', async () => {
    const { f } = ac(['arkon.operator']);
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(f.mock.calls.some(([a]) => String(a).includes('/stok/'))).toBe(false);
  });
});
