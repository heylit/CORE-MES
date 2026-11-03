import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Operasyonlar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  return bolge;
};

describe('R1 Operasyonlar: izinli', () => {
  it('katalogdaki grubu yalnız okunur listeler (1927 a): girdi ve ekleme düğmesi yoktur; düğme İstasyonlar sayfasını açar, istek gitmez', async () => {
    const istekler = sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    expect(within(bolge).getByText('Talaşlı')).toBeTruthy();
    expect(within(bolge).getAllByText('Tornalama').length).toBeGreaterThan(0);
    expect(within(bolge).queryByRole('textbox', { name: 'Operasyon adı' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Operasyon' })).toBeNull();
    fireEvent.click(within(bolge).getByRole('button', { name: "İstasyonlar'da düzenle" }));
    await screen.findByText('Başka sayfa');
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
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
  it('operasyon okuması kapalıysa bölüm boş kalır, sıfır uydurmaz', async () => {
    sunucuKur(YONETICI, { durum: { ...rotaDurumu(), opdefs: null } });
    rrAc('/recete-rota/ops');
    await bolumAc();
    await screen.findByText(/okuma yetkiniz yok/);
  });
});
