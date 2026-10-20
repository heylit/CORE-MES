import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MalzemelerOzetiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';
import { SORUMLU, json, sunucuKur } from './test-ortak.tsx';

function panoyuAc() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{anaSayfaKartlari.map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const kart = () => screen.getByText('Onay bekleyen malzeme').closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Malzemeler pano kartı', () => {
  it('onay bekleyen sayısı özet ucundan gelir; kart kataloğa gider', async () => {
    sunucuKur(SORUMLU, { 'GET /malzemeler/ozet': () => json(200, { onayBekleyen: 4 } satisfies MalzemelerOzetiCevabi) });
    panoyuAc();
    await screen.findByText('4');
    expect(kart().getAttribute('href')).toBe('/malzemeler');
  });

  it('yetkisiz cevapta "Veri yok" der, sıfır uydurmaz; uç hata verirse "Alınamadı"', async () => {
    sunucuKur(SORUMLU, { 'GET /malzemeler/ozet': () => json(200, { onayBekleyen: null } satisfies MalzemelerOzetiCevabi) });
    panoyuAc();
    await screen.findByText('Veri yok');
    cleanup();
    sunucuKur(SORUMLU, { 'GET /malzemeler/ozet': () => json(500, { kod: 'SUNUCU', mesaj: 'x' }) });
    panoyuAc();
    await screen.findByText('Alınamadı');
  });

  it('kart "Bana düşen işler" bölümünde, onaylama işlemiyle görünür', () => {
    expect(anaSayfaKartlari.map((k) => [k.anahtar, k.bolum, k.islem])).toEqual([['malzemeler-onay-bekleyen', 'is', 'malzemeler.onayla']]);
  });
});
