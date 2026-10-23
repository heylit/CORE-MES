import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { YENI_EKRAN_ILETISI, YENI_EKRAN_ISLEMI, YeniEkranKapisi } from './yeni-ekran.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: ['finans.oku', 'finans.yaz', YENI_EKRAN_ISLEMI] };
// Modülün bütün işlemleri olsa da kapı işlemi olmayan kişi yeni ekranı göremez.
const KULLANICI: Kullanici = { id: 2, ad: 'Deneme Kullanici', islemler: ['finans.oku', 'finans.yaz', 'finans.yonet'] };

function ac(kullanici: Kullanici) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kullanici } satisfies OturumCevabi), { status: 200 })));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><YeniEkranKapisi><h1>Yeni Finans</h1></YeniEkranKapisi></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('YeniEkranKapisi', () => {
  it('kapı işlemi yöneticide kalan işlemdir', () => {
    expect(YENI_EKRAN_ISLEMI).toBe('kisiler.rol-yonet');
  });

  it('oturum gelene kadar yükleniyor der, ekranı açmaz', () => {
    ac(YONETICI);
    expect(screen.getByRole('status').textContent).toContain('Yükleniyor');
    expect(screen.queryByRole('heading', { name: 'Yeni Finans' })).toBeNull();
  });

  it('kapı işlemi olan kişide yeni ekranı açar', async () => {
    ac(YONETICI);
    expect(await screen.findByRole('heading', { name: 'Yeni Finans' })).toBeTruthy();
  });

  it('kapı işlemi olmayan kişide ekranı açmaz, hazırlanıyor der', async () => {
    ac(KULLANICI);
    expect(await screen.findByText(YENI_EKRAN_ILETISI)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Yeni Finans' })).toBeNull();
  });
});
