import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import { api } from '../../../ortak/veri/api.ts';
import { Mrp } from './Mrp.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma rapor (1560).
const RAPOR: MrpIhtiyaciCevabi = {
  hesaplanan: '2026-11-01T09:00:00.000Z', stokGorunur: true, satinAlmaGorunur: true, urunsuzEmir: 1,
  satirlar: [
    { malzeme: { id: 1, kod: 'YM-1', ad: 'Gövde', tur: 'yarimamul', birim: 'adet' }, brut: 24, serbest: 8, acikSiparis: 0, net: 16, emniyetPayi: null,
      ihtiyacTarihi: '2026-11-04', eksikTarihi: '2026-11-04', emirler: ['E-1', 'E-2'], acilanlar: [], acildi: true },
    { malzeme: { id: 2, kod: 'HM-1', ad: 'Çubuk', tur: 'hammadde', birim: 'kg' }, brut: 186.5, serbest: 42, acikSiparis: 100, net: 44.5, emniyetPayi: 0,
      ihtiyacTarihi: '2026-11-03', eksikTarihi: '2026-11-05', emirler: ['E-1'], acilanlar: [{ id: 1, kod: 'YM-1' }], acildi: false },
    { malzeme: { id: 3, kod: 'TM-1', ad: 'Rulman', tur: 'ticari_mal', birim: 'adet' }, brut: 4, serbest: 10, acikSiparis: 0, net: 0, emniyetPayi: null,
      ihtiyacTarihi: null, eksikTarihi: null, emirler: ['E-3'], acilanlar: [], acildi: false },
  ],
};

// 1545 a: sunucu görmeyene alanları null yollar.
const gizle = (stok: boolean, sa: boolean): MrpIhtiyaciCevabi => ({ ...RAPOR, stokGorunur: stok, satinAlmaGorunur: sa, satirlar: RAPOR.satirlar.map((s) => ({
  ...s, serbest: stok ? s.serbest : null, emniyetPayi: stok ? s.emniyetPayi : null, acikSiparis: sa ? s.acikSiparis : null,
  net: stok && sa ? s.net : null, eksikTarihi: stok && sa ? s.eksikTarihi : null,
})) });

function ciz(cevap: MrpIhtiyaciCevabi | Error) {
  const get = vi.spyOn(api, 'get').mockImplementation(() => (cevap instanceof Error ? Promise.reject(cevap) : Promise.resolve(cevap)) as never);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Mrp /></QueryClientProvider></MemoryRouter>);
  return get;
}
const basliklar = () => within(screen.getByRole('table', { name: 'Malzeme ihtiyacı' })).getAllByRole('columnheader').map((h) => h.textContent);

describe('malzeme ihtiyacı ekranı', () => {
  it('yalnız MRP ucunu okur; tam yetkide bütün sütunlar, sayı kartları, ağaç ve eksik işaretleri', async () => {
    const get = ciz(RAPOR);
    expect(await screen.findByText('HM-1')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/plan/mrp-ihtiyaci');
    expect(basliklar()).toEqual(['Malzeme', 'Brüt', 'Serbest stok', 'Açık sipariş', 'Emniyet payı', 'Net ihtiyaç', 'İhtiyaç günü', 'Eksik günü', 'Emirler']);
    expect(screen.getByText('Ağaçla açıldı')).toBeTruthy();
    expect(screen.getByText('Ağaçtan: YM-1')).toBeTruthy();
    expect(screen.getByText('Üretilecek')).toBeTruthy();
    expect(screen.getByText('Eksik', { selector: '.tc-rozet' })).toBeTruthy();
    expect(screen.getByText('Yeterli')).toBeTruthy();
    expect(screen.getByText('planda değil')).toBeTruthy();
    expect(screen.getAllByText('05.11.2026').length).toBe(2); // ilk eksik günü kartı ve satır; ağaçla açılan yarı mamulün günü sayılmaz
    expect(screen.getByText(/1 açık emrin ürünü yok/)).toBeTruthy();
    expect(screen.queryByText(/okuma yetkiniz yok/)).toBeNull();
  });

  it('süzgeç ve arama listeyi daraltır', async () => {
    ciz(RAPOR);
    await screen.findByText('HM-1');
    fireEvent.click(screen.getByRole('button', { name: 'Eksik' }));
    expect(screen.queryByText('TM-1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    fireEvent.change(screen.getByLabelText('Malzeme ara'), { target: { value: 'rulman' } });
    expect(screen.getByText('TM-1')).toBeTruthy();
    expect(screen.queryByText('HM-1')).toBeNull();
    fireEvent.change(screen.getByLabelText('Malzeme ara'), { target: { value: 'yok-boyle' } });
    expect(screen.getByText('Süzgece uyan malzeme yok.')).toBeTruthy();
  });

  it('1545 a: yalnız planlama okuyan net, stok ve sipariş sütunlarını görmez; kart "Veri yok", eksik süzgeci yok', async () => {
    ciz(gizle(false, false));
    await screen.findByText('HM-1');
    expect(basliklar()).toEqual(['Malzeme', 'Brüt', 'İhtiyaç günü', 'Emirler']);
    expect(screen.getByText('Stok ve satın alma okuma yetkiniz yok.')).toBeTruthy();
    expect(screen.getAllByText('Veri yok').length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Eksik' })).toBeNull();
  });

  it('1545 a: satın alma görünmeyince açık sipariş ve net çıkar, stok kalır', async () => {
    ciz(gizle(true, false));
    await screen.findByText('HM-1');
    expect(basliklar()).toEqual(['Malzeme', 'Brüt', 'Serbest stok', 'Emniyet payı', 'İhtiyaç günü', 'Emirler']);
    expect(screen.getByText('Satın alma okuma yetkiniz yok.')).toBeTruthy();
  });

  it('boş rapor ve hata durumu', async () => {
    ciz({ ...RAPOR, urunsuzEmir: 0, satirlar: [] });
    expect(await screen.findByText('Açık emirlerde malzeme ihtiyacı yok.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    cleanup();
    ciz(new Error('ağ'));
    expect(await screen.findByText('Veri alınamadı')).toBeTruthy();
  });
});
