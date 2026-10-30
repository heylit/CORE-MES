import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { SepetSatiri } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Birakma } from './TasimaSepeti.tsx';
import type { OkutHedefi } from './okut-akisi.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const satir = (id: number, miktar: string): SepetSatiri => ({
  id, malzemeId: 900 + id, malzemeAd: `Deneme ${id}`, malzemeKod: `HM-${id}`, kaynakKonumId: 5, kaynakKonumKod: 'KABUL',
  partiId: null, partiEtiketi: null, miktar, mevcut: miktar, eklenme: '2026-10-30T10:00:00+03:00',
});
const GOZ: OkutHedefi = { konumId: 30, kod: 'A-01-01', ad: null, tur: 'raf_gozu', istasyonId: null };
const ISTASYON: OkutHedefi = { konumId: 21, kod: 'T2', ad: 'Torna 2', tur: 'istasyon', istasyonId: 2 };

function ciz(kullanici: Kullanici, hedef: OkutHedefi, satirlar: SepetSatiri[], yollar: Record<string, (govde: unknown) => Response>) {
  const istekler = sunucuKur(kullanici, yollar);
  const bitti = vi.fn();
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // Panel oturum yüklenmişken açılır; taşıma yetkisi ilk tıklamada bilinir.
  istemci.setQueryData(anahtarlar.oturum, kullanici);
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Birakma hedef={hedef} satirlar={satirlar} bitti={bitti} vazgec={() => {}} /></BildirimSaglayici></QueryClientProvider>);
  return { istekler, bitti };
}
const satiri = (ad: string) => screen.getByText(ad).closest('li')!;

describe('Taşıma sepeti bırakma (1338 a)', () => {
  it('istasyona parçalı bırakma: azaltılan satır miktarla gider, işareti kaldırılan gitmez', async () => {
    const { istekler, bitti } = ciz(OPERATOR, ISTASYON, [satir(1, '4.000'), satir(2, '1.000')], {
      'POST /stok/sepet/gonder': () => json(200, { teslimler: [{ satirId: 1, teslimNo: 'TS-000009' }], kalanlar: [] }),
    });
    fireEvent.change(within(satiri('Deneme 1')).getByRole('textbox', { name: /Miktar/ }), { target: { value: '1,5' } });
    expect(within(satiri('Deneme 1')).getByText('Parçalı: kalan sepette kalır')).toBeTruthy();
    fireEvent.click(within(satiri('Deneme 2')).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '1 kalemi bırak' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/gonder')?.govde).toMatchObject({
      satirlar: [{ satirId: 1, hedef: { istasyonId: 2 }, miktar: '1.5' }], aliciKodu: null,
    }));
    await waitFor(() => expect(bitti).toHaveBeenCalled());
  });

  it('depocu raf gözüne parçalı taşır: taşıma ucuyla yazar, sepet satırı kalanla güncellenir', async () => {
    const { istekler } = ciz(DEPOCU, GOZ, [satir(1, '4.000')], {
      'POST /stok/tasima': () => json(200, { hareketIdler: [3] }),
      'POST /stok/sepet/satirlar/1/degistir': () => json(200, { satirlar: [] }),
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Miktar/ }), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: '1 kalemi bırak' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/satirlar/1/degistir')?.govde).toEqual({ miktar: '2.5' }));
    expect(istekler.find((i) => i.yol === '/stok/tasima')?.govde).toMatchObject({ malzemeId: 901, kaynakKonumId: 5, hedefKonumId: 30, miktar: '1.5' });
    expect(istekler.some((i) => i.yol === '/stok/sepet/gonder')).toBe(false);
  });

  it('reddedilen satır nedeniyle söylenir, ekran kapanmaz', async () => {
    const { bitti } = ciz(OPERATOR, ISTASYON, [satir(1, '4.000')], {
      'POST /stok/sepet/gonder': () => json(200, { teslimler: [], kalanlar: [{ satirId: 1, neden: 'Kaynakta yetmez.' }] }),
    });
    fireEvent.click(screen.getByRole('button', { name: '1 kalemi bırak' }));
    expect(await screen.findByText('Deneme 1: Kaynakta yetmez.')).toBeTruthy();
    expect(bitti).not.toHaveBeenCalled();
  });
});
