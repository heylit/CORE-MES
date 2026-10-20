import { describe, expect, it } from 'vitest';
import { topluGirisHatasi, topluGirisSayilari } from '../../../../arkon/web/src/data/toplu-giris.ts';

// Kart #1046: operatör bir seferde N sağlam ve N hurda girer; olağan sayım olarak yazılır.
describe('Arkon terminali toplu giriş', () => {
  it('izinli: sağlam, hurda ve nedeniyle ya da yalnız biri', () => {
    expect(topluGirisHatasi({ saglam: 12, hurda: 3, neden: 'H-01' }, 40)).toBeNull();
    expect(topluGirisHatasi({ saglam: 40, hurda: 0, neden: null }, 40)).toBeNull();
    expect(topluGirisHatasi({ saglam: 0, hurda: 2, neden: 'H-02' }, 0)).toBeNull();
  });

  it('reddedilen: nedensiz hurda, 0 adet, tam sayı olmayan ya da eksi adet, kalanı aşan sağlam', () => {
    expect(topluGirisHatasi({ saglam: 5, hurda: 2, neden: null }, 40)).toMatch(/Hurda nedeni/);
    expect(topluGirisHatasi({ saglam: 5, hurda: 2, neden: '' }, 40)).toMatch(/Hurda nedeni/);
    expect(topluGirisHatasi({ saglam: 0, hurda: 0, neden: null }, 40)).toMatch(/adet girin/);
    expect(topluGirisHatasi({ saglam: 2.5, hurda: 0, neden: null }, 40)).toMatch(/tam sayı/);
    expect(topluGirisHatasi({ saglam: -3, hurda: 0, neden: null }, 40)).toMatch(/tam sayı/);
    expect(topluGirisHatasi({ saglam: Number.NaN, hurda: 1, neden: 'H-01' }, 40)).toMatch(/tam sayı/);
    expect(topluGirisHatasi({ saglam: 41, hurda: 0, neden: null }, 40)).toMatch(/kalan 40/);
  });

  it('girilen metin sayıya çevrilir: boş alan 0, harf ya da ondalık geçersiz kalır', () => {
    expect(topluGirisSayilari('12', '')).toEqual({ saglam: 12, hurda: 0 });
    expect(topluGirisSayilari(' 7 ', '3')).toEqual({ saglam: 7, hurda: 3 });
    expect(Number.isInteger(topluGirisSayilari('1,5', '0').saglam)).toBe(false);
    expect(Number.isInteger(topluGirisSayilari('a', '0').saglam)).toBe(false);
  });
});
