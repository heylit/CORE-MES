import { describe, expect, it } from 'vitest';
import { ayEkle, ayIzgarasi, gunEkle, haftaBasi, haftaGunu, tarihMetni } from './tarih.ts';

describe('takvim tarihleri', () => {
  it('ay ızgarası pazartesiden pazara, ay sınırlarını kapsar', () => {
    expect(ayIzgarasi('2031-03-12')).toEqual({ baslangic: '2031-02-24', bitis: '2031-04-06' });
    expect(ayIzgarasi('2027-02-01')).toEqual({ baslangic: '2027-02-01', bitis: '2027-02-28' });
  });
  it('hafta pazartesi başlar; ay eklemek ayın ilk gününe gider', () => {
    expect(haftaGunu('2031-03-16')).toBe(6);
    expect(haftaBasi('2031-03-16')).toBe('2031-03-10');
    expect(ayEkle('2031-01-31', 1)).toBe('2031-02-01');
    expect(ayEkle('2031-01-15', -1)).toBe('2030-12-01');
    expect(gunEkle('2031-02-28', 1)).toBe('2031-03-01');
  });
  it('tarih metni gün, kısa ay ve gün adıdır', () => {
    expect(tarihMetni('2031-03-12')).toBe('12 Mar Çar');
  });
});
