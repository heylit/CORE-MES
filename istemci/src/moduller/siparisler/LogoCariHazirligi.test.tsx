import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoCariHazirligi } from './LogoCariHazirligi.tsx';

// 3359 ek: teklif ve satış siparişi başlığında carinin Logo hazırlığı. Cevaplar uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function ciz(durum: string, ozellik: { logoda?: boolean | null; crm?: boolean } = {}) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    istekler.push(adres);
    return new Response(JSON.stringify({ durum, neden: null }), { status: 200 });
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <span data-testid="r"><LogoCariHazirligi firmaId={7} logoda={ozellik.logoda === undefined ? false : ozellik.logoda} crm={ozellik.crm ?? true} /></span>
    </QueryClientProvider>,
  );
  return istekler;
}

describe('Teklifte cari Logo hazırlığı (3359 ek)', () => {
  it('cari kodu yoksa "Logo cari yok", CRM yoksa "CRM yok" uyarısı ve ne yapılacağı ipucunda; CRM varsa "CRM"', async () => {
    const istekler = ciz('cari-yok');
    expect((await screen.findByText('Logo cari yok')).closest('[title]')?.getAttribute('title')).toMatch(/Logo'ya bağla/);
    expect(istekler.some((a) => a.includes('/logo/cari-hazirligi?firma=7'))).toBe(true);
    cleanup();
    ciz('yok');
    expect((await screen.findByText('CRM yok')).closest('[title]')?.getAttribute('title')).toMatch(/CRM satış müşterisi/);
    cleanup();
    ciz('var');
    expect(await screen.findByText('CRM')).toBeTruthy();
  });

  it('okunamadıysa hiçbir şey; satış siparişinde CRM yazılmaz, cari yoksa yazılır; belge Logo\'daysa sorulmaz', async () => {
    const i1 = ciz('okunamadi');
    await waitFor(() => expect(i1).toHaveLength(1));
    expect(screen.getByTestId('r').textContent).toBe('');
    cleanup();
    const i2 = ciz('yok', { crm: false });
    await waitFor(() => expect(i2).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('r').textContent).toBe('');
    cleanup();
    ciz('cari-yok', { crm: false });
    expect(await screen.findByText('Logo cari yok')).toBeTruthy();
    cleanup();
    const i3 = ciz('cari-yok', { logoda: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(i3).toEqual([]);
    expect(screen.getByTestId('r').textContent).toBe('');
  });

  it('belgenin Logo durumu henüz bilinmiyorsa sorulmaz, hiçbir şey yazmaz', async () => {
    const istekler = ciz('cari-yok', { logoda: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(istekler).toEqual([]);
    expect(screen.getByTestId('r').textContent).toBe('');
  });
});
