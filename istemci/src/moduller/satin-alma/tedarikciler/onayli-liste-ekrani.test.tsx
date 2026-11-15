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
    // Açılışta ilk kararlı kategori seçili; firma geneli ağaçtan seçilir.
    const ilk = await screen.findByRole('table', { name: 'Onaylı liste: Hizmet · Isıl işlem' });
    expect(within(ilk).getByRole('columnheader', { name: 'Onaylar (bu kategoride)' })).toBeTruthy();
    expect(within(ilk).getByText('12.03.2026 · ORN-Kalite Sorumlusu')).toBeTruthy();
    expect(within(ilk).getByText("Firmanın Kalite Merkezi'nde kaydı yok")).toBeTruthy();
    expect(screen.getByText('Onaylı firma').closest('div')?.parentElement?.textContent).toContain('en az bir kategoride');
    fireEvent.click(screen.getByRole('button', { name: /Tüm firmalar/ }));
    const tablo = await screen.findByRole('table', { name: 'Onaylı liste' });
    expect(within(tablo).getAllByText('Kalite kaydı yok').length).toBeGreaterThan(0);
    expect(within(tablo).getByText(/Ad ile eşlendi/)).toBeTruthy();
    expect(within(tablo).queryByText("Kalite'de aç")).toBeNull();
  });

  it('kategori seçilince yalnız kararlılar ve kaydı olmayan satın alma tedarikçisi; şart görünür', async () => {
    ac(ORNEK_LISTE, ['satin-alma.oku', 'sayfa.kalite-merkezi']);
    const tablo = await screen.findByRole('table', { name: 'Onaylı liste: Hizmet · Isıl işlem' });
    expect(within(tablo).queryByText('ORN-Kuzey')).toBeNull();
    expect(within(tablo).getByText(/ORN şart: her partide rapor/)).toBeTruthy();
    expect(within(tablo).getAllByRole('link', { name: "Kalite'de aç" }).map((a) => a.getAttribute('href'))).toEqual(['/kalite-merkezi/tedarikciler', '/kalite-merkezi/tedarikciler']);
    expect(within(tablo).getByRole('link', { name: "Kalite'de firmaya bağla" })).toBeTruthy();
  });

  it('Son 12 ay sütunu ve matris: tür çipi, Kalite kaydı yok "?", şartlı hücre şartı gösterir', async () => {
    ac(ORNEK_LISTE);
    const tablo = await screen.findByRole('table', { name: 'Onaylı liste: Hizmet · Isıl işlem' });
    expect(within(tablo).getByText('23 sipariş')).toBeTruthy();
    expect(within(tablo).getByText('%96 zamanında')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Firma × kategori' }));
    const m = await screen.findByRole('table', { name: 'Firma × kategori' });
    expect(screen.getByRole('button', { name: 'Hizmet', pressed: true })).toBeTruthy();
    expect(within(m).getByTitle('Kalite kaydı yok').textContent).toBe('?');
    fireEvent.click(within(m).getByRole('button', { name: /ORN-Demir, Isıl işlem: Şartlı/ }));
    expect(screen.getByRole('status').textContent).toContain('ORN şart: her partide rapor');
  });

  it('3279-2 a: onay rozetinde tür simgesi; firma penceresinde Kalite\'de aç uygulama içi bağlantı', async () => {
    ac(ORNEK_LISTE, ['satin-alma.oku', 'sayfa.kalite-merkezi']);
    const tablo = await screen.findByRole('table', { name: 'Onaylı liste: Hizmet · Isıl işlem' });
    const kimler = [...tablo.querySelectorAll('.sa-ol-onay > small')];
    expect(kimler.length).toBeGreaterThan(1);
    expect(kimler.every((k) => k.querySelector('svg.tc-simge') !== null)).toBe(true);
    fireEvent.click(within(tablo).getByRole('button', { name: 'ORN-Anka' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByRole('link', { name: "Kalite'de aç" }).getAttribute('href')).toBe('/kalite-merkezi/tedarikciler');
  });

  it('istek düşerse hata kutusu', async () => {
    ac(null);
    expect(await screen.findByRole('button', { name: /Yeniden dene/ })).toBeTruthy();
  });
});
