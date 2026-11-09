import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

// 2565: yeni emir formunda Miktar tam sayıdır; kesirli adet gönderilmez, form söyler. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const acmalar = (istekler: readonly { yontem: string; yol: string }[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/adimli-emirler/rotasiz');

async function formAc() {
  const istekler = sunucuKur(YONETICI, {
    yazmalar: {
      'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [] }),
      'POST /adimli-emirler/rotasiz': () => json(200, { uretimEmriId: 62 }),
    },
  });
  rrAc();
  const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
  fireEvent.click(await within(b).findByRole('button', { name: 'Yeni üretim emri' }));
  return { istekler, form: within(b).getByRole('region', { name: 'Yeni üretim emri' }) };
}

describe('yeni emir miktarı (2565)', () => {
  it('Miktar kutusu sayı klavyesi ister', async () => {
    const { form } = await formAc();
    expect(within(form).getByLabelText('Miktar').getAttribute('inputmode')).toBe('numeric');
  });

  it('kesirli miktar emir açmaz ve "Miktar tam sayı olmalı." der; tam sayı açar', async () => {
    const { istekler, form } = await formAc();
    const miktar = within(form).getByLabelText('Miktar');
    fireEvent.change(miktar, { target: { value: '12,5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    expect(await within(form).findByText('Miktar tam sayı olmalı.')).toBeTruthy();
    expect(acmalar(istekler)).toHaveLength(0);
    fireEvent.change(miktar, { target: { value: '12' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => { expect(acmalar(istekler)).toHaveLength(1); });
  });
});
