import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, sunucuKur, yeniEmirAc, YONETICI } from '../test-ortak.tsx';
import { gecmisTeslimMi } from './UretimEmirleri.tsx';

// K19 a (UE-6): bugünden önceki teslimle emir uyarı ve onay penceresiyle açılır; engel yoktur. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const onay = () => screen.findByRole('dialog', { name: 'Teslim tarihi geçmişte' });
const onayAcik = () => screen.queryByRole('dialog', { name: 'Teslim tarihi geçmişte' }) !== null;
const acmalar = (istekler: readonly { yontem: string; yol: string }[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/adimli-emirler/rotasiz');

describe('geçmiş teslim (K19 a)', () => {
  it('yalnız bugünden önceki geçerli gün geçmiştir', () => {
    expect(gecmisTeslimMi('2026-11-01', '2026-11-02')).toBe(true);
    expect(gecmisTeslimMi('2026-11-02', '2026-11-02')).toBe(false);
    expect(gecmisTeslimMi('2026-12-01', '2026-11-02')).toBe(false);
    expect(gecmisTeslimMi('', '2026-11-02')).toBe(false);
  });

  async function formAc() {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: {
        'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [] }),
        'POST /adimli-emirler/rotasiz': () => json(200, { uretimEmriId: 62 }),
      },
    });
    // 3039: emir Üretim Emirleri'nin yeni emir penceresinde açılır; onay penceresi onun üstüne gelir.
    yeniEmirAc();
    const form = await screen.findByRole('dialog', { name: 'Yeni üretim emri' });
    fireEvent.change(await within(form).findByLabelText('Miktar'), { target: { value: '25' } });
    return { istekler, form };
  }

  it('geçmiş teslimde uyarı görünür, pencere sorar; vazgeçince emir açılmaz, onaylayınca açılır', async () => {
    const { istekler, form } = await formAc();
    fireEvent.change(within(form).getByLabelText('Teslim'), { target: { value: '2020-01-01' } });
    expect(within(form).getByText('Teslim tarihi geçmişte: emir açılınca gecikmiş görünür.')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    const pencere = await onay();
    expect(within(pencere).getByText(/bugünden önce/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(onayAcik()).toBe(false); });
    expect(acmalar(istekler)).toHaveLength(0);
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    fireEvent.click(within(await onay()).getByRole('button', { name: 'Yine de aç' }));
    await waitFor(() => { expect(acmalar(istekler)).toHaveLength(1); });
  });

  it('bugün ya da sonrası teslimde pencere çıkmaz, emir doğrudan açılır', async () => {
    const { istekler, form } = await formAc();
    expect(within(form).queryByText(/Teslim tarihi geçmişte/)).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => { expect(acmalar(istekler)).toHaveLength(1); });
    expect(onayAcik()).toBe(false);
  });
});
