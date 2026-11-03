import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { BakiyeSatiri, KodCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OkutarakSayim } from './OkutarakSayim.tsx';
import { DEPOCU, OKUYUCU, json, sunucuKur } from './test-ortak.tsx';

// Okutarak sayım ekranı (1905): sentetik kayıtlar.
const bakiye = (malzemeId: number, partiId: number): BakiyeSatiri => ({
  id: malzemeId * 100 + partiId, malzemeId, malzemeAd: `Deneme ${malzemeId}`, konumId: 41, konumKod: 'A-01-1', partiId, partiEtiketi: `LT-${partiId}`,
  miktar: '10.000', ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'serbest',
});
const GOZ: KodCozCevabi = {
  tur: 'konum', bakiyeler: [bakiye(1, 7), bakiye(2, 8)],
  konum: { id: 41, kod: 'A-01-1', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 2, haritaGozId: null, haritaAlanId: null, surum: 1 },
};
const LOT: KodCozCevabi = {
  tur: 'lot', parti: { id: 7, lotNo: 'LT-7', etiket: 'LT-7' }, toplam: '10', bakiyeler: [],
  ozet: { id: 1, tur: 'hammadde', kod: 'HM-1', ad: 'Deneme 1', onayDurumu: 'onayli', kullanilabilir: true, birim: 'adet' },
};
const cozumler: Record<string, KodCozCevabi> = { 'LOC:A-01-1': GOZ, 'LOT:LT-7': LOT };

// Sayım ekranı yalnız Okut panelinin Say modudur (2022 b); motor burada panelsiz denenir.
function sayimAc() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><OkutarakSayim gomulu /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}

function kur() {
  // Kod çözme sorgu dizgisine göre cevaplanır; sunucuKur yol eşlemesi sorguyu ayırmaz.
  const istekler = sunucuKur(DEPOCU, {});
  vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
    const yol = String(adres).replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: DEPOCU });
    if (yol.startsWith('/stok/kod-coz')) {
      const kod = decodeURIComponent(yol.split('kod=')[1] ?? '');
      return json(200, cozumler[kod] ?? { tur: 'bilinmiyor', kod });
    }
    if (yol === '/stok/sayim') return json(200, { hareketIdler: [], farkSayisi: 1, onayaGiden: 1 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  });
  return istekler;
}
const okut = async (kod: string) => {
  const alan = await screen.findByLabelText('Kod');
  fireEvent.change(alan, { target: { value: kod } });
  fireEvent.submit(alan.closest('form')!);
  await waitFor(() => expect((alan as HTMLInputElement).value).toBe(''));
};

