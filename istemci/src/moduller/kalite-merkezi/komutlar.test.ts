import { describe, expect, it } from 'vitest';
import { komutlariTopla } from '../../ortak/rota/komutlar.ts';
import { komutlar } from './komutlar.ts';
import { adrestenGecis } from './yeni/KaliteMerkeziYeni.tsx';

describe('Kalite Merkezi Ctrl K komutları (1238)', () => {
  it('kabuğun toplayıcısından geçer: anahtar, simge, işlem ve yol (sayfa ya da menü maddesi) geçerli', () => {
    expect(komutlariTopla({ '../../moduller/kalite-merkezi/komutlar.ts': { komutlar } }).map((k) => k.anahtar)).toEqual([
      'kalite-ncr-yeni', 'kalite-dof-yeni', 'kalite-giris-muayenesi', 'kalite-lot-kabul', 'kalite-hatali-karar',
    ]);
  });

  it('yeni kayıt komutları yazma, hatalı parça kararı onay işlemi ister (ekrandaki düğmelerle aynı)', () => {
    expect(Object.fromEntries(komutlar.map((k) => [k.anahtar, k.islem]))).toEqual({
      'kalite-ncr-yeni': 'kalite-merkezi.yaz', 'kalite-dof-yeni': 'kalite-merkezi.yaz', 'kalite-giris-muayenesi': 'kalite-merkezi.yaz',
      'kalite-lot-kabul': 'kalite-merkezi.yaz', 'kalite-hatali-karar': 'kalite-merkezi.onayla',
    });
  });

  it('komut adresi görünüme dolu form geçişi verir (1230 a)', () => {
    const gecis = (anahtar: string) => adrestenGecis(komutlar.find((k) => k.anahtar === anahtar)?.yol.split('?')[1] ?? '');
    expect(gecis('kalite-ncr-yeni')).toEqual({ ac: 'yeni' });
    expect(gecis('kalite-giris-muayenesi')).toEqual({ ac: 'yeni', on: { tur: 'Giriş' } });
    expect(gecis('kalite-hatali-karar')).toBeNull();
  });

  it('adres geçişi: ac kaydı açar; ön değer yalnız tur ve kod; başka alan ve yeni=1 dışı değer geçiş değildir', () => {
    expect(adrestenGecis('?ac=ncr%3A1')).toEqual({ ac: 'ncr:1' });
    expect(adrestenGecis('?yeni=1&kod=KF-08&durum=Kapal%C4%B1&mrb=Hurda')).toEqual({ ac: 'yeni', on: { kod: 'KF-08' } });
    expect(adrestenGecis('?yeni=evet')).toBeNull();
    expect(adrestenGecis('')).toBeNull();
  });
});
