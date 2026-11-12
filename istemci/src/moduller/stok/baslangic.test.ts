import { describe, expect, it } from 'vitest';
import type { BaslangicSatirDenetimi } from '#paylasilan/sozlesme/stok.ts';
import { eslemeOner } from '../../ortak/excel/esleme.ts';
import {
  BASLANGIC_ALANLARI, duzeltmeler, eslenecekKodlar, gidenSatirlar, haricDegistir, hucreDegistir, hucreDuzeltmeSayisi, kodaUygula, satirlariKur, sayilar,
  yuklenebilir,
} from './baslangic.ts';

// Sentetik satırlar (3129): ORN- uydurma kodlar.
const BASLIKLAR = ['Stok Kodu', 'Mevcut', 'Raf', 'Lot', 'SKT', 'Fiyat'];
const ham = [
  { no: 2, hucreler: ['ORN-HM-1', '1.234,5', 'ORN-A-1', null, '31.03.2027', 10] },
  { no: 3, hucreler: ['ORN-YOK', 8, 'ORN-A-1', 'ORN-L-1', new Date(Date.UTC(2027, 0, 5)), 12] },
  { no: 4, hucreler: ['orn-yok', '2,5', 'ORN-Z-9', null, null, null] },
];
const denetim = (sira: number, ek: Partial<BaslangicSatirDenetimi> = {}): BaslangicSatirDenetimi => ({
  sira, malzeme: { id: 1, kod: 'ORN-HM-1', ad: 'ORN çubuk', birim: 'kg', tur: 'hammadde', kalite: null, durum: null, islem: null, olcu: null },
  konum: { id: 9, kod: 'ORN-A-1' }, durum: 'eklenecek', hatalar: [], uyarilar: [], ...ek,
});

describe('başlangıç stoğu düzenleme modeli (3134 a)', () => {
  const esleme = eslemeOner(BASLIKLAR, BASLANGIC_ALANLARI);
  const satirlar = satirlariKur(ham, esleme);

  it('kendi Excel başlıkları alanlara önerilir; fiyat sütunu hiçbir alana bağlanmaz', () => {
    expect(esleme).toEqual(['malzemeKodu', 'miktar', 'konumKodu', 'lotNo', 'sonKullanma', null]);
  });

  it('dosya değeri sunucunun biçimine çevrilir: binlik ve virgüllü ondalık, gg.aa.yyyy ve Excel tarihi', () => {
    expect(satirlar.map((s) => [s.sira, s.dosya.miktar, s.dosya.sonKullanma])).toEqual([[2, '1234.5', '2027-03-31'], [3, '8', '2027-01-05'], [4, '2.5', '']]);
    expect(hucreDuzeltmeSayisi(satirlar)).toBe(0);
  });

  it('bulunamayan kod panelde kod başına bir kez; seçim aynı koddaki bütün satırlara (büyük/küçük harf ayırmadan) uygulanır', () => {
    const d = new Map([[2, denetim(2)], [3, denetim(3, { malzeme: null, durum: 'hatali' })], [4, denetim(4, { malzeme: null, konum: null, durum: 'hatali' })]]);
    expect(eslenecekKodlar(satirlar, d)).toEqual([{ tur: 'malzeme', kod: 'ORN-YOK', satir: 2 }, { tur: 'konum', kod: 'ORN-Z-9', satir: 1 }]);
    const sonra = kodaUygula(satirlar, 'malzeme', 'ORN-YOK', { id: 7, kod: 'ORN-HM-7' });
    expect(sonra.map((s) => s.malzeme?.id ?? null)).toEqual([null, 7, 7]);
    const giden = gidenSatirlar(sonra);
    expect(giden[1]).toEqual({ sira: 3, miktar: '8', malzemeId: 7, konumKodu: 'ORN-A-1', lotNo: 'ORN-L-1', sonKullanma: '2027-01-05' });
    expect(duzeltmeler(sonra).filter((x) => x.alan === 'malzeme')).toEqual([
      { sira: 3, alan: 'malzeme', dosyada: 'ORN-YOK', girilen: 'ORN-HM-7', toplu: true },
      { sira: 4, alan: 'malzeme', dosyada: 'orn-yok', girilen: 'ORN-HM-7', toplu: true },
    ]);
  });

  it('hücre düzeltmesi ve hariç tutma listeye girer; hariç satır sunucuya gitmez; hatalı ya da denetlenmemiş satır varken yüklenmez', () => {
    let l = hucreDegistir(satirlar, 2, 'miktar', '12,5');
    l = hucreDegistir(l, 2, 'lotNo', ' ORN-L-9 ');
    l = haricDegistir(l, 4);
    expect(duzeltmeler(l)).toEqual([
      { sira: 2, alan: 'miktar', dosyada: '1234.5', girilen: '12.5', toplu: false },
      { sira: 2, alan: 'lotNo', dosyada: null, girilen: 'ORN-L-9', toplu: false },
      { sira: 4, alan: 'haric', dosyada: null, girilen: null, toplu: false },
    ]);
    expect(hucreDuzeltmeSayisi(l)).toBe(2);
    expect(gidenSatirlar(l).map((s) => s.sira)).toEqual([2, 3]);
    const say = sayilar(l, new Map([[2, denetim(2)], [3, denetim(3, { durum: 'uyarili' })]]));
    expect(say).toEqual({ eklenecek: 1, uyarili: 1, hatali: 0, haric: 1, bekliyor: 0 });
    expect(yuklenebilir(say)).toBe(true);
    expect(yuklenebilir(sayilar(l, new Map([[2, denetim(2)]])))).toBe(false);
    expect(yuklenebilir(sayilar(l, new Map([[2, denetim(2)], [3, denetim(3, { durum: 'hatali' })]])))).toBe(false);
  });
});
