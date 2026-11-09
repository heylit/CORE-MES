import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
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
});

describe('R1 Operasyonlar: reddedilen', () => {
  it('operasyon okuması kapalıysa bölüm boş kalır, sıfır uydurmaz', async () => {
    sunucuKur(YONETICI, { durum: { ...rotaDurumu(), opdefs: null } });
    rrAc('/recete-rota/ops');
    await bolumAc();
    await screen.findByText(/okuma yetkiniz yok/);
  });
});

// 2559 a: değişim sütunları ve rota revizyonları bölümü yok; "Birim süre dk"; pasifler varsayılan gizli; kullanım Süreler'i süzülü açar.
const pasifli = () => {
  const d = rotaDurumu();
  return { ...d, opdefs: [...(d.opdefs ?? []), { id: '22', code: 'FRZ', abbr: 'F', name: 'Eski frezeleme', group: 'talasli', groupName: 'Talaşlı', stationId: null, setup: 10, cycle: 3, aktif: false }] };
};

describe('2559 Operasyonlar sekmesi', () => {
  it('katalogda değişim sütunları ve rota revizyonları bölümü yoktur; birim süre "Birim süre dk" adıyla görünür', async () => {
    sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    expect(within(bolge).queryByText(/Değişim/)).toBeNull();
    expect(within(bolge).getAllByText('Birim süre dk').length).toBeGreaterThan(0);
    expect(within(bolge).queryByRole('region', { name: 'Rota revizyonları' })).toBeNull();
    expect(within(bolge).queryByRole('table', { name: 'Rota revizyonları' })).toBeNull();
  });

  it('pasif operasyonlar varsayılan gizlidir; "Pasifleri gizle" kaldırılınca görünür ve tercih kalır', async () => {
    sunucuKur(YONETICI, { durum: pasifli() });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    const kutu = within(bolge).getByRole('checkbox', { name: 'Pasifleri gizle' });
    expect((kutu as HTMLInputElement).checked).toBe(true);
    expect(within(bolge).queryByText('Eski frezeleme')).toBeNull();
    fireEvent.click(kutu);
    expect(within(bolge).getByText('Eski frezeleme')).toBeTruthy();
    expect(localStorage.getItem('tc-rr1-pasif-gizle')).toBe('0');
    localStorage.clear();
  });

  it('"1 adım" Süreler bölümünü o operasyona süzülmüş açar; süzgeç kaldırılabilir', async () => {
    sunucuKur(YONETICI, { durum: pasifli(), yazmalar: { 'GET /rota/revizyonlar/71/sureler': () => json(404, { kod: 'YOK', mesaj: 'Yok.' }) } });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: '1 adım' }));
    const sureler = await screen.findByRole('region', { name: 'Süreler' });
    const secim = await within(sureler).findByRole('combobox', { name: 'Operasyon' });
    expect((secim as HTMLSelectElement).value).toBe('21');
    expect(within(secim).queryByRole('option', { name: 'FRZ Eski frezeleme' })).toBeNull();
    fireEvent.change(secim, { target: { value: '' } });
    expect((secim as HTMLSelectElement).value).toBe('');
  });

  it('kullanılmayan operasyonda bağlantı yoktur', async () => {
    sunucuKur(YONETICI, { durum: pasifli() });
    rrAc('/recete-rota/ops');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('checkbox', { name: 'Pasifleri gizle' }));
    expect(within(bolge).getByText('0 adım')).toBeTruthy();
    expect(within(bolge).queryByRole('button', { name: '0 adım' })).toBeNull();
    localStorage.clear();
  });
});
