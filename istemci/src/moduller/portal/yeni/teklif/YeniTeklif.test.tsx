import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, sunucuKur, type Istek } from '../test-ortak.tsx';
import { KALITECI_KISI, SATICI_KISI, teklifDeposu, yazmaCevabi } from './test-verisi.ts';
import { taslaklariSil } from './ortak.tsx';
import { satirlariOku } from './YeniTeklif.tsx';

afterEach(() => { cleanup(); taslaklariSil(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const yazmalar = (istekler: readonly Istek[]) =>
  istekler.filter((i) => i.yontem === 'POST' && i.yol === '/portal/belge/yaz').map((i) => i.govde as { yol: string; veri: Record<string, unknown>; beklenenSurum: number | null });

describe('YeniTeklif', () => {
  it('müşteri adına talep açar, yeni kaydı yoksa koşuluyla yazar ve ayrıntıya geçer', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/newsale');
    const ac_ = await screen.findByRole('button', { name: 'Talebi aç' }, { timeout: 5000 });
    fireEvent.click(ac_);
    expect(await screen.findByText('Konu yazın.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Konu/), { target: { value: 'Deneme yıllık ihtiyaç' } });
    fireEvent.click(ac_);
    expect(await screen.findByText('En az bir kalem ekleyin.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kalem 1 adı'), { target: { value: 'Deneme mil' } });
    fireEvent.change(screen.getByLabelText('Kalem 1 miktar'), { target: { value: '12' } });
    fireEvent.click(ac_);
    await waitFor(() => { expect(yazmalar(istekler)).toHaveLength(1); });
    const y = yazmalar(istekler)[0];
    expect(y?.yol).toMatch(/^requests\/q/);
    expect(y?.beklenenSurum).toBeNull();
    // Numara okunan taleplerin en büyük sırasından (TKL-2026-q6) bir sonraki.
    expect(y?.veri).toMatchObject({ no: 'TKL-2026-007', customerId: 'c1', title: 'Deneme yıllık ihtiyaç', status: 'new', items: [{ name: 'Deneme mil', qty: 12 }] });
    expect(await screen.findByText('Bu kayıt bulunamadı veya bu hesapla erişiminiz yok.')).toBeTruthy();
  });

  it('yarım kalan form sayfadan çıkıp dönünce korunur', async () => {
    sunucuKur(SATICI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/newsale');
    fireEvent.change(await screen.findByLabelText(/^Konu/, {}, { timeout: 5000 }), { target: { value: 'Yarım talep' } });
    fireEvent.change(screen.getByLabelText('Kalem 1 adı'), { target: { value: 'Deneme mil' } });
    cleanup();
    ac('/portal/yeni/newsale');
    expect(((await screen.findByLabelText(/^Konu/, {}, { timeout: 5000 })) as HTMLInputElement).value).toBe('Yarım talep');
    expect((screen.getByLabelText('Kalem 1 adı') as HTMLInputElement).value).toBe('Deneme mil');
  });

  it('satış izni olmayan kişiye formu açmaz', async () => {
    const istekler = sunucuKur(KALITECI_KISI, teklifDeposu(), yazmaCevabi);
    ac('/portal/yeni/newsale');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Talebi aç' })).toBeNull();
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('kalem satırları: boş satır atlanır, eksik satır reddedilir', () => {
    expect(satirlariOku([{ ad: 'A', miktar: '2,5', birim: 'kg' }, { ad: '', miktar: '', birim: 'adet' }]))
      .toEqual({ kalemler: [{ name: 'A', qty: 2.5, unit: 'kg', spec: '', price: null }] });
    expect(satirlariOku([{ ad: 'A', miktar: '0', birim: 'adet' }])).toEqual({ hata: '1. kalemde ad ve sıfırdan büyük miktar gerekli.' });
    expect(satirlariOku([{ ad: '', miktar: '3', birim: 'adet' }])).toEqual({ hata: '1. kalemde ad ve sıfırdan büyük miktar gerekli.' });
    expect(satirlariOku([{ ad: '', miktar: '', birim: 'adet' }])).toEqual({ hata: 'En az bir kalem ekleyin.' });
  });
});
