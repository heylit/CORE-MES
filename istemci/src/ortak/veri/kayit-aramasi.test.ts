import { describe, expect, it } from 'vitest';
import { kayitCevabiniOku, kayitSorgusu } from './kayit-aramasi.ts';

describe('kayitCevabiniOku', () => {
  it('sözleşmedeki satırlar okunur; boş açıklama yok sayılır', () => {
    expect(kayitCevabiniOku({ sonuclar: [{ anahtar: '1', baslik: 'UE-0001', aciklama: ' ', yol: '/uretim-emirleri/1' }] }))
      .toEqual([{ anahtar: '1', baslik: 'UE-0001', aciklama: null, yol: '/uretim-emirleri/1' }]);
  });

  it('reddedilen: uygulama dışı adres, eksik alan ve sözleşme dışı cevap sonuç vermez; fazlası kesilir', () => {
    const satir = (yol: unknown, baslik: unknown = 'x') => ({ anahtar: 'a', baslik, aciklama: null, yol });
    expect(kayitCevabiniOku({ sonuclar: [satir('//dis.example/x'), satir('https://dis.example'), satir('/a/../b'), satir('/a', ''), satir(5)] })).toEqual([]);
    for (const ham of [null, 3, 'a', [], { sonuclar: 'x' }]) expect(kayitCevabiniOku(ham)).toEqual([]);
    expect(kayitCevabiniOku({ sonuclar: Array.from({ length: 9 }, () => satir('/a')) })).toHaveLength(5);
  });
});

describe('kayitSorgusu', () => {
  it('iki harften kısa ya da altmıştan uzun sorgu sunucuya gitmez', () => {
    expect(kayitSorgusu(' ue ')).toBe('ue');
    expect(kayitSorgusu('u')).toBeNull();
    expect(kayitSorgusu('x'.repeat(61))).toBeNull();
  });
});
