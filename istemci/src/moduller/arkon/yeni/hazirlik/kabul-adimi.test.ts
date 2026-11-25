import { describe, expect, it } from 'vitest';
import type { KabulIsi } from '../../../stok/disari.ts';
import { kabulAdimiMi, kabulArtiNedeni, kabulHesabi, kabulTuruBul } from './kabul-adimi.ts';

// 3703: mal kabul modundaki depo adımı. Değerler uydurmadır.
const isi = (tur: 'fason' | 'satin-alma', emirNo: string | null): KabulIsi => ({ satir: { emirNo } as KabulIsi['satir'], tur, fason: null, hedef: null });

describe('mal kabul adımı kuralları (3703)', () => {
  it('yalnız depo türü ve receive modu kabul adımıdır', () => {
    expect(kabulAdimiMi('depo', { mode: 'receive' })).toBe(true);
    expect(kabulAdimiMi('depo', { mode: 'pick' })).toBe(false);
    expect(kabulAdimiMi('cnc', { mode: 'receive' })).toBe(false);
  });
  it('yazılacak, kalan ve durum: sıfır, yarım, tam', () => {
    expect(kabulHesabi(0, 0, 120)).toEqual({ yazilacak: 0, kalan: 120, durum: 'sifir' });
    expect(kabulHesabi(48, 0, 120)).toEqual({ yazilacak: 48, kalan: 72, durum: 'yarim' });
    expect(kabulHesabi(120, 0, 120)).toEqual({ yazilacak: 120, kalan: 0, durum: 'tam' });
    // Yarım kabulden sonra sayaç sıfırlanmaz: daha önce yazılan düşülür.
    expect(kabulHesabi(48, 48, 120)).toEqual({ yazilacak: 0, kalan: 72, durum: 'sifir' });
    expect(kabulHesabi(120, 48, 120)).toEqual({ yazilacak: 72, kalan: 0, durum: 'tam' });
  });
  it('Kabul +1 hedefte durur ve nedeni yazar; hedef yoksa kapanmaz', () => {
    expect(kabulArtiNedeni(119, 120)).toBeNull();
    expect(kabulArtiNedeni(120, 120)).toContain('Hedef 120');
    expect(kabulArtiNedeni(5, 0)).toBeNull();
  });
  it('aynı emrin açık fason satırı varsa fason dönüşü, yoksa ara stok', () => {
    expect(kabulTuruBul([isi('fason', 'ORN-UE-1')], 'ORN-UE-1').tur).toBe('fason');
    expect(kabulTuruBul([isi('fason', 'ORN-UE-2'), isi('satin-alma', 'ORN-UE-1')], 'ORN-UE-1').tur).toBe('ara');
    expect(kabulTuruBul([], 'ORN-UE-1')).toEqual({ tur: 'ara', fason: null });
  });
});
