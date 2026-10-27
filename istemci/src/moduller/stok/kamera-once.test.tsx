import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IstasyonSepetiCevabi, Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { MALZEME_TESLIM_AC } from './disari.ts';
import { json, sunucuKur } from './test-ortak.tsx';
import { ustEylemler } from './ust-eylem.tsx';

// Kamera önce (809): panel kamerayla açılır, altında iki büyük kutucuk; kutucuk kendi ekranını açar, "Kameraya dön" geri getirir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const uc = (konumId: number, kod: string, ad: string, istasyonId: number | null) => ({ konumId, kod, ad, istasyonId });
const GELEN: Teslim = {
  id: 41, no: 'TS-000041', malzemeId: 901, malzemeAd: 'Deneme mil', miktar: '3.000', partiId: 4, statuId: 7,
  kaynak: uc(20, 'IST-1', 'Torna 1', 1), hedef: uc(21, 'IST-2', 'Freze 2', 2), uretimEmriId: null, istekId: null, aciklama: null,
  durum: 'yolda', alinan: null, redNedeni: null, gonderenAd: 'Deneme Kişi', kapatanAd: null, aliciAd: null, gonderim: '2026-10-14T08:00:00+03:00', kapanis: null, surum: 1,
};
const KUTU: TeslimKutusuCevabi = {
  gelenler: [GELEN], gonderdiklerim: [], isteklerim: [],
  istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }],
  hedefIstasyonlar: [{ id: 1, kod: 'T1', ad: 'Torna 1' }, { id: 2, kod: 'F2', ad: 'Freze 2' }],
  depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 2, harita: null, zemin: null,
};
const SEPET: IstasyonSepetiCevabi = { istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [], satirlar: [
  { malzemeId: 902, kod: 'YM-2', ad: 'Deneme flanş', partiId: 8, partiEtiketi: 'LT-8', statuId: null, miktar: '8', yolda: '0', uretimEmriId: null, getiren: null, gelis: null, sonraki: null, sonrakiYok: 'rota-disi' },
] };

function ciz(yollar: Record<string, (govde: unknown) => Response> = {}) {
  const istekler = sunucuKur(OPERATOR, {
    'GET /stok/teslim-kutusu/sayac': () => json(200, { gelen: 1 }),
    'GET /stok/teslim-kutusu': () => json(200, KUTU),
    'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET),
    ...yollar,
  });
  const Dugme = ustEylemler[0]!.dugme;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Dugme /></BildirimSaglayici></QueryClientProvider>);
  return istekler;
}

describe('Malzeme · Teslim kamera önce (809)', () => {
  it('açılınca kamera kendiliğinden istenir; sekme şeridi yok, kutucuklar sayıyla, istasyon başlıkta', async () => {
    const getUserMedia = vi.fn(() => Promise.reject(new Error('izin yok')));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    ciz({ 'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, { satirlar: [] }) });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    const panel = await screen.findByRole('dialog', { name: 'Malzeme · Teslim' });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(within(panel).queryByRole('tablist')).toBeNull();
    expect(await within(panel).findByRole('button', { name: 'Bana gelen, 1' })).toBeTruthy();
    expect(await within(panel).findByRole('button', { name: 'Elimdekiler, 1' })).toBeTruthy();
    expect(within(panel).getByText('Freze 2 istasyonundasın')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Malzeme iste' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /^Benden istenenler/ })).toBeNull();
  });

  it('sayı okunamazsa kutucuk sayısız kalır (sıfır yazılmaz)', async () => {
    ciz({ 'GET /stok/teslim-kutusu/sepet/gelecek': () => json(500, { kod: 'HATA', mesaj: 'Olmadı.' }) });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    expect(await screen.findByRole('button', { name: 'Elimdekiler, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bana gelen' })).toBeTruthy();
  });

  it('kutucuk kendi ekranını açar, Kameraya dön kutucuklara getirir', async () => {
    ciz({ 'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, { satirlar: [] }) });
    fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bana gelen, 1' }));
    const ekran = await screen.findByRole('dialog', { name: 'Bana gelen' });
    expect(within(await within(ekran).findByRole('list', { name: 'Bana gelenler' })).getByText(/Deneme mil/)).toBeTruthy();
    expect(within(ekran).queryByRole('textbox', { name: /Kod/ })).toBeNull();
    fireEvent.click(within(ekran).getByRole('button', { name: 'Kameraya dön' }));
    expect(await screen.findByRole('dialog', { name: 'Malzeme · Teslim' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Kod/ })).toBeTruthy();
  });

  it('terminalden açılınca Bana gelen ekranı açılır, kamera başlamaz', async () => {
    const getUserMedia = vi.fn(() => Promise.reject(new Error('izin yok')));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    ciz({ 'GET /stok/teslim-kutusu/is-malzemeleri': () => json(200, { isler: [] }), 'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, { satirlar: [] }) });
    window.dispatchEvent(new CustomEvent(MALZEME_TESLIM_AC, { detail: { istasyonId: 2, uretimEmriId: 70, malzemeId: null } }));
    expect(await screen.findByRole('dialog', { name: 'Bana gelen' })).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
