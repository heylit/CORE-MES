import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, sunucuKur } from '../test-ortak.tsx';
import { KALITECI_KISI, SATICI_KISI, teklifDeposu } from './test-verisi.ts';
import { listeSayilari } from './TeklifListesi.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const satirlar = () => within(screen.getByRole('table', { name: 'Teklif talepleri' })).getAllByRole('row').slice(1);

describe('TeklifListesi', () => {
  it('sayıları, süzgeç sayılarını ve talepleri yeniden eskiye gösterir', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    sunucuKur(SATICI_KISI, teklifDeposu());
    ac('/portal/yeni/sales');
    expect(await screen.findByRole('heading', { name: 'Müşteri teklif talepleri' }, { timeout: 5000 })).toBeTruthy();
    const suzgec = screen.getByRole('tablist', { name: 'Teklif süzgeci' });
    expect(within(suzgec).getAllByRole('tab').map((s) => s.textContent)).toEqual([
      'Tümü (6)', 'Sizden yanıt bekleyen (1)', 'Müşteride (2)', 'Sonuçlanan (3)',
    ]);
    expect(satirlar()).toHaveLength(6);
    expect(within(satirlar()[0] as HTMLElement).getByText('Deneme talep q1')).toBeTruthy();
    // Süresi geçen teklif "Müşteride" süzgecinde kalır, durumu ayrı yazılır.
    fireEvent.click(within(suzgec).getByRole('tab', { name: 'Müşteride (2)' }));
    expect(satirlar()).toHaveLength(2);
    expect(screen.getByText('Süresi doldu')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yeni teklif/ })).toBeTruthy();
  });

  it('satıra basınca ayrıntıyı açar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    sunucuKur(SATICI_KISI, teklifDeposu());
    ac('/portal/yeni/sales');
    fireEvent.click(await screen.findByText('Deneme talep q5', {}, { timeout: 5000 }));
    expect(await screen.findByText('Müşteri teklifi reddetti')).toBeTruthy();
    expect(screen.getByText('Fiyat yüksek')).toBeTruthy();
  });

  it('satış izni olmayan kişiye listeyi açmaz', async () => {
    const istekler = sunucuKur(KALITECI_KISI, teklifDeposu());
    ac('/portal/yeni/sales');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Teklif talepleri' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/portal/belge/yaz')).toBe(false);
  });

  it('sayılar: sonuçlanmış talep yoksa oran ve yanıt süresi veri yok kalır', () => {
    const d = teklifDeposu();
    const s = listeSayilari(d, SIMDI);
    expect(s.bekleyen).toBe(1);
    // Sonuçlanan üç talebin ikisi kazanılmış (kabul ve sipariş).
    expect(s.kazanma).toBeCloseTo(66.67, 1);
    // Müşterideki tek geçerli teklif: 10 x 100 + 4 x 50.
    expect(s.musteride).toBe(1200);
    const bos = listeSayilari({ ...d, requests: {} }, SIMDI);
    expect(bos).toEqual({ bekleyen: 0, kazanma: null, ilkYanit: null, musteride: 0 });
  });
});
