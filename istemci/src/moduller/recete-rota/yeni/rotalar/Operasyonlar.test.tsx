import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Operasyonlar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  return bolge;
};
const TIP = { id: 21, kod: 'TOR', ad: 'Tornalama', grup: 'talasli', aktif: true, kisaltma: 'T', varsayilanAyarDk: '30', varsayilanBirimDk: '5', varsayilanIstasyonId: 31, surum: 3 };

describe('R1 Operasyonlar: izinli', () => {
  it('katalogdaki grubu listeler; ad değişince İstasyonlar kaydına sürümüyle yazılır', async () => {
    const istekler = sunucuKur(YONETICI, {
      durum: rotaDurumu(),
      yazmalar: {
        'GET /operasyon-tipleri': () => json(200, { operasyonTipleri: [TIP] }),
        'POST /operasyon-tipleri/21/guncelle': () => json(200, { ...TIP, ad: 'Torna' }),
      },
    });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    expect(within(bolge).getByText('Talaşlı')).toBeTruthy();
    const ad = within(bolge).getByLabelText('Operasyon adı') as HTMLInputElement;
    expect(ad.value).toBe('Tornalama');
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol.startsWith('/operasyon-tipleri'))).toBe(false);
    fireEvent.change(ad, { target: { value: 'Torna' } });
    fireEvent.blur(ad);
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/operasyon-tipleri/21/guncelle')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/operasyon-tipleri/21/guncelle')?.govde).toMatchObject({ ad: 'Torna', grup: 'talasli', surum: 3 });
  });

  it('yeni operasyon kodsuz eklenmez; kodla eklenir', async () => {
    const istekler = sunucuKur(YONETICI, { durum: rotaDurumu(), yazmalar: { 'POST /operasyon-tipleri': () => json(201, { id: 22 }) } });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Operasyon' }));
    const form = within(bolge).getByRole('region', { name: 'Yeni operasyon' });
    fireEvent.click(within(form).getByRole('button', { name: 'Operasyonu ekle' }));
    await within(form).findByText('Operasyonun kodunu yaz.');
    fireEvent.change(within(form).getByLabelText('Operasyon kodu'), { target: { value: 'KES-1' } });
    fireEvent.change(within(form).getByLabelText('Operasyon adı'), { target: { value: 'Testere' } });
    fireEvent.change(within(form).getByLabelText('İşlem'), { target: { value: '2,5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Operasyonu ekle' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/operasyon-tipleri')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/operasyon-tipleri')?.govde).toMatchObject({ kod: 'KES-1', ad: 'Testere', grup: 'KES', varsayilanBirimDk: '2.5' });
  });

  it('revizyon tablosundaki "Akışta aç" ürünü şemada açar', async () => {
    sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    const tablo = within(bolge).getByRole('table', { name: 'Rota revizyonları' });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Akışta aç' }));
    const sema = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await within(sema).findByRole('button', { name: 'OP 10 Tornalama' });
  });
});

describe('R1 Operasyonlar: reddedilen', () => {
  it('istasyon yazma işlemi olmayan ekleme düğmesini görmez, alanlar kapalı', async () => {
    const istekler = sunucuKur(OKUYAN, { durum: rotaDurumu() });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    expect(within(bolge).queryByRole('button', { name: 'Operasyon' })).toBeNull();
    expect((within(bolge).getByLabelText('Operasyon adı') as HTMLInputElement).disabled).toBe(true);
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  });

  it('operasyon okuması kapalıysa bölüm boş kalır, sıfır uydurmaz', async () => {
    sunucuKur(YONETICI, { durum: { ...rotaDurumu(), opdefs: null } });
    rrAc('/recete-rota/ops');
    await bolumAc();
    await screen.findByText(/okuma yetkiniz yok/);
  });
});
