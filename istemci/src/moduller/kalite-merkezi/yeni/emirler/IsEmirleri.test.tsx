import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { MUAYENECI, OKUYAN, kmAc, type TestKayitlari } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const KAYITLAR: TestKayitlari = {
  emir: [
    { _id: 'e1', no: 'IE-1', tip: 'İş emri', durum: 'Açık', parcaNo: 'P-1', termin: '2026-02-01' },
    { _id: 'e2', no: 'IE-2', tip: 'İş emri', durum: 'Kapalı', parcaNo: 'P-2' },
  ],
  lot: [{ _id: 'l1', no: 'LOT-2026-0001', emir: 'IE-1', tarih: '2026-01-03', karar: 'Kabul', N: 10 }],
};

describe('İş emirleri', () => {
  it('açık emirleri listeler, detayda izlenebilirliği gösterir', async () => {
    kmAc('is-emirleri', MUAYENECI, KAYITLAR);
    expect(await screen.findByText('IE-1')).toBeTruthy();
    expect(screen.queryByText('IE-2')).toBeNull();
    fireEvent.click(screen.getByText('IE-1'));
    expect(await screen.findByText('LOT-2026-0001')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lot kabul/ })).toBeTruthy();
  });

  it('okuyan ekleyemez, aktaramaz, detayda lot kabul açamaz', async () => {
    kmAc('is-emirleri', OKUYAN, KAYITLAR);
    await screen.findByText('IE-1');
    expect(screen.queryByRole('button', { name: /^Ekle$/ })).toBeNull();
    expect(screen.queryByText("CSV'den aktar")).toBeNull();
    fireEvent.click(screen.getByText('IE-1'));
    await screen.findByText('LOT-2026-0001');
    expect(screen.queryByRole('button', { name: /Lot kabul/ })).toBeNull();
  });
});
