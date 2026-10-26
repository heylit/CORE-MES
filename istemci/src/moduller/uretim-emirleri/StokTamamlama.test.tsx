import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { EmirTamamlamaCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { EmirAyrintiCevabi, IzlemeEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { tamamlamaKomutu } from './StokTamamlama.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const BITMIS = {
  id: 3, emirNo: 'EM-3', parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: null, durum: 'bitti', acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: '2026-10-06T09:00:00+00:00', bitis: '2026-10-06T11:00:00+00:00', iptal: null, saglamAdet: 8, malzemeNo: 501,
} satisfies IzlemeEmri;
const SARF = { malzemeId: 601, malzemeAd: 'Deneme çubuk', hizmet: false, brut: '5', verilen: '2', kalan: '3', mevcut: '9', eksik: '0' };
const tamamlama = (kalan: string, bilesenler = [SARF]): EmirTamamlamaCevabi => ({
  emir: { id: 3, emirNo: 'EM-3', durum: 'bitti', adet: 10, malzemeId: 501, malzemeAd: null }, cikti: { girilen: '1', kalan }, bilesenler, engel: null,
});
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
const yollar = {
  'GET /uretim-emirleri/3': () => json(200, { emir: BITMIS, kayitlar: [] } satisfies EmirAyrintiCevabi),
  'GET /stok/uretim-emirleri/3/tamamlama': () => json(200, tamamlama('3')),
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Stoka tamamla', () => {
  it('stok giriş ve çıkış yetkisi olana bitmiş emrin ayrıntısında düğme çıkar; istasyonsuz emir de açılır', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'stok.giris', 'stok.cikis'] }, yollar);
    ac(ekran, '/uretim-emirleri/3');
    expect(await screen.findByRole('button', { name: 'Stoka tamamla' })).toBeTruthy();
    expect(screen.getByText('İstasyon').nextElementSibling?.textContent).toBe('yok');
  });

  it('yetkisiz kullanıcıda düğme yok ve stok ucu çağrılmaz; yalnız giriş yetkisi yetmez', async () => {
    for (const islemler of [OKUYUCU.islemler, [...OKUYUCU.islemler, 'stok.giris' as const]]) {
      const istekler = sunucuKur({ ...OKUYUCU, islemler: [...islemler] }, yollar);
      ac(ekran, '/uretim-emirleri/3');
      expect(await screen.findByText('EM-3')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Stoka tamamla' })).toBeNull();
      // Refakat kartları bölümü stok okumasıdır (Soru 586); onun okuması dışında stok ucu çağrılmaz.
      expect(istekler.some((i) => i.yol.startsWith('/stok/') && !(i.yontem === 'GET' && i.yol === '/stok/uretim-emirleri/3/refakat-partileri'))).toBe(false);
      cleanup();
    }
  });

  it('bitmemiş emirde yetkili kullanıcıya da düğme çıkmaz', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'stok.giris', 'stok.cikis'] }, {
      ...yollar, 'GET /uretim-emirleri/3': () => json(200, { emir: { ...BITMIS, durum: 'planli', bitis: null, saglamAdet: null }, kayitlar: [] } satisfies EmirAyrintiCevabi),
    });
    ac(ekran, '/uretim-emirleri/3');
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stoka tamamla' })).toBeNull();
  });

  it('ürün kartı olmayan (eski) bitmiş emirde bölüm çizilmez ve stok ucu sorulmaz', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'stok.giris', 'stok.cikis'] }, {
      ...yollar, 'GET /uretim-emirleri/3': () => json(200, { emir: { ...BITMIS, malzemeNo: null }, kayitlar: [] } satisfies EmirAyrintiCevabi),
    });
    ac(ekran, '/uretim-emirleri/3');
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Stok ve tamamlama' })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
  });

  it('#444: kalan çıktı ya da kalan sarf varsa komut gider; ikisi de yoksa ya da yalnız hizmet kalmışsa gitmez', () => {
    expect(tamamlamaKomutu(tamamlama('3'))).toEqual({ tur: 'gonder', girecek: '3' });
    expect(tamamlamaKomutu(tamamlama('0.1', []))).toEqual({ tur: 'gonder', girecek: '0.1' });
    expect(tamamlamaKomutu(tamamlama('0'))).toEqual({ tur: 'gonder', girecek: '0' });
    expect(tamamlamaKomutu(tamamlama('0', []))).toEqual({ tur: 'yapilacak-yok' });
    expect(tamamlamaKomutu(tamamlama('0', [{ ...SARF, hizmet: true }]))).toEqual({ tur: 'yapilacak-yok' });
  });
});
