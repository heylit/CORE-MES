import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MUAYENECI, MUHENDIS, OKUYAN, YONETICI, kayitYazmalari, kmAc, type TestKayitlari } from '../test-ortak.tsx';

// jsdom tuval çizmez; grafik kurulmaz, ekranın geri kalanı sınanır.
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

// Sentetik kayıtlar: biri kilitli (sonuçlu), biri ölçümü süren.
const KAYITLAR: TestKayitlari = {
  insp: [
    { _id: 'i1', no: 'MUA-2026-0001', tur: 'Final', tarih: '2026-01-05', parcaNo: 'P-1', sonuc: 'Kabul', chars: [{ ad: 'Çap', nominal: '10', olcum: '10', sonuc: 'OK' }] },
    { _id: 'i2', no: 'MUA-2026-0002', tur: 'FAI', tarih: '2026-01-06', parcaNo: 'P-2', sonuc: 'Devam ediyor', chars: [] },
  ],
  dev: [{ _id: 'd1', kod: 'KMP-1', ad: 'Kumpas', sonKal: '2026-01-01', periyot: 120 }],
};

describe('Muayeneler', () => {
  it('listeyi ve ilk geçiş grafiğini gösterir', async () => {
    kmAc('muayeneler', YONETICI, KAYITLAR);
    expect(await screen.findByText('MUA-2026-0001')).toBeTruthy();
    expect(screen.getByText('Kapı bazında ilk geçiş oranı')).toBeTruthy();
  });

  it('silme yalnız yöneticide görünür', async () => {
    kmAc('muayeneler', YONETICI, KAYITLAR);
    await screen.findByText('MUA-2026-0001');
    expect(screen.getAllByRole('button', { name: /Sil/ }).length).toBeGreaterThan(0);
    cleanup();
    kmAc('muayeneler', MUHENDIS, KAYITLAR);
    await screen.findByText('MUA-2026-0001');
    expect(screen.queryByRole('button', { name: /^Sil$/ })).toBeNull();
  });

  it('muayeneci kaydeder ama silemez; okuyan kayıt düğmelerini görmez', async () => {
    kmAc('muayeneler', MUAYENECI, KAYITLAR);
    expect(await screen.findByRole('button', { name: /Muayene kaydet/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Sil$/ })).toBeNull();
    cleanup();
    kmAc('muayeneler', OKUYAN, KAYITLAR);
    await screen.findByText('MUA-2026-0001');
    expect(screen.queryByRole('button', { name: /Muayene kaydet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
  });

  it('kilitli kaydı muayeneci düzenleyemez, mühendis gerekçeyle açar', async () => {
    kmAc('muayeneler', MUAYENECI, KAYITLAR);
    await screen.findByText('MUA-2026-0001');
    fireEvent.click(screen.getAllByRole('button', { name: /Düzenle/ })[1]!);
    expect(await screen.findByText(/kilitli/)).toBeTruthy();
    cleanup();
    kmAc('muayeneler', MUHENDIS, KAYITLAR);
    await screen.findByText('MUA-2026-0001');
    fireEvent.click(screen.getAllByRole('button', { name: /Düzenle/ })[1]!);
    expect(await screen.findByText(/Gerekçe/)).toBeTruthy();
  });

  it('yeni muayeneyi ölçümle kaydeder (tüm alanlar kipi)', async () => {
    localStorage.setItem('kym-me', JSON.stringify({ formMode: 'liste' }));
    const { yazmalar } = kmAc('muayeneler', YONETICI, KAYITLAR);
    fireEvent.click(await screen.findByRole('button', { name: /Muayene kaydet/ }));
    fireEvent.change(await screen.findByLabelText(/Parça no/), { target: { value: 'P-9' } });
    fireEvent.change(screen.getByLabelText(/Muayeneci/), { target: { value: 'Deneme Kişi' } });
    fireEvent.change(screen.getByLabelText(/Revizyon/), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /Ölçümler/ }));
    fireEvent.change(screen.getAllByLabelText(/Karakteristik/)[0]!, { target: { value: 'Boy' } });
    fireEvent.change(screen.getAllByLabelText(/Nominal/)[0]!, { target: { value: '20' } });
    fireEvent.change(screen.getAllByLabelText(/Ölçülen/)[0]!, { target: { value: '20' } });
    fireEvent.change(screen.getAllByLabelText(/Cihaz/)[0]!, { target: { value: 'd1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'insp')).toHaveLength(1));
    const govde = (kayitYazmalari(yazmalar, 'insp')[0]!.govde as { govde: Record<string, unknown> }).govde;
    expect(govde).toMatchObject({ parcaNo: 'P-9', tur: 'Giriş', chars: [{ ad: 'Boy', sonuc: 'OK' }] });
    expect(govde.satirlar).toBeUndefined();
  });
  it('tek tek sor kipinde FAI nedeni ve kapsamı ayrı sorulur, yalnız FAI türünde', async () => {
    kmAc('muayeneler', YONETICI, KAYITLAR);
    fireEvent.click(await screen.findByRole('button', { name: /Muayene kaydet/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Özet' }));
    expect(screen.queryByRole('button', { name: /FAI nedeni/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Muayene türü/ }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /FAI$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Özet' }));
    expect(await screen.findByRole('button', { name: /FAI nedeni/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Kapsam/ })).toBeTruthy();
  });
  it('tüm alanlar kipinde FAI nedeni ve kapsamı yalnız FAI türünde görünür', async () => {
    localStorage.setItem('kym-me', JSON.stringify({ formMode: 'liste' }));
    kmAc('muayeneler', YONETICI, KAYITLAR);
    fireEvent.click(await screen.findByRole('button', { name: /Muayene kaydet/ }));
    fireEvent.change(await screen.findByLabelText(/Muayene türü/), { target: { value: 'Giriş' } });
    expect(screen.queryByLabelText(/FAI nedeni/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Muayene türü/), { target: { value: 'FAI' } });
    expect(await screen.findByLabelText(/FAI nedeni/)).toBeTruthy();
    expect(screen.getByLabelText(/^Kapsam/)).toBeTruthy();
  });
});
