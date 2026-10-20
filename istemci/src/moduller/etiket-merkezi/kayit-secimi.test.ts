import { describe, expect, it } from 'vitest';
import { kayitSecimiOku, kayitSecimiYaz } from './kayit-secimi.ts';

const oku = (s: string) => kayitSecimiOku(new URLSearchParams(s));

describe('kayitSecimiOku', () => {
  it('stokun gönderdiği adresi okur, sırayı korur', () => {
    expect(oku('tur=konum&id=3,1,2')).toEqual({ tur: 'konum', idler: [3, 1, 2] });
    expect(oku('tur=konum&id= 4 , 5 ,')).toEqual({ tur: 'konum', idler: [4, 5] });
    expect(oku('tur=konum&id=1,2,1')).toEqual({ tur: 'konum', idler: [1, 2] });
    expect(oku('tur=lot&id=7')).toEqual({ tur: 'lot', idler: [7] });
    expect(oku('tur=istasyon&id=8,9')).toEqual({ tur: 'istasyon', idler: [8, 9] });
    expect(oku('tur=refakat&id=12')).toEqual({ tur: 'refakat', idler: [12] });
    expect(oku('tur=malzeme&id=1001')).toEqual({ tur: 'malzeme', idler: [1001] });
    expect(oku('tur=mal-kabul&id=7')).toEqual({ tur: 'mal-kabul', idler: [7] });
  });

  it('bilinmeyen tür, boş, sayı olmayan, sıfır, sınır dışı ya da 200 üstü kimlik seçim değildir', () => {
    for (const s of ['tur=deneme&id=1', 'tur=konum', 'tur=konum&id=', 'tur=konum&id=1,x', 'tur=konum&id=0', 'tur=konum&id=-1', 'tur=konum&id=2147483648', 'tur=konum&id=1.5']) {
      expect(oku(s), s).toBeNull();
    }
    expect(oku(`tur=konum&id=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`)).toBeNull();
    expect(oku(`tur=konum&id=${Array.from({ length: 200 }, (_, i) => i + 1).join(',')}`)?.idler).toHaveLength(200);
  });
});

describe('kayitSecimiYaz', () => {
  it('diğer parametrelere dokunmaz; boş seçim tür ve kimliği siler', () => {
    const adres = new URLSearchParams('x=1&tur=konum&id=1,2');
    expect(kayitSecimiYaz(adres, { tur: 'konum', idler: [2] }).toString()).toBe('x=1&tur=konum&id=2');
    expect(kayitSecimiYaz(adres, { tur: 'konum', idler: [] }).toString()).toBe('x=1');
    expect(kayitSecimiYaz(adres, null).toString()).toBe('x=1');
  });
});
