import { describe, expect, it } from 'vitest';
import { baslikAnahtari, baslikImzasi, eksikZorunlular, eslemeOner, hucreMetni, ilkDegerler, sutunaAta, type EslemeAlani } from './esleme.ts';

// Sentetik alanlar ve başlıklar (3129): gerçek ad ya da kod yok.
const ALANLAR: EslemeAlani[] = [
  { anahtar: 'kod', baslik: 'Malzeme kodu', zorunlu: true, esanlamlar: ['stok kodu', 'kod'] },
  { anahtar: 'miktar', baslik: 'Miktar', zorunlu: true, esanlamlar: ['mevcut'] },
  { anahtar: 'konum', baslik: 'Konum kodu', zorunlu: true, esanlamlar: ['raf', 'konum'] },
  { anahtar: 'tedarikciParti', baslik: 'Tedarikçi parti no', esanlamlar: ['parti'] },
  { anahtar: 'tedarikci', baslik: 'Tedarikçi', esanlamlar: ['firma'] },
];

describe('sütun eşleme (3134 a)', () => {
  it('başlık Türkçe harf, büyük/küçük harf ve işaretten bağımsız karşılaştırılır', () => {
    expect(baslikAnahtari('  STOK KODU * ')).toBe('stok kodu');
    expect(baslikAnahtari('Tedarikçi Parti No.')).toBe('tedarikci parti no');
    expect(baslikAnahtari('İŞLEM / ÖLÇÜ')).toBe('islem olcu');
    expect(baslikImzasi(['Stok Kodu', 'Raf'])).toBe(baslikImzasi(['stok kodu', 'RAF']));
  });

  it('eş anlamlıdan önerilir; alanın kendi adı önce gelir, bir alan iki sütuna düşmez', () => {
    expect(eslemeOner(['Stok Kodu', 'Mevcut', 'Raf', 'Parti', 'Açıklama'], ALANLAR)).toEqual(['kod', 'miktar', 'konum', 'tedarikciParti', null]);
    // "Tedarikçi" kendi adıyla eşleşir; "Tedarikçi parti no" sütunu tedarikçiye düşmez.
    expect(eslemeOner(['Tedarikçi', 'Tedarikçi parti no', 'Kod', 'Malzeme kodu'], ALANLAR)).toEqual(['tedarikci', 'tedarikciParti', null, 'kod']);
  });

  it('seçilen alan başka sütundan kalkar; zorunlu alan eksikse söylenir', () => {
    const e = sutunaAta(['kod', 'miktar', null], 2, 'miktar');
    expect(e).toEqual(['kod', null, 'miktar']);
    expect(eksikZorunlular(e, ALANLAR).map((a) => a.baslik)).toEqual(['Konum kodu']);
    expect(eksikZorunlular(sutunaAta(e, 1, 'konum'), ALANLAR)).toEqual([]);
  });

  it('hücre metne çevrilir: tarih YYYY-AA-GG, sayı kuyruksuz, boş ""; ilk beş satır önizlenir', () => {
    expect(hucreMetni(new Date(Date.UTC(2027, 2, 31)))).toBe('2027-03-31');
    expect(hucreMetni(0.1 + 0.2)).toBe('0.3');
    expect(hucreMetni(120)).toBe('120');
    expect(hucreMetni(null)).toBe('');
    expect(hucreMetni('  ORN-1 ')).toBe('ORN-1');
    expect(ilkDegerler([['a'], ['b'], [null], ['d'], ['e'], ['f']], 0)).toEqual(['a', 'b', '', 'd', 'e']);
  });
});
