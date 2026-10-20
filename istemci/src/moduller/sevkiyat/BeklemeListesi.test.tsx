import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BekleyenlerCevabi, HaritaCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { SevkiyatPlani } from './SevkiyatPlani.tsx';
import { GUN_PLANI } from './test-verisi.ts';

const TARIH = GUN_PLANI.tarih;
const PLANCI: Kullanici = { id: 3, ad: 'Deneme Planlayıcı', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.plan-yaz', 'sevkiyat.is-yaz'] };
const OKUYUCU: Kullanici = { id: 4, ad: 'Deneme Okuyucu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku'] };
const BEKLEYENLER = {
  bekleyenler: [
    { id: 7, kaynak: 'urun', uretimEmriId: 11, emirNo: 'DENEME-UE-11', talepId: null, talepNo: null, malzemeNo: 5, malzemeAd: 'Deneme mamul', firmaId: null, firmaAd: null, noktaId: null,
      adet: '7.0000', istenenTarih: null, hazirZamani: '2026-10-08T09:00:00+03:00' },
    { id: 8, kaynak: 'fason', uretimEmriId: 12, emirNo: 'DENEME-UE-12', talepId: null, talepNo: null, malzemeNo: 5, malzemeAd: 'Deneme mamul', firmaId: 9, firmaAd: 'Örnek Fason B', noktaId: 3,
      adet: '3.0000', istenenTarih: null, hazirZamani: '2026-10-08T10:00:00+03:00' },
  ],
} satisfies BekleyenlerCevabi;

interface Istek { yontem: string; yol: string; govde: unknown }
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const istek = { yontem: ayar?.method ?? 'GET', yol: adres.replace('/api', ''), govde: ayar?.body ? JSON.parse(String(ayar.body)) : undefined };
    istekler.push(istek);
    if (istek.yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (istek.yol === '/sevkiyat/harita') return json(200, { harita: null } satisfies HaritaCevabi);
    if (istek.yol === `/sevkiyat/planlar/${TARIH}`) return json(200, GUN_PLANI);
    if (istek.yol === '/sevkiyat/bekleyenler') return json(200, BEKLEYENLER);
    if (istek.yol.endsWith('/ise-cevir')) return json(200, { is: GUN_PLANI.isler[3] });
    if (istek.yol.endsWith('/kaldir')) return json(200, { id: 7 });
    if (istek.yol.endsWith('/bol')) return json(200, { id: 7, yeniId: 13 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[`/sevkiyat?tarih=${TARIH}`]}><SevkiyatPlani /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Bekleme listesi', () => {
  it('fason kaydı firmanın noktasıyla işe çevrilir; gün, yük ve belge no formdan gider', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    const liste = await screen.findByRole('region', { name: 'Bekleme listesi' });
    expect(within(liste).getByText('Sevke hazır')).toBeTruthy();
    expect(within(liste).getByText('Fasona gidecek')).toBeTruthy();
    fireEvent.click(within(liste).getAllByRole('button', { name: 'İşe çevir' })[1]!);
    const form = await screen.findByRole('form', { name: 'İşe çevir' });
    expect((within(form).getByLabelText(/Teslim noktası/) as HTMLSelectElement).value).toBe('3');
    fireEvent.change(within(form).getByLabelText(/Palet/), { target: { value: '2' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Havuza ekle' }));
    await waitFor(() => expect(yazmalar(istekler).length).toBe(1));
    const yazma = yazmalar(istekler)[0]!;
    expect(yazma.yol).toBe('/sevkiyat/bekleyenler/8/ise-cevir');
    expect(yazma.govde).toMatchObject({ tarih: TARIH, tur: 'teslimat', birakisNoktasiId: 3, paletSayisi: 2, belgeNo: 'DENEME-UE-12' });
  });

  it('261 a: yalnız ürün kaydı bölünür; ayrılacak adet pencereden gider', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    const liste = await screen.findByRole('region', { name: 'Bekleme listesi' });
    expect(within(liste).getAllByRole('button', { name: 'Böl' })).toHaveLength(1);
    fireEvent.click(within(liste).getByRole('button', { name: 'Böl' }));
    const pencere = screen.getByRole('dialog', { name: 'Kısmi sevk' });
    expect((within(pencere).getByRole('button', { name: 'Ayır' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Ayrılacak adet'), { target: { value: '3' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ayır' }));
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: '/sevkiyat/bekleyenler/7/bol', govde: { adet: '3' } }]));
    expect(await screen.findByText('3 adet ayrı kayda ayrıldı.')).toBeTruthy();
  });

  it('kaldırma onaydan geçer; yetkisiz kişi düğmeleri görmez', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    const liste = await screen.findByRole('region', { name: 'Bekleme listesi' });
    fireEvent.click(within(liste).getAllByRole('button', { name: 'Kaldır' })[0]!);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Listeden kaldırılsın mı?' })).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: '/sevkiyat/bekleyenler/7/kaldir', govde: undefined }]));
    cleanup();
    sunucuKur(OKUYUCU);
    ac();
    const okunan = await screen.findByRole('region', { name: 'Bekleme listesi' });
    expect(within(okunan).queryByRole('button', { name: 'İşe çevir' })).toBeNull();
  });
});
