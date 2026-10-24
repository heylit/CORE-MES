import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { lotAnahtari } from '../aql.ts';
import { MUAYENECI, MUHENDIS, OKUYAN, YONETICI, kayitYazmalari, kmAc, type TestKayitlari } from '../test-ortak.tsx';

// jsdom tuval çizmez; grafik kurulmaz, ekranın geri kalanı sınanır.
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const anahtar = lotAnahtari('P-1', '');
// Sentetik geçmiş: aynı parçada beş ardışık ret (sıkılaştırılmış sonra durduruldu).
const KAYITLAR: TestKayitlari = {
  lot: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ _id: `l${i}`, no: `LOT-2026-000${i}`, tarih: `2026-01-0${i}`, parcaNo: 'P-1', anahtar, karar: 'Ret', N: 100 })),
};

describe('Lot kabul', () => {
  it('sihirbazı, sıkılık durumunu ve kayıtları gösterir', async () => {
    kmAc('lot-kabul', YONETICI, KAYITLAR);
    expect(await screen.findByText('LOT-2026-0001')).toBeTruthy();
    expect(screen.getAllByText('Durduruldu').length).toBeGreaterThan(0);
  });

  it('yeniden başlatma onay işlemi ister; muayeneci görmez', async () => {
    kmAc('lot-kabul', MUHENDIS, KAYITLAR);
    expect(await screen.findByRole('button', { name: /Yeniden başlat/ })).toBeTruthy();
    cleanup();
    kmAc('lot-kabul', MUAYENECI, KAYITLAR);
    await screen.findByText('LOT-2026-0001');
    expect(screen.queryByRole('button', { name: /Yeniden başlat/ })).toBeNull();
  });

  it('yeniden başlatma reset kaydı yazar', async () => {
    const { yazmalar } = kmAc('lot-kabul', MUHENDIS, KAYITLAR);
    fireEvent.click(await screen.findByRole('button', { name: /Yeniden başlat/ }));
    const onay = await screen.findAllByRole('button', { name: 'Yeniden başlat' });
    fireEvent.click(onay[onay.length - 1]!);
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'lot')).toHaveLength(1));
    expect((kayitYazmalari(yazmalar, 'lot')[0]!.govde as { govde: Record<string, unknown> }).govde).toMatchObject({ tip: 'reset', anahtar });
  });

  it('silme yalnız yöneticide; okuyan yeni kayıt açamaz', async () => {
    kmAc('lot-kabul', YONETICI, KAYITLAR);
    await screen.findByText('LOT-2026-0001');
    expect(screen.getAllByRole('button', { name: /^Sil$/ }).length).toBe(7);
    cleanup();
    kmAc('lot-kabul', MUHENDIS, KAYITLAR);
    await screen.findByText('LOT-2026-0001');
    expect(screen.queryByRole('button', { name: /^Sil$/ })).toBeNull();
    cleanup();
    kmAc('lot-kabul', OKUYAN, KAYITLAR);
    await screen.findByText('LOT-2026-0001');
    expect(screen.queryByRole('button', { name: /Lot kabul kaydı/ })).toBeNull();
  });
});
