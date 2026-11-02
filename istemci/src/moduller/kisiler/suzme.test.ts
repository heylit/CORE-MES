import { describe, expect, it } from 'vitest';
import { ayniAdliKisiler, kisileriSuz } from './suzme.ts';

const k = (id: number, ad: string, aktif = true, ek: { sicilNo?: string; gorev?: string; kullaniciAdi?: string } = {}) => ({
  id, ad, aktif, sicilNo: ek.sicilNo ?? null, gorev: ek.gorev ?? null, kullaniciAdi: ek.kullaniciAdi ?? null,
});
const LISTE = [
  k(1, 'Işık Deneme', true, { sicilNo: 'D-1', gorev: 'Tornacı' }),
  k(2, 'Çağla Deneme', false, { kullaniciAdi: 'cagla.deneme' }),
  k(3, 'Ali Örnek', true, { gorev: 'Depo sorumlusu' }),
];

describe('kişi süzme', () => {
  it('ad, sicil no, görev ve kullanıcı adında Türkçe harften bağımsız arar', () => {
    expect(kisileriSuz(LISTE, 'ISIK', 'tumu').map((x) => x.id)).toEqual([1]);
    expect(kisileriSuz(LISTE, 'd-1', 'tumu').map((x) => x.id)).toEqual([1]);
    expect(kisileriSuz(LISTE, 'depo', 'tumu').map((x) => x.id)).toEqual([3]);
    expect(kisileriSuz(LISTE, 'cagla.', 'tumu').map((x) => x.id)).toEqual([2]);
    expect(kisileriSuz(LISTE, '  ', 'tumu')).toHaveLength(3);
  });
  it('durum süzgeci aramayla birlikte uygulanır', () => {
    expect(kisileriSuz(LISTE, '', 'aktif').map((x) => x.id)).toEqual([1, 3]);
    expect(kisileriSuz(LISTE, '', 'pasif').map((x) => x.id)).toEqual([2]);
    expect(kisileriSuz(LISTE, 'deneme', 'pasif').map((x) => x.id)).toEqual([2]);
  });
  it('aynı adlı kişi büyük-küçük harf, Türkçe harf ve boşluktan bağımsız bulunur; düzenlenen kişi sayılmaz', () => {
    expect(ayniAdliKisiler(LISTE, '  ışık   deneme ', null).map((x) => x.id)).toEqual([1]);
    expect(ayniAdliKisiler(LISTE, 'Işık Deneme', 1)).toEqual([]);
    expect(ayniAdliKisiler(LISTE, 'Işık', null)).toEqual([]);
    expect(ayniAdliKisiler(LISTE, '', null)).toEqual([]);
  });
});
