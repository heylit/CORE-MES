import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AltKartAilesiCevabi } from '#paylasilan/sozlesme/malzeme-alt-kart.ts';
import { json, sunucuKur, yeniIstemci, YAZAN, YONETICI } from '../test-ortak.tsx';
import type { Gezinti } from '../sekmeler.ts';
import type { KatalogKarti } from '../tipler.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { AltKartlarBolumu } from './AltKartlarBolumu.tsx';

// Kodlar ve adlar uydurmadır (ORN-).
const kart = (kimlik: string, no: number, kod: string, rev: string): KatalogKarti => ({
  kimlik, no, surum: 1, kayit: { id: kimlik, tur: 'mamul', com: { kod, ad: 'ORN Mil', birim: 'adet' }, g: { rev } },
} as unknown as KatalogKarti);
const ANA = kart('k1', 1, 'ORN-MM-00001', 'R01');
const R2 = kart('k2', 2, 'ORN-MM-00002', 'R02');
const AILE: AltKartAilesiCevabi = {
  ana: { kimlik: 'k1', no: 1, stokKodu: 'ORN-MM-00001', ad: 'ORN Mil', onayDurumu: 'aktif', altTur: null, etiket: 'R01', revDurumu: 'yururlukte' },
  revizyonlar: [{ kimlik: 'k2', no: 2, stokKodu: 'ORN-MM-00002', ad: 'ORN Mil', onayDurumu: 'aktif', altTur: 'revizyon', etiket: 'R02', revDurumu: 'taslak' }],
  alternatifler: [],
};

function ac(islemler: string[], yollar: Parameters<typeof sunucuKur>[1] = {}, aile: AltKartAilesiCevabi = AILE) {
  const kullanici = islemler.includes('malzemeler.onayla') ? YONETICI : YAZAN;
  const istekler = sunucuKur(kullanici, { 'GET /malzeme-katalogu-kartlari/k1/alt-kartlar': () => json(200, aile), ...yollar });
  const yeniKart = vi.fn();
  const git = { yeniKart } as unknown as Gezinti;
  const yetki = malzemeYetkisi((i) => islemler.includes(i), undefined);
  render(<QueryClientProvider client={yeniIstemci()}><AltKartlarBolumu kart={ANA} kartlar={[ANA, R2]} yetki={yetki} git={git} ac={vi.fn()} /></QueryClientProvider>);
  return { istekler, yeniKart };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Alt kartlar bölümü (3438 a)', () => {
  it('ailenin revizyonlarını durumuyla gösterir; Revizyon ekle yürürlükteki kartı kopyalar, ana karta bağlar', async () => {
    const { yeniKart } = ac(['sayfa.malzemeler', 'malzemeler.yaz']);
    expect(await screen.findByText('ORN-MM-00002')).toBeTruthy();
    expect(screen.getByText('Yürürlükte')).toBeTruthy();
    expect(screen.getByText('Yürürlüğe girmedi')).toBeTruthy();
    expect(screen.queryByText('Onay: taslak')).toBeNull();
    // Onay yetkisi olmayan yürürlüğe alamaz.
    expect(screen.queryByRole('button', { name: /Yürürlüğe al/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Revizyon ekle/ }));
    expect(yeniKart).toHaveBeenCalledWith({ revizyon: 'k1', ana: 'k1' });
  });

  it('yalnız okuyan aileyi görür; yazma ve yürürlüğe alma düğmesi çıkmaz', async () => {
    ac(['sayfa.malzemeler']);
    expect(await screen.findByText('ORN-MM-00002')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revizyon ekle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Var olan kartı revizyon olarak bağla/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bağı kaldır/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Yürürlüğe al/ })).toBeNull();
  });

  it('onaycı aktif revizyonu onay penceresinden sonra yürürlüğe alır; pencerede hangi kartın eskiye düştüğü yazar', async () => {
    const { istekler } = ac(['sayfa.malzemeler', 'malzemeler.yaz', 'malzemeler.onayla'], {
      'POST /malzeme-katalogu-kartlari/k2/yururluge-al': () => json(200, { id: 'k2' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Yürürlüğe al/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Revizyon yürürlüğe alınsın mı?' });
    expect(within(pencere).getByText(/ORN-MM-00002 \(R02\) yürürlüğe girer, ORN-MM-00001 \(R01\) eski olur/)).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Yürürlüğe al/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yürürlüğe al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol.endsWith('/k2/yururluge-al'))).toBe(true));
    expect(await screen.findByText(/yürürlüğe alındı/)).toBeTruthy();
  });

  it('var olan kart eski revizyon olarak bağlanır', async () => {
    const { istekler } = ac(['sayfa.malzemeler', 'malzemeler.yaz'], {
      'POST /malzeme-katalogu-kartlari/k2/revizyon-olarak-bagla': () => json(200, { id: 'k2' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Var olan kartı revizyon olarak bağla/ }));
    fireEvent.change(screen.getByLabelText('Kart kodu'), { target: { value: 'orn-mm-00002' } });
    fireEvent.change(screen.getByLabelText('Revizyon'), { target: { value: 'R00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')!.govde).toEqual({ anaKimlik: 'k1', etiket: 'R00', eski: true });
  });

  it('onaylanmamış revizyonda Yürürlüğe al, yürürlükteki revizyonda Bağı kaldır yok; onay durumu adıyla yazar', async () => {
    const aile: AltKartAilesiCevabi = {
      ...AILE,
      ana: { ...AILE.ana, revDurumu: 'eski' },
      revizyonlar: [
        { ...AILE.revizyonlar[0]!, revDurumu: 'yururlukte' },
        { kimlik: 'k3', no: 3, stokKodu: 'ORN-MM-00003', ad: 'ORN Mil', onayDurumu: 'taslak', altTur: 'revizyon', etiket: 'R03', revDurumu: 'taslak' },
      ],
    };
    ac(['sayfa.malzemeler', 'malzemeler.yaz', 'malzemeler.onayla'], {}, aile);
    const satir = async (kod: string) => within((await screen.findByText(kod)).closest('li')!);
    expect((await satir('ORN-MM-00003')).getByText('Onay: taslak')).toBeTruthy();
    expect((await satir('ORN-MM-00003')).queryByRole('button', { name: /Yürürlüğe al/ })).toBeNull();
    expect((await satir('ORN-MM-00003')).getByRole('button', { name: /Bağı kaldır/ })).toBeTruthy();
    expect((await satir('ORN-MM-00002')).queryByRole('button', { name: /Bağı kaldır/ })).toBeNull();
    expect((await satir('ORN-MM-00002')).queryByRole('button', { name: /Yürürlüğe al/ })).toBeNull();
    expect((await satir('ORN-MM-00001')).getByRole('button', { name: /Yürürlüğe al/ })).toBeTruthy();
  });

  it('Revizyon ekle ana kartı değil ailenin yürürlükteki kartını kopyalar', async () => {
    const aile: AltKartAilesiCevabi = { ...AILE, ana: { ...AILE.ana, revDurumu: 'eski' }, revizyonlar: [{ ...AILE.revizyonlar[0]!, revDurumu: 'yururlukte' }] };
    const { yeniKart } = ac(['sayfa.malzemeler', 'malzemeler.yaz'], {}, aile);
    fireEvent.click(await screen.findByRole('button', { name: /Revizyon ekle/ }));
    expect(yeniKart).toHaveBeenCalledWith({ revizyon: 'k2', ana: 'k1' });
  });
});
