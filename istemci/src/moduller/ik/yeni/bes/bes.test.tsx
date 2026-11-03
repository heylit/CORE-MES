import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { IK_OKUYAN, ikAc } from '../test-ortak.tsx';
import type { BesCevabi } from './veri.ts';

beforeAll(async () => { await Promise.all([import('../IkYeni.tsx'), import('./index.tsx')]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Uydurma örnek: ornekVeri'deki kişiler (emp_a, emp_b; emp_c işten ayrılmış).
const hareket = (id: number, personel: string, tur: string, tarih: string, ek: Record<string, unknown> = {}) =>
  ({ id, personel, tur, tarih, oran: null, sirket: null, aciklama: null, iptal: false, surum: 1, yazan: 'Deneme Yonetici', ...ek });
const BES = { hareketler: [
  hareket(1, 'emp_a', 'otomatik_katilim', '2020-01-06', { oran: 3 }),
  hareket(2, 'emp_b', 'otomatik_katilim', '2023-03-01', { oran: 3 }),
  hareket(3, 'emp_b', 'ayrilma', '2024-01-10'),
] } as BesCevabi;
const okumalar = { '/ik/bes': () => BES };

describe('BES takibi', () => {
  it('BES\'te olanları ve çıkanları tarihleriyle listeler, durumla süzer', async () => {
    ikAc('/ik/bes', { okumalar });
    expect(await screen.findByRole('heading', { name: 'BES' })).toBeTruthy();
    const tablo = await screen.findByRole('table', { name: 'BES durumu' });
    expect(await within(tablo).findByText('Ayşe Örnek')).toBeTruthy();
    expect(within(tablo).getByText('Mehmet Deneme')).toBeTruthy();
    expect(within(tablo).getByText('10.01.2024')).toBeTruthy();
    expect(within(tablo).queryByText('Can Sınama')).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Durum' })).getByRole('button', { name: "BES'ten çıkanlar" }));
    expect(within(tablo).queryByText('Ayşe Örnek')).toBeNull();
    expect(within(tablo).getByText('Mehmet Deneme')).toBeTruthy();
  });

  it('yazma yetkisi olan hareket girer; gövdede zaman ve yazan yoktur', async () => {
    const { yazmalar } = ikAc('/ik/bes', { okumalar });
    fireEvent.click(await screen.findByRole('button', { name: 'BES hareketi gir' }));
    const form = await screen.findByRole('form', { name: 'BES hareketi gir' });
    fireEvent.change(within(form).getByLabelText(/Personel/), { target: { value: 'emp_b' } });
    fireEvent.change(within(form).getByLabelText(/Hareket/), { target: { value: 'gonullu_katilim' } });
    fireEvent.change(within(form).getByLabelText(/Tarih/), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await vi.waitFor(() => { expect(yazmalar.map((y) => y.yol)).toContain('/ik/bes/hareket'); });
    expect(yazmalar.find((y) => y.yol === '/ik/bes/hareket')?.govde).toEqual({
      personel: 'emp_b', tur: 'gonullu_katilim', tarih: '2026-10-01', oran: 3, sirket: null, aciklama: null,
    });
  });

  it('yazma yetkisi olmayan düğmeyi görmez', async () => {
    ikAc('/ik/bes', { kullanici: IK_OKUYAN, okumalar });
    expect(await screen.findByRole('table', { name: 'BES durumu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'BES hareketi gir' })).toBeNull();
  });
});
