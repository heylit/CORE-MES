import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { TedarikTerminleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { TedarikTerminleri } from './TedarikTerminleri.tsx';

type Satir = TedarikTerminleriCevabi['terminler'][number];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Malzeme kodları ve kişi uydurmadır.
const satir = (ek: Partial<Satir>): Satir => ({
  malzemeNo: 11, malzemeKodu: 'HM-DEN-00001', malzemeAdi: 'Deneme mil', termin: null, gerekenTarih: '2026-11-05', aciklama: '', surum: 1,
  guncelleme: '2026-10-25T08:00:00.000Z', kisiAdi: null, ...ek,
});

interface Istek { yontem: string; yol: string; govde: unknown }
function ac(terminler: Satir[], islemler: string[] = ['satin-alma.oku', 'satin-alma.yaz'], kaydet: () => Response = () => json(200, { termin: satir({}) })) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-tedarik-terminleri') return json(200, { terminler } satisfies TedarikTerminleriCevabi);
    return kaydet();
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><BildirimSaglayici><TedarikTerminleri /></BildirimSaglayici></MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tedarik terminleri (533 a)', () => {
  it('satırda olması gereken, termin ve durum görünür: termin yoksa bekleniyor, geç termin "Geç kalıyor", erken termin "Zamanında"', async () => {
    ac([
      satir({}),
      satir({ malzemeNo: 12, malzemeKodu: 'HM-DEN-00002', termin: '2026-11-09', kisiAdi: 'Deneme Alıcı' }),
      satir({ malzemeNo: 13, malzemeKodu: 'HM-DEN-00003', termin: '2026-11-01' }),
    ]);
    const tablo = await screen.findByRole('table', { name: 'Tedarik terminleri' });
    expect(within(tablo).getByText('Termin bekleniyor')).toBeTruthy();
    expect(within(tablo).getByText('Geç kalıyor')).toBeTruthy();
    expect(within(tablo).getByText('Zamanında')).toBeTruthy();
    expect(within(tablo).getAllByText('05.11.2026').length).toBe(3);
    expect(screen.getByText('1 termin bekleniyor')).toBeTruthy();
  });

  it('okuyan termin giremez (düğme yok); planı yazan girer', async () => {
    ac([satir({})], ['satin-alma.oku']);
    await screen.findByRole('table', { name: 'Tedarik terminleri' });
    expect(screen.queryByRole('button', { name: /Termin gir/ })).toBeNull();
    cleanup();
    ac([satir({})], ['satin-alma.oku', 'plan.yaz']);
    expect(await screen.findByRole('button', { name: /Termin gir/ })).toBeTruthy();
  });

  it('termin girişi sürümle gider; boş termin null gönderir', async () => {
    const istekler = ac([satir({ termin: '2026-11-09', surum: 4 })]);
    fireEvent.click(await screen.findByRole('button', { name: /Termin gir/ }));
    fireEvent.change(screen.getByLabelText(/^Termin/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')).toEqual({
      yontem: 'POST', yol: '/satin-alma-tedarik-terminleri/kaydet', govde: { malzemeNo: 11, termin: null, aciklama: '', surum: 4 },
    });
  });

  it('başkası araya girdiyse (409) sunucunun iletisi görünür, pencere kapanmaz', async () => {
    ac([satir({})], undefined, () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka biri tarafından değiştirildi.' }));
    fireEvent.click(await screen.findByRole('button', { name: /Termin gir/ }));
    fireEvent.change(screen.getByLabelText(/^Termin/), { target: { value: '2026-11-04' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('başka biri');
  });
});
