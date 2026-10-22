import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { UrunSevkleriCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { GUN_PLANI } from './test-verisi.ts';
import { UrunSevkleri } from './disari.ts';

const YAZAR: Kullanici = { id: 3, ad: 'Deneme Depocu', islemler: ['sevkiyat.oku', 'sevkiyat.is-yaz'] };
const OKUYUCU: Kullanici = { id: 4, ad: 'Deneme Okuyucu', islemler: ['sevkiyat.oku'] };
const YETKISIZ: Kullanici = { id: 5, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const ortak = { uretimEmriId: 11, emirNo: 'DENEME-UE-11', malzemeAd: 'Deneme mamul', adet: '7.0000', firmaAd: 'Örnek Müşteri A' };
const SEVKLER = {
  sevkler: [
    { bekleyenId: 1, ...ortak, is: { id: 21, tarih: '2026-10-08', durum: 'yolda', belgeNo: 'IRS-1' } },
    { bekleyenId: 2, ...ortak, is: { id: 22, tarih: '2026-10-08', durum: 'planlandi', belgeNo: null } },
    { bekleyenId: 3, ...ortak, is: null },
  ],
} satisfies UrunSevkleriCevabi;

interface Istek { yontem: string; yol: string; govde: unknown }
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur(kullanici: Kullanici) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const istek = { yontem: ayar?.method ?? 'GET', yol: adres.replace('/api', ''), govde: ayar?.body ? JSON.parse(String(ayar.body)) : undefined };
    istekler.push(istek);
    if (istek.yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (istek.yol.startsWith('/sevkiyat/urun-sevkleri')) return json(200, SEVKLER);
    if (istek.yol === '/sevkiyat/isler/21/durum') return json(200, { is: { ...GUN_PLANI.isler[0]!, id: 21, durum: 'tamamlandi' }, uyarilar: ['Emir DENEME-UE-11: 1 adet red parça sevk edildi.'] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}
function ac(ozellik: { uretimEmriId?: number; malzemeId?: number }) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><MemoryRouter><UrunSevkleri {...ozellik} /></MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Ürünün sevkleri (kart #96)', () => {
  it('yazar: yoldaki iş teslim edildi işaretlenir, stok uyarısı gösterilir; taslak plandaki ve işe çevrilmemiş kayıtta düğme yok', async () => {
    const istekler = sunucuKur(YAZAR);
    ac({ uretimEmriId: 11 });
    const liste = await screen.findByRole('list', { name: 'Ürünün sevkleri' });
    expect(istekler.some((i) => i.yol === '/sevkiyat/urun-sevkleri?uretimEmriId=11')).toBe(true);
    const [yolda, taslak, bekleyen] = within(liste).getAllByRole('listitem');
    expect(within(taslak!).queryByRole('button')).toBeNull();
    expect(within(taslak!).getByText(/taslak planda/)).toBeTruthy();
    expect(within(bekleyen!).queryByRole('button')).toBeNull();
    expect(within(bekleyen!).getByText(/İşe çevrilmedi/)).toBeTruthy();
    expect(within(yolda!).getByRole('button', { name: 'Yapılamadı' })).toBeTruthy();
    fireEvent.click(within(yolda!).getByRole('button', { name: 'Teslim edildi' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/sevkiyat/isler/21/durum')).toBe(true));
    expect(istekler.find((i) => i.yol === '/sevkiyat/isler/21/durum')!.govde).toMatchObject({ durum: 'tamamlandi', not: null });
    expect(await screen.findByText(/red parça sevk edildi/)).toBeTruthy();
  });
  it('kartla sorar; yalnız okuyan kişi durumu görür, düğme görmez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac({ malzemeId: 5 });
    expect(await screen.findByRole('list', { name: 'Ürünün sevkleri' })).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/sevkiyat/urun-sevkleri?malzemeNo=5')).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('sevkiyat okuması olmayan kişide bölüm görünmez ve sorulmaz', async () => {
    const istekler = sunucuKur(YETKISIZ);
    ac({ uretimEmriId: 11 });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(screen.queryByRole('list')).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/sevkiyat/'))).toBe(false);
  });
});
