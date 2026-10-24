import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';

// A3 sayfaları: açılışta yazmaz, düğmeler yetkiye göre çizilir. Kişi, istasyon ve iş adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const HAZIRLIK: Deneme = { rol: 'prep', kullanici: { id: 5, ad: 'Deneme Hazirlik', islemler: ['sayfa.arkon', 'arkon.hazirlik', YENI_EKRAN_ISLEMI] } };
const AMIR: Deneme = { rol: 'lead', kullanici: { id: 6, ad: 'Deneme Amir', islemler: ['sayfa.arkon', 'arkon.amir', YENI_EKRAN_ISLEMI] } };
const bolum = async (ad: string) => screen.findByRole('region', { name: ad }, { timeout: 10000 });
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem === 'POST' && /\/(yaz|sil)$/.test(i.yol));
const bekle = () => new Promise((r) => { setTimeout(r, 400); });

const TESIS = { wcs: [{ id: 'W1', name: 'Talaşlı' }], sts: [{ id: 'S1', name: 'Torna', wc: 'W1', t: 'cnc' }, { id: 'S2', name: 'Freze', wc: 'W1', t: 'cnc' }], mcs: [] };
const VARDIYA = [{ name: 'A', start: '00:00', end: '23:59', breaks: [] }];
// kv belgeleri depoda { v } sarmalıyla durur (store.ts).
const belgeler = {
  kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, { kimlik: 'shifts', surum: 1, govde: { v: VARDIYA } }, { kimlik: 'reasons', surum: 1, govde: { v: [{ code: 'D-07', l: 'Bakım', cat: 'p' }] } }],
  pkgs: [
    { kimlik: 'p1', surum: 1, govde: { id: 'p1', no: 'E-1', part: 'Parça A', machine: 'S1', status: 'published', target: 10, cycle: 30, plan: [], steps: [], files: [], due: '', seq: 10 } },
    { kimlik: 'p2', surum: 1, govde: { id: 'p2', no: 'E-2', part: 'Parça B', machine: 'S1', status: 'published', target: 5, cycle: 60, plan: [], steps: [], files: [], due: '', seq: 20 } },
  ],
};

describe('A3 sayfaları', () => {
  it('Pano açılır, istasyonları çizer ve açılışta kayıt yazmaz', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/yeni/pano');
    const b = await bolum('Pano');
    expect(await within(b).findByText('Torna', { exact: false }, { timeout: 10000 })).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
  }, 20000);

  it('Plan Kuyruğu: yönetici sıra değiştirir ve planlı duruş ekler; hazırlık rolü yalnız görür', async () => {
    let istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/yeni/planlama');
    let b = await bolum('Plan Kuyruğu');
    expect(await within(b).findByText('E-1', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).getAllByRole('button', { name: /aşağı|yukarı|Taşı/i }).length).toBeGreaterThan(0);
    fireEvent.click(within(b).getByRole('button', { name: /Planlı duruşlar/ }));
    expect(await within(b).findByRole('button', { name: /Planlı duruş ekle/ })).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();
    // Seçili bölüm cihazda saklanır (eski planTab); ikinci kişi İş emirleri'nden başlasın.
    window.localStorage.clear();

    istekler = sunucuKur(HAZIRLIK, { belgeler });
    arkonAc('/arkon/yeni/planlama');
    b = await bolum('Plan Kuyruğu');
    expect(await within(b).findByText('E-1', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).queryAllByRole('button', { name: /aşağı|yukarı|Taşı/i })).toEqual([]);
    fireEvent.click(within(b).getByRole('button', { name: /Planlı duruşlar/ }));
    await bekle();
    expect(within(b).queryByRole('button', { name: /Planlı duruş ekle/ })).toBeNull();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('Kuyruk salt okunurdur: yönetici de taşıyamaz', async () => {
    sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/yeni/kuyruk');
    const b = await bolum('Kuyruk');
    expect(await within(b).findByText('E-2', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).queryAllByRole('button', { name: /aşağı|yukarı|Taşı/i })).toEqual([]);
  }, 20000);

  it('Üretim Anomalisi açılır, kayıt yazmaz; amir rolünde sayfa açılmaz', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/yeni/anomali');
    await bolum('Üretim Anomalisi');
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();
    sunucuKur(AMIR, { belgeler });
    arkonAc('/arkon/yeni/anomali');
    expect(await screen.findByText('Bu sayfa bulunamadı ya da size açık değil.', {}, { timeout: 10000 })).toBeTruthy();
  }, 30000);
});