describe('Okutarak sayım (1905)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('göz ve lot okutulur, sayı artar; okutulmayan satır sorulup 0 olarak kaydedilir; sistem miktarı gösterilmez', async () => {
    const istekler = kur();
    sayimAc();
    await okut('LOC:A-01-1');
    expect(await screen.findByText('Göz A-01-1')).toBeTruthy();
    await okut('LOT:LT-7');
    await okut('LOTŞLT*7');
    await waitFor(() => expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('2'));
    expect(screen.queryByText('10')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Sayımı kaydet \(1 göz\)/ }));
    const onay = await screen.findByRole('dialog', { name: 'Okutulmayan satırlar' });
    expect(within(onay).getByText(/1 satır var/)).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/sayim')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/sayim')!.govde).toEqual({
      konumId: 41, satirlar: [{ malzemeId: 1, partiId: 7, sayilanMiktar: '2' }, { malzemeId: 2, partiId: 8, sayilanMiktar: '0' }],
    });
    expect(await screen.findByText(/1 fark eşiği aştı/)).toBeTruthy();
  });

  it('göz okutulmadan gelen lot ve tanınmayan kod eklenmez (reddedilen)', async () => {
    const istekler = kur();
    sayimAc();
    await okut('LOT:LT-7');
    expect(await screen.findByText('Önce göz etiketini okut')).toBeTruthy();
    await okut('XYZ:1');
    expect(await screen.findByText('Tanınmayan kod')).toBeTruthy();
    expect(screen.queryByLabelText('Sayılan Deneme 1')).toBeNull();
    expect((screen.getByRole('button', { name: /Sayımı kaydet/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.some((i) => i.yol === '/stok/sayim')).toBe(false);
  });

  it('hafızadan aktarılan kodlar sırayla eklenir; sonuncuyu geri al aktarımdan önceki hale döner', async () => {
    kur();
    sayimAc();
    fireEvent.click(await screen.findByRole('button', { name: /Hafızadan aktar/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Hafızadan aktar' });
    fireEvent.change(within(pencere).getByLabelText('Aktarılan kodlar'), { target: { value: 'LOC:A-01-1\r\nLOT:LT-7\r\nLOT:LT-7\r\nLOT:LT-7\r\nXYZ:9\r\n' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Listeye ekle (5)' }));
    expect(await screen.findByText('5 okutma aktarıldı')).toBeTruthy();
    expect(screen.getByText(/1 kod eklenmedi/)).toBeTruthy();
    expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: /Sonuncuyu geri al/ }));
    await waitFor(() => expect(screen.queryByLabelText('Sayılan Deneme 1')).toBeNull());
  });

  it('1909 komut barkodlari: miktar son satira yazilir, arti ve geri al calisir; Kaydet onayi sorar, Evet hizli okutmayla kaydeder', async () => {
    const istekler = kur();
    sayimAc();
    await okut('LOC:A-01-1');
    await okut('CMD:MIKTAR:5');
    expect(await screen.findByText('Önce bir lot ya da malzeme okut')).toBeTruthy();
    await okut('LOT:LT-7');
    await waitFor(() => expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('1'));
    await okut('CMDŞMIKTARŞ12');
    await waitFor(() => expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('12'));
    await okut('CMD:ARTI');
    await waitFor(() => expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('13'));
    await okut('CMD:EVET');
    expect(await screen.findByText('Bu ekranda bu komut yok')).toBeTruthy();
    await okut('CMD:KAYDET');
    const onay = await screen.findByRole('dialog', { name: 'Okutulmayan satırlar' });
    const vazgec = within(onay).getByRole('button', { name: 'Vazgeç' });
    vazgec.focus();
    for (const t of 'CMD:EVET') fireEvent.keyDown(vazgec, { key: t });
    expect(fireEvent.keyDown(vazgec, { key: 'Enter' })).toBe(false);
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim')?.govde).toEqual({
      konumId: 41, satirlar: [{ malzemeId: 1, partiId: 7, sayilanMiktar: '13' }, { malzemeId: 2, partiId: 8, sayilanMiktar: '0' }],
    }));
  });

  it('1909: Geri al komutu son okutmayi geri alir; Vazgec komutu onayi kapatir, kayit yapilmaz', async () => {
    const istekler = kur();
    sayimAc();
    await okut('LOC:A-01-1');
    await okut('LOT:LT-7');
    await okut('LOT:LT-7');
    await waitFor(() => expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('2'));
    await okut('CMD:GERI-AL');
    await waitFor(() => expect((screen.getByLabelText('Sayılan Deneme 1') as HTMLInputElement).value).toBe('1'));
    await okut('CMD:KAYDET');
    const onay = await screen.findByRole('dialog', { name: 'Okutulmayan satırlar' });
    for (const t of 'CMD:VAZGEC') fireEvent.keyDown(document.body, { key: t });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(() => expect(onay.isConnected).toBe(false));
    expect(istekler.some((i) => i.yol === '/stok/sayim')).toBe(false);
  });

  it('sayım yetkisi olmayan ekranı kullanamaz (reddedilen)', async () => {
    sunucuKur(OKUYUCU, {});
    sayimAc();
    expect(await screen.findByText(/stok sayım yetkisi gerekir/)).toBeTruthy();
    expect(screen.queryByLabelText('Kod')).toBeNull();
  });
});
