import { afterEach, describe, expect, it } from 'vitest';
import { olcuCoz, olcuYazisi, ozelOlculeriCoz, ozelOlcuOku, ozelOlcuYaz } from './ozel-olcu.ts';

afterEach(() => { localStorage.clear(); });

describe('ozel-olcu', () => {
  it('virgül ondalıktır; sınır ve tek ondalık denetlenir', () => {
    expect(olcuCoz('62,5', '40')).toEqual({ olcu: { genislik: 62.5, yukseklik: 40 } });
    expect(olcuCoz('10', '300').olcu).toEqual({ genislik: 10, yukseklik: 300 });
    expect(olcuCoz('9,9', '40').enHatasi).toBe('En 10 ile 110 mm arasında olur.');
    expect(olcuCoz('110,1', '40').enHatasi).toBe('En 10 ile 110 mm arasında olur.');
    expect(olcuCoz('50', '301').boyHatasi).toBe('Boy 10 ile 300 mm arasında olur.');
    expect(olcuCoz('50,25', '40').enHatasi).toBe('En en çok bir ondalıkla yazılır.');
    expect(olcuCoz('', 'x')).toEqual({ olcu: null, enHatasi: 'En mm olarak yazılır.', boyHatasi: 'Boy mm olarak yazılır.' });
  });

  it('cihaz kaydı şablon başınadır; bozuk ya da sınır dışı kayıt okunmaz', () => {
    ozelOlcuYaz('lot-100x50', { genislik: 60, yukseklik: 40 });
    ozelOlcuYaz('konum-50x25', { genislik: 40, yukseklik: 20 });
    expect(ozelOlcuOku('lot-100x50')).toEqual({ genislik: 60, yukseklik: 40 });
    ozelOlcuYaz('lot-100x50', null);
    expect(ozelOlcuOku('lot-100x50')).toBeNull();
    expect(ozelOlcuOku('konum-50x25')).toEqual({ genislik: 40, yukseklik: 20 });
    expect(ozelOlculeriCoz('{bozuk')).toEqual({});
    expect(ozelOlculeriCoz('[1]')).toEqual({});
    expect(ozelOlculeriCoz(JSON.stringify({ a: { genislik: 5, yukseklik: 40 }, b: { genislik: '60', yukseklik: 40 }, c: { genislik: 60, yukseklik: 40 } })))
      .toEqual({ c: { genislik: 60, yukseklik: 40 } });
  });

  it('ölçü yazısı virgüllüdür', () => {
    expect(olcuYazisi({ genislik: 62.5, yukseklik: 40 })).toBe('62,5x40 mm');
  });
});
