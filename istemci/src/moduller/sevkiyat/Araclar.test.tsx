import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { AracGovdesi, AraclarCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Araclar } from './Araclar.tsx';
import { ARACLAR } from './test-verisi.ts';

const TANIMCI: Kullanici = { id: 5, ad: 'Deneme Tanımcı', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.tanim-yaz'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const ILK = ARACLAR.araclar[0]!;

function sunucuKur(araclar: AraclarCevabi = ARACLAR) {
  const yazilan: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (ayar?.method === 'POST') { yazilan.push({ yol, govde: ayar.body ? JSON.parse(String(ayar.body)) : undefined }); return json(200, { arac: ILK }); }
    if (yol === '/oturum') return json(200, { kullanici: TANIMCI } satisfies OturumCevabi);
    if (yol === '/sevkiyat/araclar') return json(200, araclar);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilan;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/sevkiyat/araclar']}><Araclar /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
const doldur = (yer: HTMLElement, etiket: RegExp, deger: string) => fireEvent.change(within(yer).getByLabelText(etiket), { target: { value: deger } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Araclar', () => {
  it('yeni araç pencerede girilir; boş maliyet oranı null gider, pencere kaydedince kapanır', async () => {
    const yazilan = sunucuKur();
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni araç' }));
    const pencere = screen.getByRole('dialog', { name: 'Yeni araç' });
    doldur(pencere, /^Ad/, 'Deneme Kamyonet');
    doldur(pencere, /^Kapasite \(kg\)/, '1200');
    doldur(pencere, /^Kapasite \(palet\)/, '3');
    doldur(pencere, /^TL\/km/, '14.5');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]).toEqual({
      yol: '/sevkiyat/araclar/ekle',
      govde: {
        ad: 'Deneme Kamyonet', tur: 'kamyonet', plaka: null, kapasiteKilogram: 1200, kapasitePalet: 3, musaitBaslangic: '08:00', musaitBitis: '18:00',
        kilometreMaliyeti: 14.5, saatMaliyeti: null, gunlukMaliyet: null,
      } satisfies AracGovdesi,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Deneme Kamyonet kaydedildi.')).toBeTruthy();
  });

  it('180, 200 a: maliyet yetkisi olmayana oran gelmez; maliyet sütunu ve oran alanları çizilmez, 0 TL görünmez', async () => {
    sunucuKur({ araclar: ARACLAR.araclar.map((a) => ({ ...a, kilometreMaliyeti: null, saatMaliyeti: null, gunlukMaliyet: null, varsayilanMaliyet: null })), ornekMaliyetler: null });
    ac();
    const tablo = await screen.findByRole('table', { name: 'Araçlar' });
    expect(within(tablo).queryByRole('columnheader', { name: 'Maliyet' })).toBeNull();
    expect(tablo.textContent).not.toMatch(/TL/);
    fireEvent.click(screen.getByRole('button', { name: `${ILK.ad} aracını düzenle` }));
    const pencere = screen.getByRole('dialog', { name: 'Aracı düzenle' });
    expect(within(pencere).queryByText(/Maliyet oranları/)).toBeNull();
    expect(within(pencere).queryByLabelText(/^TL\/km/)).toBeNull();
  });

  it('pasifleştirme onay penceresinden geçer: vazgeç yazmaz, onay yazar', async () => {
    const yazilan = sunucuKur();
    ac();
    fireEvent.click(await screen.findByRole('button', { name: `${ILK.ad} aracını pasifleştir` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `${ILK.ad} aracını pasifleştir` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pasifleştir' }));
    await waitFor(() => expect(yazilan).toEqual([{ yol: `/sevkiyat/araclar/${ILK.id}/pasiflestir`, govde: undefined }]));
  });
});
