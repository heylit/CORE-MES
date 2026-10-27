import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, sunucuKur, YAZAN } from '../test-ortak.tsx';
import { ekranAc, OKUR, tuvalsiz, YAZAR, YONETICI } from '../plan/test-yardim.tsx';
import { Cekler } from './index.tsx';

beforeEach(tuvalsiz);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const takip = () => screen.getByRole('table', { name: 'Takipteki çek ve senetler' });

describe('Çek ve senet ekranı', () => {
  it('özet şeridi, takipteki çekler vadeye göre ve son kapananlar', () => {
    ekranAc(Cekler, OKUR);
    const ozet = screen.getByLabelText('Çek özeti');
    expect(within(ozet).getByText('Portföydeki alınan')).toBeTruthy();
    expect(within(ozet).getByText('2 adet')).toBeTruthy();
    const satirlar = within(takip()).getAllByRole('row').slice(1);
    expect(satirlar).toHaveLength(3);
    expect(within(satirlar[0]!).getByText('5 gün kaldı')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Ödenecek')).toBeTruthy();
    expect(screen.getByText('Son kapananlar (1)')).toBeTruthy();
  });

  it('yön süzgeci yalnız seçilen yönü gösterir', () => {
    ekranAc(Cekler, OKUR);
    fireEvent.click(within(screen.getByRole('group', { name: 'Yön' })).getByRole('button', { name: 'Verilen' }));
    expect(within(takip()).getAllByRole('row').slice(1)).toHaveLength(1);
  });

  it('reddedilen: finans.yaz yoksa çek ekleme, durum ve düzenle düğmeleri yok', () => {
    ekranAc(Cekler, OKUR);
    for (const ad of ['Çek aldım', 'Çek verdim', 'Durum güncelle']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    expect(screen.queryByRole('button', { name: /çekini düzenle/ })).toBeNull();
  });

  it('durum tabloda rozet olarak görünür; tabloda seçim kutusu yok', () => {
    ekranAc(Cekler, YAZAR);
    const satir = within(takip()).getAllByRole('row')[1]!;
    expect(within(satir).queryByRole('combobox')).toBeNull();
    expect(within(satir).getByText('Ödenecek')).toBeTruthy();
  });

  it('izinli: düğmeler olay çekmecesini açar (cekal, cekver, cekdurum)', () => {
    const { kayitGir } = ekranAc(Cekler, YAZAR);
    fireEvent.click(screen.getByRole('button', { name: 'Çek aldım' }));
    fireEvent.click(screen.getByRole('button', { name: 'Çek verdim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Durum güncelle' }));
    expect(kayitGir.mock.calls.map((c) => c[0])).toEqual(['cekal', 'cekver', 'cekdurum']);
  });

  it('düzenle: yön, tür, cari, tutar ve durum salt okunur; banka, seri no ve vade cek-duzelt ucuna sürümle gider; iptal yalnız yöneticide', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/cekler/2/duzelt': () => json(200, { cek: {} }) });
    ekranAc(Cekler, YAZAR);
    fireEvent.click(within(takip()).getAllByRole('button', { name: /çekini düzenle/ })[0]!);
    const pencere = await screen.findByRole('dialog', { name: 'Çek / senedi düzenle' });
    expect(within(pencere).queryByRole('button', { name: 'İptal et' })).toBeNull();
    for (const ad of ['Yön', 'Tür', 'Cari / keşideci', 'Tutar', 'Durum']) expect((within(pencere).getByLabelText(ad) as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Seri / numara'), { target: { value: 'B-7' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toEqual({
      yontem: 'POST', yol: '/finans/cekler/2/duzelt', govde: { surum: 1, banka: null, seriNo: 'B-7', vade: '2026-10-20' },
    }));
  });

  it('iptal: yönetici satır içi onaylayınca cek iptal ucuna gider', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/cekler/2/iptal': () => json(200, { cek: {} }) });
    ekranAc(Cekler, YONETICI);
    fireEvent.click(within(takip()).getAllByRole('button', { name: /çekini düzenle/ })[0]!);
    const pencere = await screen.findByRole('dialog', { name: 'Çek / senedi düzenle' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptal et' }));
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptali onayla' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toEqual({ yontem: 'POST', yol: '/finans/cekler/2/iptal', govde: { surum: 1 } }));
  });
});
