import { afterEach, describe, expect, it } from 'vitest';
import { cihazYazicilari, cihazYazicilariniCoz, cihazYazicisiKaydet, kayitYazicisi, sonYaziciOku, sonYaziciYaz } from './cihaz-yazicisi.ts';

const LOT = { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' };

afterEach(() => { localStorage.clear(); });

describe('cihaz yazıcısı (2916 a)', () => {
  it('varsayılan yokken boş döner; kayıt türü şablon türüne çevrilerek bulunur (mal kabul lot şablonunu kullanır)', () => {
    expect(kayitYazicisi('mal-kabul')).toBeNull();
    cihazYazicisiKaydet('lot', LOT);
    expect(kayitYazicisi('mal-kabul')).toEqual(LOT);
    expect(kayitYazicisi('lot')).toEqual(LOT);
    expect(kayitYazicisi('konum')).toBeNull();
  });

  it('null varsayılanı kaldırır, öteki türler kalır', () => {
    cihazYazicisiKaydet('lot', LOT);
    cihazYazicisiKaydet('konum', { ...LOT, sablonAnahtar: 'konum-50x25', sablonAd: 'Konum 50x25' });
    cihazYazicisiKaydet('lot', null);
    expect(Object.keys(cihazYazicilari())).toEqual(['konum']);
  });

  it('bozuk ya da eksik alanlı kayıt yok sayılır (reddedilen)', () => {
    expect(cihazYazicilariniCoz('{bozuk')).toEqual({});
    expect(cihazYazicilariniCoz('[]')).toEqual({});
    expect(cihazYazicilariniCoz(JSON.stringify({ lot: { ...LOT, yaziciId: 0 }, konum: { yaziciAd: 'x' } }))).toEqual({});
    expect(cihazYazicilariniCoz(JSON.stringify({ lot: LOT }))).toEqual({ lot: LOT });
  });
});

describe('bağlantı ve son seçilen yazıcı (3025)', () => {
  it('bağlantı yalnız ağ ya da USB olur; eski kayıt (bağlantısız) ağ sayılır, bilinmeyen bağlantı reddedilir', () => {
    expect(cihazYazicilariniCoz(JSON.stringify({ lot: { ...LOT, baglanti: 'usb' } }))).toEqual({ lot: { ...LOT, baglanti: 'usb' } });
    expect(cihazYazicilariniCoz(JSON.stringify({ lot: { ...LOT, baglanti: 'tarayici' } }))).toEqual({});
    expect(cihazYazicilariniCoz(JSON.stringify({ lot: LOT }))).toEqual({ lot: LOT });
  });

  it('son seçilen yazıcı tür başına tutulur; biçimi bozuk değer yok sayılır', () => {
    expect(sonYaziciOku('lot')).toBeNull();
    sonYaziciYaz('lot', 'usb:2');
    sonYaziciYaz('konum', 'tarayici');
    expect(sonYaziciOku('lot')).toBe('usb:2');
    expect(sonYaziciOku('konum')).toBe('tarayici');
    sonYaziciYaz('lot', 'ag:0');
    expect(sonYaziciOku('lot')).toBeNull();
    localStorage.setItem('coremes.etiket-merkezi.son-yazici', '{bozuk');
    expect(sonYaziciOku('konum')).toBeNull();
  });
});
