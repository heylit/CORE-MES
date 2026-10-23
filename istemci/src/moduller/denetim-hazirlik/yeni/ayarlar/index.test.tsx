import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ornekProfil } from '../kurallar/profil.ts';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import { Ayarlar } from './index.tsx';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:deneme');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const dolu = (): Depo => {
  const d = ornekDepo();
  d.data[d.active] = ornekProfil();
  return d;
};

describe('Ayarlar (izinli: yönetici)', () => {
  it('firma bilgisi yazdıkça değişir; profil eklenir, açılır ve onayla silinir', async () => {
    sahteSunucu({ depo: dolu() });
    await baglamlaAc(<Ayarlar />, 'profil');
    const firma = await screen.findByLabelText('Firma adı');
    fireEvent.change(firma, { target: { value: 'Deneme Firma' } });
    expect((screen.getByLabelText('Firma adı') as HTMLInputElement).value).toBe('Deneme Firma');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni profil' }));
    expect(await screen.findByText('Yeni profil açıldı')).toBeTruthy();
    expect(screen.getByText('Adsız profil')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
    expect(await screen.findByText('Deneme Firma açıldı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Adsız profil profilini sil' }));
    const onay = await screen.findByRole('dialog', { name: 'Profil silinsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Sil' }));
    expect(screen.queryByText('Adsız profil')).toBeNull();
    expect(screen.queryByRole('button', { name: /profilini sil$/ })).toBeNull();
  });

  it('seçerek sıfırlama onayla yapılır ve geri alınabilir', async () => {
    sahteSunucu({ depo: dolu() });
    await baglamlaAc(<Ayarlar />, 'profil');
    expect((await screen.findByLabelText('Firma adı') as HTMLInputElement).value).not.toBe('');
    expect((screen.getByRole('button', { name: 'Seçilenleri sıfırla' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Firma bilgileri'));
    fireEvent.click(screen.getByRole('button', { name: 'Seçilenleri sıfırla' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sıfırla' }));
    expect((screen.getByLabelText('Firma adı') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    expect((screen.getByLabelText('Firma adı') as HTMLInputElement).value).not.toBe('');
  });
});

describe('Ayarlar (reddedilen)', () => {
  it('yazarda yıkıcı işlemler (sil, sıfırla, yedek yükle) yok; yedek indirme ve yeni profil var', async () => {
    const depo = dolu();
    depo.order.push('ikinci');
    depo.data['ikinci'] = ornekProfil();
    sahteSunucu({ depo, yazabilir: true, yonetici: false });
    await baglamlaAc(<Ayarlar />, 'profil');
    await screen.findByLabelText('Firma adı');
    expect(screen.queryByRole('heading', { name: 'Sıfırlama' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yedek yükle' })).toBeNull();
    expect(screen.queryByRole('button', { name: /profilini sil$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tüm profilleri yedekle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeni profil' })).toBeTruthy();
  });

  it('okuyucuda alanlar kilitli, profil ve yazma düğmeleri yok; program değiştirme açık', async () => {
    sahteSunucu({ depo: dolu(), yazabilir: false, yonetici: false });
    await baglamlaAc(<Ayarlar />, 'profil');
    expect((await screen.findByLabelText('Firma adı') as HTMLInputElement).disabled).toBe(true);
    for (const ad of ['Yeni profil', 'Bu profili kopyala', 'Yedek yükle']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Bu programa geç' })[0] as HTMLElement);
    expect(screen.getAllByText('Açık').length).toBeGreaterThan(0);
  });
});
