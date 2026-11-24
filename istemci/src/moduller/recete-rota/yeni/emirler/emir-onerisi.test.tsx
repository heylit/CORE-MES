import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, sunucuKur, yeniEmirAc, YONETICI } from '../test-ortak.tsx';

// 3657: yeni emir formunda miktar (kalan adet) ve teslim (satır termini) sipariş satırından önerilir; değiştirilebilir. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const satir = (id: number, no: number, adet: string, acik: string, termin: string) => ({ id, siparisNo: 'ORN-S-0042', satirNo: no, adet, acikEmirAdedi: acik, termin });
const secenek = (satirlar: ReturnType<typeof satir>[]) => ({ projeZorunlu: true, rotasizAcik: true, projeler: [{ id: 7, kod: 'ORN-P-0007', ad: 'ORN proje', satirlar }] });

async function formAc(cevap: unknown) {
  sunucuKur(YONETICI, { yazmalar: { 'GET /adimli-emirler/acilis-secenekleri': () => json(200, cevap) } });
  yeniEmirAc();
  return screen.findByRole('dialog', { name: 'Yeni üretim emri' });
}

describe('emir önerisi (3657)', () => {
  it('tek aday satırda miktar kalan adet, teslim satır termini gelir; elle değişince öneri ezmez', async () => {
    const form = await formAc(secenek([satir(1, 1, '500', '180', '2030-12-18')]));
    await waitFor(() => { expect((within(form).getByLabelText('Miktar') as HTMLInputElement).value).toBe('320'); });
    expect((within(form).getByLabelText('Teslim') as HTMLInputElement).value).toBe('2030-12-18');
    expect(within(form).getByText(/kalan 320 \(satır 500, açık emirlerde 180\)/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Teslim'), { target: { value: '2030-12-30' } });
    expect(within(form).getByText(/bağsız açılır/)).toBeTruthy();
    expect((within(form).getByLabelText('Miktar') as HTMLInputElement).value).toBe('320');
  });

  it('birden çok adayda seçilene kadar öneri yok; satır seçilince dolar, Seçmeden devam elle girileni korur', async () => {
    const form = await formAc(secenek([satir(1, 1, '500', '180', '2030-12-18'), satir(2, 2, '200', '0', '2031-01-08')]));
    const miktar = () => (within(form).getByLabelText('Miktar') as HTMLInputElement).value;
    await within(form).findByText('Seçmeden devam');
    expect(within(form).getByText(/500 adet, açık emirlerde 180, kalan 320/)).toBeTruthy();
    expect(miktar()).toBe('100');
    fireEvent.click(within(form).getAllByRole('radio')[1]!);
    await waitFor(() => { expect(miktar()).toBe('200'); });
    expect((within(form).getByLabelText('Teslim') as HTMLInputElement).value).toBe('2031-01-08');
    fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '50' } });
    fireEvent.click(within(form).getAllByRole('radio')[2]!);
    expect(miktar()).toBe('50');
  });

  it('aday yoksa bugünkü varsayılanlar kalır', async () => {
    const form = await formAc({ projeZorunlu: false, rotasizAcik: true, projeler: [] });
    await waitFor(() => { expect(within(form).getByLabelText('Miktar')).toBeTruthy(); });
    expect((within(form).getByLabelText('Miktar') as HTMLInputElement).value).toBe('100');
  });
});
