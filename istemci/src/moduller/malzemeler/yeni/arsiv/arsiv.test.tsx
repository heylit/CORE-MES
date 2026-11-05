import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ArsivKarti, ArsivKartiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { OKUYAN, YONETICI, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';
import { izDurumu } from './index.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ADRES = '/malzemeler/arsiv';
const kart = (kimlik: string, stokKodu: string, kesinAdet: number | null, olasiAdet: number | null): ArsivKarti => ({
  kimlik, no: 1, stokKodu, ad: `Deneme ${stokKodu}`, tur: 'hammadde', silen: { id: 1, ad: 'Deneme Yönetici' },
  silinme: '2026-11-05T08:00:00.000Z', logoyaGitti: false, kesinAdet, olasiAdet,
});
const BAGSIZ = kart('a1', 'HM-DNM-00001', 0, 0);
const BAGLI = kart('a2', 'HM-DNM-00002', 1, 0);
const IZLI = kart('a3', 'HM-DNM-00003', 0, 2);
const ayrintilar: Record<string, ArsivKartiCevabi> = {
  a1: { kart: BAGSIZ, izler: [] },
  a2: { kart: BAGLI, izler: [{ modul: 'İstasyonlar', kayit: 'Aparat kapasitesi', tur: 'kesin', adet: 1, ornek: '4' }] },
  a3: { kart: IZLI, izler: [{ modul: 'Plan', kayit: 'Planlama kaydı', tur: 'olasi', adet: 2, ornek: null }] },
};
const yollar = (ek: Record<string, (g: unknown, yol: string) => Response> = {}) => ({
  'GET /malzeme-arsivi': () => json(200, { kartlar: [BAGSIZ, BAGLI, IZLI] }),
  ...Object.fromEntries(Object.entries(ayrintilar).map(([k, c]) => [`GET /malzeme-arsivi/${k}`, () => json(200, c)])),
  ...ek,
});
const kartDugmesi = (kod: string) => screen.findByRole('button', { name: new RegExp(kod) });

describe('Malzemeler Arşiv (2114c)', () => {
  test('izDurumu: sayım yoksa bilinmiyor, kesin bağ olası izden önce gelir', () => {
    expect(izDurumu({ kesinAdet: null, olasiAdet: null })).toBe('bilinmiyor');
    expect(izDurumu({ kesinAdet: 1, olasiAdet: 3 })).toBe('kesin');
    expect(izDurumu({ kesinAdet: 0, olasiAdet: 1 })).toBe('olasi');
    expect(izDurumu({ kesinAdet: 0, olasiAdet: 0 })).toBe('bagsiz');
  });

  test('liste rozetlerle gelir, süzgeç daraltır; bağlı kartta bağlar modül adıyla görünür ve kalıcı silme kapalıdır', async () => {
    sunucuKur(YONETICI, yollar());
    yeniEkranAc(ADRES);
    expect(await screen.findByText('3 kart')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kesin bağı var' }));
    expect(screen.getByText('1 kart')).toBeTruthy();
    fireEvent.click(await kartDugmesi('HM-DNM-00002'));
    const ayrinti = screen.getByRole('region', { name: 'Kartın bağları' });
    expect(await within(ayrinti).findByText('Aparat kapasitesi')).toBeTruthy();
    expect(within(ayrinti).getByText('İstasyonlar')).toBeTruthy();
    expect((within(ayrinti).getByRole('button', { name: 'Kalıcı sil' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('bağı olmayan kart stok kodu yazılınca kalıcı silinir; yanlış kodla düğme kapalı kalır', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-arsivi/a1/kalici-sil': () => json(200, { id: 'a1' }) }));
    yeniEkranAc(ADRES);
    fireEvent.click(await kartDugmesi('HM-DNM-00001'));
    fireEvent.click(await screen.findByRole('button', { name: 'Kalıcı sil' }));
    const pencere = await screen.findByRole('dialog');
    const sil = within(pencere).getByRole('button', { name: 'Kalıcı sil' }) as HTMLButtonElement;
    const kutu = within(pencere).getByLabelText('Onaylamak için stok kodunu yazın');
    fireEvent.change(kutu, { target: { value: 'HM-DNM-00009' } });
    expect(sil.disabled).toBe(true);
    fireEvent.change(kutu, { target: { value: 'HM-DNM-00001' } });
    fireEvent.click(sil);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/malzeme-arsivi/a1/kalici-sil')).toBe(true));
    expect(istekler.find((i) => i.yol === '/malzeme-arsivi/a1/kalici-sil')?.govde).toEqual({ stokKodu: 'HM-DNM-00001' });
  });

  test('geri getirme onaycıda istek atar; yalnız okuyan düğme görmez', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-arsivi/a3/geri-getir': () => json(200, { id: 'a3' }) }));
    yeniEkranAc(ADRES);
    fireEvent.click(await kartDugmesi('HM-DNM-00003'));
    fireEvent.click(await screen.findByRole('button', { name: 'Kataloğa geri getir' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-arsivi/a3/geri-getir')).toBe(true));
    cleanup();
    sunucuKur(OKUYAN, yollar());
    yeniEkranAc(ADRES);
    fireEvent.click(await kartDugmesi('HM-DNM-00003'));
    expect(await screen.findByText('Geri getirme ve kalıcı silme onay yetkisi isteyen işlemlerdir.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kataloğa geri getir' })).toBeNull();
  });
});
