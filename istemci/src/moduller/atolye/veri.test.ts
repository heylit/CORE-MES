import { describe, expect, it } from 'vitest';
import { emirleriBirlestir, stokOkurMu } from './veri.ts';

describe('haritanın emir listesi (karar 1613 a)', () => {
  it('açık ve son günlerde kapanan emirler tek listede, en yeni üstte', () => {
    const l = emirleriBirlestir([{ id: 5, durum: 'basladi' }, { id: 9, durum: 'planli' }], [{ id: 7, durum: 'bitti' }]);
    expect(l.map((e) => e.id)).toEqual([9, 7, 5]);
  });

  it('iki istek arasında kapanan emir iki kez gelmez; kapalı hali kalır', () => {
    const l = emirleriBirlestir([{ id: 5, durum: 'basladi' }], [{ id: 5, durum: 'bitti' }]);
    expect(l).toEqual([{ id: 5, durum: 'bitti' }]);
  });

  it('kapanan yoksa yalnız açıklar', () => {
    expect(emirleriBirlestir([{ id: 1 }], [])).toEqual([{ id: 1 }]);
  });
});

describe('stok okuma yetkisi (3202 Risk N1)', () => {
  it('stok.istek okuma açmaz; stok işlemi ve sayfası açar', () => {
    expect(stokOkurMu('stok.istek')).toBe(false);
    expect(stokOkurMu('stok.giris')).toBe(true);
    expect(stokOkurMu('sayfa.stok')).toBe(true);
  });
});
