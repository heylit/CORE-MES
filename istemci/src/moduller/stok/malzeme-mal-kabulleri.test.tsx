import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MalKabulSatirlariCevabi, MalKabulSatirOzeti } from '#paylasilan/sozlesme/stok-mal-kabul-satirlari.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OKUYUCU, json, sunucuKur } from './test-ortak.tsx';
import { MalzemeMalKabulleri } from './MalzemeMalKabulleri.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3082: malzemenin irsaliyesi mal kabul üzerinden görünür; veriler uydurmadır.
const SATIR: MalKabulSatirOzeti = {
  id: 601, malKabulId: 88, belgeNo: 'MK-000088', tur: 'satin_alma', irsaliyeNo: 'ORN-IRS-7', zaman: '2026-11-10T09:30:00+03:00', kisiAd: 'Deneme Depocu',
  sira: 1, malzemeId: 4, malzemeKod: 'ORN-HM-1', malzemeAd: 'Deneme sac', birim: 'kg', sayilanMiktar: '10',
  partiId: 12, lotNo: 'LT-000012', tedarikciPartiNo: null, partiBelgeleri: [], irsaliyeBelgeleri: [{ id: 31, ad: 'İrsaliye ORN-IRS-7' }], ilkKonumKod: 'KABUL',
  yerler: [], fasonGidenAd: null, gkk: false, logoDurumu: 'irsaliye_bekleniyor', duzeltenId: null, siparisNo: 'SP-000041', tedarikciAdi: 'Deneme Tedarik',
};
const cevap = (satirlar: MalKabulSatirOzeti[]): MalKabulSatirlariCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 5 });

function goster() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter><MalzemeMalKabulleri malzemeId={4} /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

describe('Malzeme ayrıntısında mal kabuller ve irsaliyeler (3082)', () => {
  it('son beş mal kabulü malzemeye süzerek ister; mal kabul, sipariş, irsaliye no ve irsaliye belgesi görünür', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([SATIR, { ...SATIR, id: 602, irsaliyeNo: null, irsaliyeBelgeleri: [], siparisNo: null, lotNo: null }])) });
    goster();
    const tablo = within(await screen.findByRole('table', { name: 'Mal kabuller ve irsaliyeler' }));
    const satir = within(tablo.getByText('ORN-IRS-7').closest('tr')!);
    expect(satir.getAllByRole('link', { name: 'MK-000088' })[0]!.getAttribute('href')).toBe('/stok/mal-kabul/88');
    expect(satir.getByText('SP-000041')).toBeTruthy();
    expect(satir.getByText('LT-000012')).toBeTruthy();
    expect(satir.getByText('10 kg')).toBeTruthy();
    expect(satir.getByRole('link', { name: 'İrsaliye ORN-IRS-7 belgesini aç' }).getAttribute('href')).toBe('/api/stok/mal-kabuller/88/irsaliyeler/31');
    expect(screen.getByRole('link', { name: 'Tümü' }).getAttribute('href')).toBe('/stok/mal-kabul?sekme=yapilanlar');
    expect(tablo.getAllByRole('link', { name: /belgesini aç/ })).toHaveLength(1);
    const istek = istekler.find((i) => i.yol.startsWith('/stok/mal-kabul-satirlari'))!;
    expect(istek.yol).toBe('/stok/mal-kabul-satirlari?malzemeId=4&sirala=zaman&yon=azalan&sayfaBoyu=5');
  });

  it('mal kabulü olmayan malzemede kart görünmez', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([])) });
    goster();
    await vi.waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/stok/mal-kabul-satirlari'))).toBe(true));
    await vi.waitFor(() => expect(screen.queryByText('Mal kabuller ve irsaliyeler')).toBeNull());
  });

  it('liste okunamazsa kart hatayı gösterir', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/mal-kabul-satirlari': () => json(500, { kod: 'SUNUCU', mesaj: 'Deneme hatası.' }) });
    goster();
    expect(await screen.findByText('Mal kabuller ve irsaliyeler')).toBeTruthy();
    expect(await screen.findByText(/Deneme hatası/)).toBeTruthy();
  });
});
