import { describe, expect, it } from 'vitest';
import { HARFLER, icindekiHarf, O_R, O_X, svgYolu } from '../../../ortak/arayuz/core-harfleri.ts';
import { tekillikKur } from './tekillik.ts';
import {
  BITIS, cizilmeli, durmayiUzat, ILK_DURMA, kaliteDusmeli, OLCUM_KARE, PATLAMA, tamponSirasi, YAVAS_BASI,
} from './zamanlama.ts';

describe('giris sahnesi harfleri', () => {
  it('C, O, R, E sirasiyla; O halkasinin merkezi ve deligi icindekiHarf ile tutarli', () => {
    expect(HARFLER.map((h) => h.ad)).toEqual(['C', 'O', 'R', 'E']);
    expect(icindekiHarf(O_X + O_R, 0)).toBe(1);
    expect(icindekiHarf(O_X, 0)).toBe(-1);
    expect(icindekiHarf(O_X + 55, 0)).toBe(-1);
  });
  it('R deligi bos, E govdesi dolu; svg yolu her hat icin bir alt yol', () => {
    expect(icindekiHarf(75, 20)).toBe(-1);
    expect(icindekiHarf(62, 20)).toBe(2);
    expect(icindekiHarf(150, 0)).toBe(3);
    expect(svgYolu(HARFLER[1]!).match(/M/g)?.length).toBe(2);
    expect(svgYolu(HARFLER[3]!).match(/M/g)?.length).toBe(1);
  });
});

describe('giris sahnesi zamanlamasi (karar 2148-1)', () => {
  it('patlama dalgasina kadar her kare, sonra saniyede 30 kare', () => {
    expect(cizilmeli(PATLAMA, 16.7)).toBe(true);
    expect(cizilmeli(YAVAS_BASI + 1, 16.7)).toBe(false);
    expect(cizilmeli(YAVAS_BASI + 1, 33.3)).toBe(true);
  });
  it('O patlamadan 20 saniye sonra durur; girdi 20 saniye daha dondurur, sureyi kisaltmaz', () => {
    expect(ILK_DURMA).toBe(PATLAMA + 20);
    expect(durmayiUzat(ILK_DURMA, ILK_DURMA)).toBe(ILK_DURMA + 20);
    expect(durmayiUzat(ILK_DURMA, 1)).toBe(ILK_DURMA);
    expect(durmayiUzat(ILK_DURMA, BITIS)).toBe(BITIS + 20);
  });
  it('kalite olcumu yeterli kare gelmeden karar vermez; ortanca 40 kareden yavassa dusurur, tek uzun kare dusurmez', () => {
    expect(kaliteDusmeli(Array<number>(OLCUM_KARE - 1).fill(50))).toBeNull();
    expect(kaliteDusmeli(Array<number>(OLCUM_KARE).fill(40))).toBe(true);
    expect(kaliteDusmeli([...Array<number>(OLCUM_KARE - 1).fill(16.7), 400])).toBe(false);
  });
  it('yari kalitede ilk yari tampon her sirayi esit paylasir', () => {
    const n = 7, sira = Array.from({ length: n }, (_, i) => tamponSirasi(i, n));
    expect([...sira].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sira.filter((s) => s < Math.ceil(n / 2))).toEqual([0, 1, 2, 3]);
  });
});

describe('tekillikKur', () => {
  it('WebGL2 olmayan ortamda sahne kurulmaz, kaba tuval eklenmez', () => {
    const kap = document.createElement('div');
    expect(tekillikKur(kap, { hareketsiz: false, parlama: null })).toBeNull();
    expect(kap.childElementCount).toBe(0);
  });
});
