import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EksikBilgiOzetiCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const OZET: EksikBilgiOzetiCevabi = { eksik: 3, sicilsiz: 2, gorevsiz: 2 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function kur(cevap: Response): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    yollar.push(adres.replace('/api', ''));
    return Promise.resolve(cevap.clone());
  }));
  const Hepsi = () => <>{anaSayfaKartlari.map(({ anahtar, ekran: Ekran }) => <Ekran key={anahtar} />)}</>;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Hepsi /></MemoryRouter>
    </QueryClientProvider>,
  );
  return yollar;
}

const kart = () => screen.getByText('Eksik bilgili personel').closest('.tc-sayi-karti');

describe('kişiler ana sayfa kartı (#608)', () => {
  it('kart sayıyı sunucunun özetinden gösterir (kişi listesi çekilmez), Personel sayfasına gider; özet alınamazsa sıfır uydurmaz', async () => {
    const yollar = kur(new Response(JSON.stringify(OZET)));
    await waitFor(() => expect(kart()?.textContent).toContain('2 sicil no, 2 görev boş'));
    expect(kart()?.textContent).toContain('3');
    expect(kart()?.getAttribute('href')).toBe('/personel');
    expect(yollar).toEqual(['/kisiler/eksik-bilgi-ozeti']);
    cleanup();
    kur(new Response('{}', { status: 500 }));
    await waitFor(() => expect(kart()?.textContent).toContain('Alınamadı'));
  });

  it('bana düşen iştir; yalnız kişi yazabilen görür', () => {
    expect(anaSayfaKartlari.map((k) => k.bolum)).toEqual(['is']);
    expect(gorunenKartlar(anaSayfaKartlari, ['sayfa.personel', 'kisiler.oku', 'kisiler.yaz']).map((k) => k.anahtar)).toEqual(['kisiler-eksik-bilgi']);
    expect(gorunenKartlar(anaSayfaKartlari, ['sayfa.personel', 'kisiler.oku'])).toEqual([]);
  });
});
