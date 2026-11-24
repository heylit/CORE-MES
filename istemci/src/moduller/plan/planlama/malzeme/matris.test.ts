import { describe, expect, it } from 'vitest';
import type { AlimPlaniSatiri } from './kurallar.ts';
import { gelisGunleri, matrisDurumu, nabizMetni, stokYeterGunu, stokYeterMetni, ufukOzeti } from './matris.ts';
import type { GunHucresi, TuketimSatiri } from './toplu-talep.ts';

// Veri uydurmadır (ORN-).
const TABAN = Date.UTC(2026, 10, 24);
const G = 24;
const hucre = (eksik: number): GunHucresi => ({ tuketim: 10, eksik, siparisten: 0, kalan: 0 });
const satir = (gunler: [number, number][]): TuketimSatiri => ({
  kod: '11', gunler: new Map(gunler.map(([g, e]) => [g * G, hucre(e)])), toplam: 0, eksik: gunler.reduce((a, [, e]) => a + e, 0), talepte: 0, isler: new Map(),
});
const alim = (ek: Partial<AlimPlaniSatiri>): AlimPlaniSatiri => ({
  tur: 'sa', alimNo: 0, src: 1, tm: 'termin', kod: '11', miktar: 100, tedarikci: null, no: null, verildi: null, ref: null, isler: [], gerekli: null, enGec: null,
  soz: null, etkin: 4 * G + 8, siparisGun: null, tb: false, durum: 'karsiliyor', ...ek,
});

describe('matrisDurumu', () => {
  it('açık talep eksiği karşılıyorsa Talepte, karşılamıyorsa Talepte, yetmiyor', () => {
    expect(matrisDurumu('verilmeli', 0, 40)).toEqual({ ad: 'Talepte', ton: 'bilgi' });
    expect(matrisDurumu('verilmeli', 15, 40)).toEqual({ ad: 'Talepte, yetmiyor', ton: 'uyari' });
  });
  it('talep yokken liste durumunun sözcüğünü alır; stokta Yetiyor olur', () => {
    expect(matrisDurumu('gecti', 20, 0)).toEqual({ ad: 'Sipariş günü geçti', ton: 'hata' });
    expect(matrisDurumu('stokta', 0, 0)).toEqual({ ad: 'Yetiyor', ton: 'tamam' });
    expect(matrisDurumu('geliyor', 0, 0)).toEqual({ ad: 'Geliyor', ton: 'bilgi' });
  });
  it('satın alma satırı olmayan malzeme eksiği varsa Sipariş verilmeli, yoksa Yetiyor', () => {
    expect(matrisDurumu(null, 5, 0).ad).toBe('Sipariş verilmeli');
    expect(matrisDurumu(null, 0, 0).ad).toBe('Yetiyor');
  });
});

describe('stokYeter', () => {
  it('bugünden ilk eksik güne kadar gün sayısıdır; eksik yoksa ufuk', () => {
    expect(stokYeterGunu(satir([[1, 0], [4, 30], [6, 10]]), 0)).toBe(4);
    expect(stokYeterGunu(satir([[1, 0]]), 0)).toBeNull();
    expect(stokYeterGunu(undefined, 0)).toBeNull();
    expect(stokYeterMetni(4, false)).toBe('4 gün');
    expect(stokYeterMetni(null, false)).toBe('14+ gün');
    expect(stokYeterMetni(null, true)).toBe('—');
  });
});

describe('gelisGunleri', () => {
  it('yalnız açık siparişleri geliş gününe toplar; verilecek siparişi ve terminsizi saymaz', () => {
    const m = gelisGunleri([alim({}), alim({ miktar: 20, etkin: 4 * G + 20 }), alim({ src: null }), alim({ etkin: null })], TABAN);
    expect([...m]).toEqual([[4 * G, 120]]);
  });
});

describe('nabizMetni', () => {
  it('sayıları ve ilk eksik günü yazar', () => {
    expect(nabizMetni(5, '28 Kas', 1)).toBe('5 malzemede stok plana yetmiyor, ilk eksik 28 Kas. 1 malzemenin en geç sipariş günü geçti.');
    expect(nabizMetni(0, null, 0)).toBe('Plana göre 14 günde stok yetmeyen malzeme yok.');
  });
});

describe('ufukOzeti', () => {
  it('eksiği olan malzemeleri sayar, ilk eksik günü verir; açık talepte olanı da stok yetmeyen sayar', () => {
    const a = satir([[3, 0], [5, 10]]);
    const b = { ...satir([[2, 0]]), talepte: 30 };
    expect(ufukOzeti([a, b, satir([[1, 0]])])).toEqual({ eksikMalzeme: 2, ilkEksikGunu: 5 * G });
    expect(ufukOzeti([])).toEqual({ eksikMalzeme: 0, ilkEksikGunu: null });
  });
});
