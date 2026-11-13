import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { AcikSiparisSatirlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';
import { BEKLEYEN_SAYFA_BOYU, TerminalMalKabul } from './disari.ts';

// 2013 a, 2027: terminaldeki mal kabul Stok'un kaydını yazar; stok.giris olmayan kişi listeyi de görmez.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['sayfa.uretim-terminali', 'stok.istek'] };
const OZET = { id: 901, tur: 'hammadde', kod: 'HM-001', ad: 'Deneme çubuk', onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } as const;
const satir = (id: number, malzemeId: number | null, kalemAdi: string, malzemeTur: 'hammadde' | 'hizmet' = 'hammadde') => ({
  id, siparisNo: `SAS-${id}`, talepNo: `TLP-${id}`, tedarikciAdi: 'Deneme tedarikçi', malzemeId, malzemeTur, kalemAdi, miktar: '12.000', kalanMiktar: '12.000',
  birim: 'adet', beklenenTeslim: null,
});
const ACIK: AcikSiparisSatirlariCevabi = { satirlar: [satir(31, 901, 'Deneme çubuk'), satir(32, null, 'Kaplama hizmeti', 'hizmet')] };
const BELGE = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-11-03T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null };

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><TerminalMalKabul /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}

describe('terminal mal kabulü (2027)', () => {
  it('depo kullanıcısı bekleyen kabulleri görür (hizmet satırı yok); okutulan malzeme açık siparişle Stok mal kabulüne yazılır', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/acik-siparis-satirlari': () => json(200, ACIK),
      'GET /stok/kod-coz': () => json(200, { tur: 'malzeme', ozet: OZET, toplam: '0', bakiyeler: [] }),
      'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [1] }),
    });
    ac();
    const liste = await screen.findByRole('list', { name: 'Bekleyen kabuller' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
    expect(within(liste).getByText('Deneme çubuk')).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText(/^Kod/)[0]!, { target: { value: 'HM-001' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Bul' })[0]!);
    fireEvent.change(await screen.findByLabelText(/^Sayılan miktar/), { target: { value: '12' } });
    const gonder = screen.getByRole('button', { name: 'Mal kabul alanına teslim al' });
    await waitFor(() => expect((gonder as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(gonder);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST' && i.yol === '/stok/mal-kabul')?.govde).toMatchObject({
      tur: 'satin_alma', satirlar: [{ malzemeId: 901, siparisSatirId: 31 }],
    }));
  });

  it('3215 c: okutulan hammaddenin kesit çizimi kabul formunun üstünde görünür; kesiti olmayan kartta çizim yok', async () => {
    const coz = (kesit: unknown) => ({ 'GET /stok/acik-siparis-satirlari': () => json(200, ACIK), 'GET /stok/kod-coz': () => json(200, { tur: 'malzeme', ozet: OZET, toplam: '0', bakiyeler: [], kesit }) });
    sunucuKur(DEPOCU, coz({ form: 'cubuk', olcu: { d: 42, l: 3000 } }));
    ac();
    fireEvent.change((await screen.findAllByLabelText(/^Kod/))[0]!, { target: { value: 'HM-001' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Bul' })[0]!);
    expect(await screen.findByRole('img', { name: 'Ölçülü kesit çizimi: Ø42 × 3000' })).toBeTruthy();
    expect(screen.getByLabelText(/^Sayılan miktar/)).toBeTruthy();
    cleanup();
    sunucuKur(DEPOCU, coz(null));
    ac();
    fireEvent.change((await screen.findAllByLabelText(/^Kod/))[0]!, { target: { value: 'HM-001' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Bul' })[0]!);
    await screen.findByLabelText(/^Sayılan miktar/);
    expect(screen.queryByRole('img', { name: /Ölçülü kesit çizimi/ })).toBeNull();
  });

  it('bekleyen kabuller sayfalanır, liste kaymaz', async () => {
    const cok = { satirlar: Array.from({ length: BEKLEYEN_SAYFA_BOYU + 2 }, (_, i) => satir(100 + i, 900 + i, `Kalem ${i + 1}`)) };
    sunucuKur(DEPOCU, { 'GET /stok/acik-siparis-satirlari': () => json(200, cok) });
    ac();
    const liste = await screen.findByRole('list', { name: 'Bekleyen kabuller' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(BEKLEYEN_SAYFA_BOYU);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    expect(within(screen.getByRole('list', { name: 'Bekleyen kabuller' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('stok.giris olmayan kişi (operatör) mal kabul göremez; Stok\'a istek gitmez', async () => {
    const istekler = sunucuKur(OPERATOR, { 'GET /stok/acik-siparis-satirlari': () => json(200, ACIK) });
    ac();
    expect(await screen.findByText('Mal kabul için stok girişi yetkisi gerekir.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/oturum')).toBe(true);
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
  });
});
