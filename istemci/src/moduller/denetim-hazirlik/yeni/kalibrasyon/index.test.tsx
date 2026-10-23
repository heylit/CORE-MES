import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { ayEkle, bugunTarihi, gunEkle } from '../tarih.ts';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import { Kalibrasyon } from './index.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

type Alet = OlcuAletleriCevabi['aletler'][number];
const alet = (no: string, last: string, st: Alet['st'] = 'aktif'): Alet => ({
  id: no, no, ad: `Deneme cihazı ${no}`, yer: 'Kalite', aralik: '0-25 mm', periyotGun: 360, per: 12, last, nx: '', st, res: last ? 'uygun' : '', cert: '', hist: [],
});
const t = bugunTarihi();
const aletler = [alet('OC-1', ayEkle(gunEkle(t, -10), -12)), alet('OC-2', ayEkle(gunEkle(t, 10), -12)), alet('OC-3', gunEkle(t, -30)), alet('OC-4', '', 'disi')];

describe('Kalibrasyon (salt okunur, 329 a)', () => {
  it('cihazlar Kalibrasyondan gelir; yazma düğmesi yok, satırda Kalibrasyonda aç', async () => {
    sahteSunucu({ depo: ornekDepo(), aletler });
    await baglamlaAc(<Kalibrasyon />, 'kalib');
    const tablo = await screen.findByRole('table', { name: 'Cihazlar' });
    expect(within(tablo).getAllByRole('row')).toHaveLength(5);
    for (const ad of [/^Kalibre edildi$/, /^Sil$/, /^Düzenle$/, /Excel'den yapıştır/]) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    const baglanti = within(tablo).getAllByRole('link', { name: 'Kalibrasyonda aç' })[0];
    expect(baglanti?.getAttribute('href')).toBe('/kalibrasyon');
    expect(screen.getByText('10 gün gecikti')).toBeTruthy();
  });

  it('sayı kartı ve süzgeç listeyi daraltır; takvim görünümü ayı çizer', async () => {
    sahteSunucu({ depo: ornekDepo(), aletler });
    await baglamlaAc(<Kalibrasyon />, 'kalib');
    await screen.findByRole('table', { name: 'Cihazlar' });
    fireEvent.click(screen.getByRole('button', { name: 'Gecikmiş' }));
    expect(within(screen.getByRole('table', { name: 'Cihazlar' })).getAllByRole('row')).toHaveLength(2);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cihaz ara' }), { target: { value: 'yok-boyle' } });
    expect(screen.getByText('Bu filtrede cihaz yok.')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cihaz ara' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Takvim' }));
    expect(await screen.findByRole('grid', { name: /kalibrasyon takvimi/ })).toBeTruthy();
  });

  it('cihaz yoksa boş durum Kalibrasyona yönlendirir; okuyucu da aynı ekranı görür', async () => {
    sahteSunucu({ depo: ornekDepo(), yazabilir: false, yonetici: false });
    await baglamlaAc(<Kalibrasyon />, 'kalib');
    expect(await screen.findByText('Cihaz listesi boş')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kalibrasyona git' }).getAttribute('href')).toBe('/kalibrasyon');
  });
});
