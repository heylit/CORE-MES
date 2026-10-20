import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { baglantiDonusunuDinle, baglantiDurumu, baglantiSifirla, bildirimiKapat } from './baglanti.ts';

const KIMLIK = '0b8e4a3c-6f1d-4c2a-9e7b-3d5f1a2b4c6d';

const agKopuk = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
const sunucuCevapVerir = (durum = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: durum })));

beforeEach(() => { baglantiSifirla(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('baglanti durumu', () => {
  it('ulasilamayan okuma kopuk yapar ama belirsiz yazma saymaz', async () => {
    agKopuk();
    await api.get('/x').catch(() => undefined);
    expect(baglantiDurumu()).toEqual({ kopuk: true, bilinmeyenYazma: 0, geriGeldi: false });
  });

  it('ulasilamayan yazma sonucu bilinmeyen sayilir', async () => {
    agKopuk();
    await api.post('/x', {}).catch(() => undefined);
    expect(baglantiDurumu().bilinmeyenYazma).toBe(1);
  });

  it('hata cevabi da baglantinin dondugunu gosterir', async () => {
    agKopuk();
    await api.get('/x').catch(() => undefined);
    sunucuCevapVerir(503);
    await api.get('/x').catch(() => undefined);
    expect(baglantiDurumu()).toMatchObject({ kopuk: false, geriGeldi: true });
  });

  it('sunucu kapaliyken vekilin cevabi (JSON olmayan 5xx) baglantiyi kopuk tutar, yazmayi belirsiz sayar', async () => {
    agKopuk();
    await api.get('/x').catch(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await api.get('/x').catch(() => undefined);
    await api.post('/x', {}).catch(() => undefined);
    expect(baglantiDurumu()).toEqual({ kopuk: true, bilinmeyenYazma: 1, geriGeldi: false });
  });

  it('ayni kimlikle yeniden gonderilip cevap alan yazma belirsizlikten duser', async () => {
    agKopuk();
    await api.post('/x', {}, { istekKimligi: KIMLIK }).catch(() => undefined);
    expect(baglantiDurumu().bilinmeyenYazma).toBe(1);
    sunucuCevapVerir();
    await api.post('/x', {}, { istekKimligi: KIMLIK });
    expect(baglantiDurumu().bilinmeyenYazma).toBe(0);
  });

  it('kimliksiz yazma baska bir cevapla dusmez, kullanici kapatinca duser', async () => {
    agKopuk();
    await api.post('/x', {}).catch(() => undefined);
    sunucuCevapVerir();
    await api.post('/x', {});
    expect(baglantiDurumu().bilinmeyenYazma).toBe(1);
    bildirimiKapat();
    expect(baglantiDurumu()).toEqual({ kopuk: false, bilinmeyenYazma: 0, geriGeldi: false });
  });

  it('suresi dolan yazma belirsizdir, baglantiyi kopuk saymaz; cagiranin iptali saymaz', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_y: string, s: RequestInit) => new Promise((_c, reddet) => {
      s.signal?.addEventListener('abort', () => { reddet(new DOMException('aborted', 'AbortError')); });
    })));
    const sure = api.post('/x', {}, { zamanAsimiMs: 100 }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(100);
    await sure;
    expect(baglantiDurumu()).toMatchObject({ kopuk: false, bilinmeyenYazma: 1 });

    const kesici = new AbortController();
    const iptal = api.post('/x', {}, { sinyal: kesici.signal }).catch(() => undefined);
    kesici.abort();
    await iptal;
    expect(baglantiDurumu().bilinmeyenYazma).toBe(1);
  });

  it('donus dinleyicisi yalniz kopuktan donuste cagrilir', async () => {
    const donunce = vi.fn();
    const birak = baglantiDonusunuDinle(donunce);
    sunucuCevapVerir();
    await api.get('/x');
    expect(donunce).not.toHaveBeenCalled();
    agKopuk();
    await api.get('/x').catch(() => undefined);
    sunucuCevapVerir();
    await api.get('/x');
    await api.get('/x');
    expect(donunce).toHaveBeenCalledTimes(1);
    birak();
  });
});
