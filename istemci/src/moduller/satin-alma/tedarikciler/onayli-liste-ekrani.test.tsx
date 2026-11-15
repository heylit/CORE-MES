import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { OnayliListe } from './OnayliListe.tsx';
import { ORNEK_LISTE } from './ornek.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
function ac(cevap: OnayliListeCevabi | null, islemler: string[] = ['satin-alma.oku']) {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-onayli-liste') return cevap === null ? json(500, { hata: 'Deneme' }) : json(200, cevap);
    return json(404, {});
  }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><OnayliListe /></MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3279 a Onaylı liste sekmesi', () => {
  it('Kalite bağlı değilse rozet yok, kimse onaylı sayılmaz', async () => {
    ac({ ...ORNEK_LISTE, kaliteBagli: false });
    expect(await screen.findByText(/Kalite bilgisi alınamadı/)).toBeTruthy();
    expect(screen.queryByText('ORN-Anka')).toBeNull();
  });

  it('firma geneli: Kalite kaydı yok rozeti, ad ile eşlenen not; Kalite\'de aç yalnız Kalite sayfası işlemi olana', async () => {
    ac(ORNEK_LISTE);
    const tablo = await screen.findByRole('table', { name: 'Onaylı liste' });
    expect(within(tablo).getAllByText('Kalite kaydı yok').length).toBeGreaterThan(0);
    expect(within(tablo).getByText(/Ad ile eşlendi/)).toBeTruthy();
    expect(within(tablo).queryByText("Kalite'de aç")).toBeNull();
  });

  it('kategori seçilince yalnız kararlılar ve kaydı olmayan satın alma tedarikçisi; şart görünür', async () => {
    ac(ORNEK_LISTE, ['satin-alma.oku', 'sayfa.kalite-merkezi']);
    fireEvent.click(await screen.findByRole('button', { name: /Isıl işlem/ }));
    const tablo = await screen.findByRole('table', { name: 'Onaylı liste: Hizmet · Isıl işlem' });
    expect(within(tablo).queryByText('ORN-Kuzey')).toBeNull();
    expect(within(tablo).getByText('ORN şart: her partide rapor')).toBeTruthy();
    expect(within(tablo).getAllByText("Kalite'de aç").length).toBe(3);
  });

  it('istek düşerse hata kutusu', async () => {
    ac(null);
    expect(await screen.findByRole('button', { name: /Yeniden dene/ })).toBeTruthy();
  });
});
