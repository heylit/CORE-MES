import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { gecmisTeslimMi } from './UretimEmirleri.tsx';

// K19 a (UE-6): bugünden önceki teslimle emir uyarı ve onay penceresiyle açılır; engel yoktur. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bolum = (ad: string) => screen.findByRole('region', { name: ad });
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
    rrAc();
    const b = await bolum('Üretim emirleri');
    fireEvent.click(await within(b).findByRole('button', { name: 'Yeni üretim emri' }));
    const form = within(b).getByRole('region', { name: 'Yeni üretim emri' });
    fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '25' } });
    return { istekler, form };
  }

  it('geçmiş teslimde uyarı görünür, pencere sorar; vazgeçince emir açılmaz, onaylayınca açılır', async () => {
    const { istekler, form } = await formAc();
    fireEvent.change(within(form).getByLabelText('Teslim'), { target: { value: '2020-01-01' } });
    expect(within(form).getByText('Teslim tarihi geçmişte: emir açılınca gecikmiş görünür.')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/bugünden önce/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(acmalar(istekler)).toHaveLength(0);
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yine de aç' }));
    await waitFor(() => { expect(acmalar(istekler)).toHaveLength(1); });
  });

  it('bugün ya da sonrası teslimde pencere çıkmaz, emir doğrudan açılır', async () => {
    const { istekler, form } = await formAc();
    expect(within(form).queryByText(/Teslim tarihi geçmişte/)).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => { expect(acmalar(istekler)).toHaveLength(1); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
