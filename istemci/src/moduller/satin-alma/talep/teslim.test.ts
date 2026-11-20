import { describe, expect, it } from 'vitest';
import { bolmeBaslangici, bolmeHatasi, bolunmusKalemler, donemAnahtari, teslimGrubu, toplamaPlani, type GrupKalemi, type TopluKalem } from './teslim.ts';

const k = (anahtar: string, termin: string, miktar: number | null, grup: string | null = 'A'): TopluKalem => ({ anahtar, grup, termin, miktar });

describe('teslim', () => {
  it('dönem anahtarı: hafta pazartesi başlar, ay ilk yedi karakter, her N gün ilk terminden sayılır', () => {
    expect(donemAnahtari('haftalik', 1, '', '2026-11-22')).not.toBe(donemAnahtari('haftalik', 1, '', '2026-11-23'));
    expect(donemAnahtari('haftalik', 1, '', '2026-11-23')).toBe(donemAnahtari('haftalik', 1, '', '2026-11-29'));
    expect(donemAnahtari('aylik', 1, '', '2026-11-30')).toBe('2026-11');
    expect(donemAnahtari('herN', 3, '2026-11-10', '2026-11-12')).toBe('0');
    expect(donemAnahtari('herN', 3, '2026-11-10', '2026-11-13')).toBe('1');
  });

  it('aynı gruptaki kalemler dönem başına birleşir; termin en erken, miktar toplam', () => {
    const l = [k('a', '2026-11-12', 3), k('b', '2026-11-10', 6.5), k('c', '2026-11-17', 2), k('d', '2026-11-11', 1, 'B')];
    expect(toplamaPlani(l, 'haftalik', 1)).toEqual([{ kalan: 'b', birlesenler: ['a'], miktar: 9.5, termin: '2026-11-10' }]);
    expect(toplamaPlani(l, 'tek', 1)).toEqual([{ kalan: 'b', birlesenler: ['a', 'c'], miktar: 11.5, termin: '2026-11-10' }]);
    expect(toplamaPlani(l, 'gunluk', 1)).toEqual([]);
  });

  it('grubu, termini ya da miktarı olmayan kalem toplanmaz', () => {
    const l = [k('a', '2026-11-10', 1, null), k('b', '2026-11-10', 1), k('c', '', 1), k('d', '2026-11-10', null), k('e', '2026-11-10', 0)];
    expect(toplamaPlani(l, 'tek', 1)).toEqual([]);
  });

  it('bölme: en az iki satır, tarih, sıfırdan büyük miktar ve toplam tutmalı', () => {
    expect(bolmeHatasi(10, [{ termin: '2026-11-10', miktar: 10 }], 'kg')).toBe('En az iki teslim girin.');
    expect(bolmeHatasi(10, [{ termin: '2026-11-10', miktar: 5 }, { termin: '', miktar: 5 }], 'kg')).toBe('Her teslimin tarihini girin.');
    expect(bolmeHatasi(10, [{ termin: '2026-11-10', miktar: 10 }, { termin: '2026-11-11', miktar: 0 }], 'kg')).toBe('Her teslimin miktarı sıfırdan büyük olmalı.');
    expect(bolmeHatasi(10, [{ termin: '2026-11-10', miktar: 4 }, { termin: '2026-11-11', miktar: 5 }], 'kg')).toBe('Toplam kalem miktarını tutmuyor: 1 kg eksik. Miktarları düzeltin.');
    expect(bolmeHatasi(10, [{ termin: '2026-11-10', miktar: 4 }, { termin: '2026-11-11', miktar: 6.5 }], 'kg')).toBe('Toplam kalem miktarını tutmuyor: 0,5 kg fazla. Miktarları düzeltin.');
    expect(bolmeHatasi(10, [{ termin: '2026-11-10', miktar: 3.3 }, { termin: '2026-11-11', miktar: 6.7 }], 'kg')).toBeNull();
  });

  it('bölme başlangıcı: ikinci satır bir hafta sonra, miktarı boş', () => {
    expect(bolmeBaslangici('2026-11-28', '8')).toEqual([{ termin: '2026-11-28', miktar: '8' }, { termin: '2026-12-05', miktar: '' }]);
    expect(bolmeBaslangici('', '8')[1]).toEqual({ termin: '', miktar: '' });
  });

  const kartli: GrupKalemi = { kart: { no: 7, birim: 'kg' }, birim: 'kg', malzemeNo: null, mevcut: null, satisSatiriId: null, isEmriId: null, kabulHatali: false, emirId: '', kabul: null };
  it('teslim grubu: malzeme, birim, emir ve kabul sınırı anahtardır', () => {
    const g = teslimGrubu('malzeme', kartli)!;
    expect(g).not.toBeNull();
    expect(teslimGrubu('malzeme', { ...kartli, emirId: '31' })).not.toBe(g);
    expect(teslimGrubu('malzeme', { ...kartli, kabul: { en: 2 } })).not.toBe(g);
    expect(teslimGrubu('malzeme', { ...kartli, kart: { no: 7, birim: 'm' } })).not.toBe(g);
    expect(teslimGrubu('malzeme', { ...kartli, kart: { no: 8, birim: 'kg' } })).not.toBe(g);
  });

  it('teslim grubu: hizmet, kartsız, satış, fason, kabulü hatalı ve bağlı kalem dışarıda; düzenlenen kalem yalnız bölünür', () => {
    expect(teslimGrubu('hizmet', kartli)).toBeNull();
    expect(teslimGrubu('malzeme', { ...kartli, kart: null })).toBeNull();
    expect(teslimGrubu('malzeme', { ...kartli, satisSatiriId: 81 })).toBeNull();
    expect(teslimGrubu('malzeme', { ...kartli, isEmriId: 501 })).toBeNull();
    expect(teslimGrubu('malzeme', { ...kartli, kabulHatali: true })).toBeNull();
    const duzenlenen = { ...kartli, kart: null, malzemeNo: 7, mevcut: { bagli: false } };
    expect(teslimGrubu('malzeme', duzenlenen)).toBeNull();
    expect(teslimGrubu('malzeme', duzenlenen, true)).toBe(teslimGrubu('malzeme', kartli));
    expect(teslimGrubu('malzeme', { ...duzenlenen, mevcut: { bagli: true } }, true)).toBeNull();
  });

  it('bölünen kalem: kimlik yalnız ilk satırda, kopyalar yeni anahtarlı ve kartlı', () => {
    const k = { anahtar: 'k1', mevcut: { id: 'm1' } as { id: string } | null, kart: null as string | null, termin: '2026-11-10', miktar: '8', adet: '3', not: 'x' };
    let n = 0;
    const l = bolunmusKalemler(k, [{ termin: '2026-11-10', miktar: '5' }, { termin: '2026-11-17', miktar: '3' }], () => `y${String(++n)}`, () => 'kart-7');
    expect(l).toEqual([
      { anahtar: 'k1', mevcut: { id: 'm1' }, kart: null, termin: '2026-11-10', miktar: '5', adet: '', not: 'x' },
      { anahtar: 'y1', mevcut: null, kart: 'kart-7', termin: '2026-11-17', miktar: '3', adet: '', not: 'x' },
    ]);
  });
});
