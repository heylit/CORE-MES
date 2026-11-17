import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { HazirlikMaddeleriCevabi, HazirlikMaddeTanimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { HazirlikMaddeleri } from './HazirlikMaddeleri.tsx';

const AYARCI: Kullanici = { id: 4, ad: 'Deneme Müdür', islemler: ['sayfa.projeler', 'uretim-emirleri.hazirlik-ayar'] };
const madde = (ek: Partial<HazirlikMaddeTanimi> & Pick<HazirlikMaddeTanimi, 'kod' | 'ad'>): HazirlikMaddeTanimi => ({
  kisa: ek.ad, sira: 10, acik: true, sistem: true, durduran: false, sahip: 'Stok Merkezi', isEmriDuzeyi: true, surum: 1, ...ek,
});
const LISTE = (yazabilir: boolean): HazirlikMaddeleriCevabi => ({
  yazabilir,
  maddeler: [
    madde({ kod: 'cnc', ad: 'CNC kurulumu', durduran: true, sahip: 'CNC Kurulum' }),
    madde({ kod: 'malzeme', ad: 'Malzeme (girdi stoğu)', sira: 50 }),
    madde({ kod: 'ozel-a', ad: 'Boya onayı', sira: 130, sistem: false, sahip: 'Hazırlık görevi' }),
  ],
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(yazabilir: boolean) {
  const cagrilar: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: AYARCI } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/hazirlik-maddeleri') return json(200, LISTE(yazabilir));
    if (yontem === 'POST') return json(200, LISTE(yazabilir));
    return json(404, { kod: 'yok', mesaj: 'yok' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter><HazirlikMaddeleri /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3396 a: madde listesi veride; durduran madde formda kapatılamaz, özel madde eklenir.
describe('Hazırlık maddeleri (3396)', () => {
  it('liste sahibi, etkiyi ve özel maddeyi gösterir; yetkisiz kişide düğme ve satır seçimi yok', async () => {
    kur(false);
    await screen.findByText('Boya onayı');
    expect(screen.getByText('Özel')).toBeTruthy();
    expect(screen.getAllByText('Durduran').length).toBe(1);
    expect(screen.getByText('Hazırlık görevi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni madde/ })).toBeNull();
  });

  it('durduran maddenin formunda Açık kutusu kilitli; uyaran madde kapatılınca sürümle gönderilir', async () => {
    const cagrilar = kur(true);
    fireEvent.click(await screen.findByText('CNC kurulumu'));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));

    fireEvent.click(await screen.findByText('Malzeme (girdi stoğu)'));
    const p2 = await screen.findByRole('dialog');
    fireEvent.click(within(p2).getByRole('checkbox'));
    fireEvent.click(within(p2).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')).toMatchObject({
      yol: '/hazirlik-maddeleri/malzeme/degistir', govde: { ad: 'Malzeme (girdi stoğu)', kisa: 'Malzeme (girdi stoğu)', sira: 50, acik: false, surum: 1 },
    });
  });

  it('yeni özel madde ekleme ucuna gider', async () => {
    const cagrilar = kur(true);
    fireEvent.click(await screen.findByRole('button', { name: /Yeni madde/ }));
    const p = await screen.findByRole('dialog');
    fireEvent.change(within(p).getByLabelText(/^Ad/), { target: { value: 'Paketleme onayı' } });
    fireEvent.change(within(p).getByLabelText(/Kısa ad/), { target: { value: 'Paket' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')).toMatchObject({ yol: '/hazirlik-maddeleri/ozel-ekle', govde: { ad: 'Paketleme onayı', kisa: 'Paket', sira: 140, acik: true } });
  });
});
