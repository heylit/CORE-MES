import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MUHENDIS, OKUYAN, YONETICI, kayitYazmalari, kmAc, type TestKayitlari } from '../test-ortak.tsx';

// jsdom tuval çizmez; grafik kurulmaz, ekranın geri kalanı sınanır.
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const KAYITLAR: TestKayitlari = {
  spc: [{ _id: 's1', no: 'SER-2026-0001', tarih: '2026-01-02', parcaNo: 'P-1', ad: 'Çap', nominal: 10, alt: 0.05, ust: 0.05, degerler: [10, 10.01, 9.99, 10.02] }],
};

describe('Ölçüm analizi', () => {
  it('seriyi, ayrıntıyı ve önerileri gösterir', async () => {
    kmAc('olcum-analizi', YONETICI, KAYITLAR);
    expect((await screen.findAllByText('Çap')).length).toBeGreaterThan(0);
    expect(screen.getByText('Bireysel değerler (I) grafiği')).toBeTruthy();
    expect(screen.getByText(/en az 25/)).toBeTruthy();
  });

  it('seri silme yalnız yöneticide; okuyan ölçüm ekleyemez', async () => {
    kmAc('olcum-analizi', YONETICI, KAYITLAR);
    expect(await screen.findByRole('button', { name: /^Sil$/ })).toBeTruthy();
    cleanup();
    kmAc('olcum-analizi', MUHENDIS, KAYITLAR);
    await screen.findByText('Bireysel değerler (I) grafiği');
    expect(screen.queryByRole('button', { name: /^Sil$/ })).toBeNull();
    cleanup();
    kmAc('olcum-analizi', OKUYAN, KAYITLAR);
    await screen.findByText('Bireysel değerler (I) grafiği');
    expect(screen.queryByRole('button', { name: /Ölçüm serisi ekle/ })).toBeNull();
  });

  it('yapıştırılan değerleri sayı dizisi olarak kaydeder', async () => {
    const { yazmalar } = kmAc('olcum-analizi', YONETICI, {});
    fireEvent.click(await screen.findByRole('button', { name: /Ölçüm serisi ekle/ }));
    fireEvent.change(await screen.findByLabelText(/Parça no/), { target: { value: 'P-2' } });
    fireEvent.change(screen.getByLabelText(/Karakteristik/), { target: { value: 'Boy' } });
    fireEvent.change(screen.getByLabelText(/Nominal/), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Ölçülen değerler/), { target: { value: '20,01\n19,99; 20' } });
    expect(await screen.findByText('3 değer okundu.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'spc')).toHaveLength(1));
    expect((kayitYazmalari(yazmalar, 'spc')[0]!.govde as { govde: Record<string, unknown> }).govde).toMatchObject({ parcaNo: 'P-2', degerler: [20.01, 19.99, 20] });
  });
});
