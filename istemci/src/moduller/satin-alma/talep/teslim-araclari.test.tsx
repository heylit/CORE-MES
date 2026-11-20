import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AcikEmirlerCevabi, MalzemeSecenekleriCevabi, OnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { TaleplerimSayfasi } from './TaleplerimSayfasi.tsx';

// Veri uydurmadır. 3485 a: planın aynı malzemeyi farklı günlerde isteyen taslağı formda toplanır ya da kalem bölünür.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [{ no: 7, kod: 'HM-00007', ad: 'Deneme rulman', birim: 'adet', kategori: null, katalogId: null, stokBirimi: 'adet', birimKg: null }] } satisfies MalzemeSecenekleriCevabi;
const EMIRLER = { emirler: [] } satisfies AcikEmirlerCevabi;
const plan = (gerekenTarih: string, miktar: number): OnTalep => ({
  kaynak: 'plan', malzeme: { no: 7, kod: 'HM-00007', ad: 'Deneme rulman' }, miktar, birim: 'adet', gerekenTarih,
  emirler: [], stokBilinmiyor: false, hesap: { eksik: miktar, siparis: 0, talep: 0, yoksayilan: 0 },
});

interface Cagri { yol: string; govde: unknown }
function sunucuKur(): Cagri[] {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null });
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, KARTLAR);
    if (yol === '/satin-alma-acik-emirler') return json(200, EMIRLER);
    if (yol === '/satin-alma-on-talepleri') return json(200, { onTalepler: [], yoksayilanlar: [] });
    if (yol === '/satin-alma-talepleri/hizli-ac') {
      return json(200, { id: '00000000-0000-4000-8000-000000000001', no: 'ST-2026-042', baslik: 'Deneme', durum: 'onayda', ihtiyacTarihi: null,
        olusturma: '2026-11-20T08:00:00Z', uretimEmriNo: null, kaynak: 'plan', kalemler: [] });
    }
    if (yol.startsWith('/satin-alma-taleplerim?')) return json(200, { talepler: [], toplam: 0 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}
const ac = (taslak: OnTalep[]) => render(
  <MemoryRouter initialEntries={[{ pathname: '/taleplerim', search: '?bolum=yeni', state: { taslak } }]}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici><TaleplerimSayfasi /></BildirimSaglayici></QueryClientProvider>
  </MemoryRouter>,
);
const gonderilen = async (cagrilar: Cagri[]) => {
  fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
  await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
  return (cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { kalemler: { malzemeNo: number | null; miktar: string; ihtiyacTarihi?: string }[] }).kalemler;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3485 a talep formu teslimleri', () => {
  it('Teslimleri topla: aynı haftadaki kalemler tek kaleme iner, termin ilk tarih, miktar toplam', async () => {
    const cagrilar = sunucuKur();
    ac([plan('2026-11-10', 6.5), plan('2026-11-12', 3), plan('2026-11-17', 2)]);
    const grup = await screen.findByRole('group', { name: 'Teslimleri topla' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Uygula (3 → 2 kalem)' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Kalem 3: teslimi böl' })).toBeNull());
    const k = await gonderilen(cagrilar);
    expect(k.map((x) => [x.malzemeNo, Number(x.miktar)])).toEqual([[7, 9.5], [7, 2]]);
  });

  it('toplama bildirimindeki Geri al kalemleri geri getirir', async () => {
    sunucuKur();
    ac([plan('2026-11-10', 6.5), plan('2026-11-12', 3)]);
    fireEvent.click(within(await screen.findByRole('group', { name: 'Teslimleri topla' })).getByRole('button', { name: 'Uygula (2 → 1 kalem)' }));
    expect(screen.getByText('Teslimler toplandı: 2 kalem 1 kaleme indi.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kalem 2: teslimi böl' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    expect(screen.getByRole('button', { name: 'Kalem 2: teslimi böl' })).toBeTruthy();
  });

  it('tek teslim seçilince hepsi bir kalem olur; birleşecek kalem yoksa düğme kapalı', async () => {
    sunucuKur();
    ac([plan('2026-11-10', 1), plan('2026-12-10', 1)]);
    const grup = await screen.findByRole('group', { name: 'Teslimleri topla' });
    expect((within(grup).getByRole('button', { name: 'Birleşecek kalem yok' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(grup).getByRole('button', { name: 'Tek teslim' }));
    expect(within(grup).getByRole('button', { name: 'Uygula (2 → 1 kalem)' })).toBeTruthy();
  });

  it('Teslimi böl: toplam tutmazsa bölünmez; tutunca kalem iki tarihe ayrılır', async () => {
    const cagrilar = sunucuKur();
    ac([plan('2026-11-10', 8)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Kalem 1: teslimi böl' }));
    const pencere = await screen.findByRole('dialog');
    const bol = () => within(pencere).getByRole('button', { name: 'Böl (2 satır)' }) as HTMLButtonElement;
    fireEvent.change(within(pencere).getByLabelText('Teslim 1 miktarı (adet)'), { target: { value: '5' } });
    fireEvent.change(within(pencere).getByLabelText('Teslim 2 miktarı (adet)'), { target: { value: '2' } });
    expect(within(pencere).getByRole('alert').textContent).toContain('1 adet eksik');
    expect(bol().disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Teslim 2 miktarı (adet)'), { target: { value: '3' } });
    expect(bol().disabled).toBe(false);
    fireEvent.click(bol());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const k = await gonderilen(cagrilar);
    expect(k.map((x) => [x.malzemeNo, Number(x.miktar)])).toEqual([[7, 5], [7, 3]]);
    expect(new Set(k.map((x) => x.ihtiyacTarihi)).size).toBe(2);
  });
});
