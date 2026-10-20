import { describe, expect, it } from 'vitest';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { aramaUyar, degistir, hepsiniDegistir, reddedilenler } from './secim.ts';

describe('toplu seçim', () => {
  it('degistir ekler ya da çıkarır; hepsiniDegistir yalnız görünenlere dokunur', () => {
    expect([...degistir(new Set([1]), 2)]).toEqual([1, 2]);
    expect([...degistir(new Set([1, 2]), 2)]).toEqual([1]);
    expect([...hepsiniDegistir(new Set([9]), [1, 2])].sort()).toEqual([1, 2, 9]);
    expect([...hepsiniDegistir(new Set([1, 2, 9]), [1, 2])]).toEqual([9]);
    expect([...hepsiniDegistir(new Set([9]), [])]).toEqual([9]);
  });

  it('arama büyük-küçük harf ve Türkçe harfe duyarsızdır; boş arama hepsine uyar', () => {
    expect(aramaUyar('', 'x')).toBe(true);
    expect(aramaUyar('İŞ', 'iş merkezi')).toBe(true);
    expect(aramaUyar('im-b', 'IM-B')).toBe(true);
    expect(aramaUyar('ışı', 'IŞIK')).toBe(true);
    expect(aramaUyar('torna', 'Freze', 'IM-1')).toBe(false);
  });

  it('reddedilenler 403 ayrıntısından kimlikleri okur; başka hata ya da biçimsiz ayrıntıda boştur', () => {
    const hata = new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'x', ayrinti: { kisiIdleri: [3, 'a', 5] } });
    expect(reddedilenler(hata, 'kisiIdleri')).toEqual([3, 5]);
    expect(reddedilenler(hata, 'isMerkeziIdleri')).toEqual([]);
    expect(reddedilenler(new Error('x'), 'kisiIdleri')).toEqual([]);
    expect(reddedilenler(new ApiHatasi(500, null), 'kisiIdleri')).toEqual([]);
  });
});
