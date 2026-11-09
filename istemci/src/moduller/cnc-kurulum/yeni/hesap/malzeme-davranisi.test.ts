import { beforeEach, describe, expect, it } from 'vitest';
import { durumKur } from '../depo.ts';
import type { IsoGrubu } from '../veri/tipler.ts';
import { MB_ISO, matBeh, matRef, mbK, mbStars, type MalzemeOzu } from './malzeme-davranisi.ts';

// Beklenen değerler kaynak koddaki tablo ve formülden elle hesaplanmıştır; katalog malzemesine yalnız referans (C45) için dayanılır.
function malzeme(iso: IsoGrubu, vcK: number, fk: number, ek: Partial<MalzemeOzu> = {}): MalzemeOzu {
  return { id: 'deneme', name: 'Deneme', vcK, fk, iso, ...ek };
}

beforeEach(() => { durumKur(null, null); });

describe('matBeh', () => {
  it('ISO grubunun varsayılanını verir', () => {
    expect(matBeh(malzeme('S', 50, 0.6))).toEqual({ eng: 0.6, apT: 0.6, nk: 0.7, tune: 12, wh: 1 });
    expect(matBeh(malzeme('H', 60, 0.5))).toEqual({ eng: 0.45, apT: 0.5, nk: 0.7, tune: 10, wh: 0 });
  });

  it('tanınmayan ISO grubu P varsayılanına düşer', () => {
    expect(matBeh(malzeme('X' as IsoGrubu, 100, 1))).toEqual({ eng: 1, apT: 1, nk: 1, tune: 0, wh: 0 });
  });

  it('malzemeye özel değer grubu ezer; boş, eksik ve sayı olmayan değer ezmez', () => {
    const beh = { eng: 0.5, apT: '0.9', nk: '', tune: null, wh: 'abc' } as unknown as MalzemeOzu['beh'];
    expect(matBeh(malzeme('M', 110, 0.7, { beh }))).toEqual({ eng: 0.5, apT: 0.9, nk: 0.85, tune: 6, wh: 1 });
  });

  it('metal olmayan malzemede iş sertleşmesi sıfırdır', () => {
    expect(matBeh(malzeme('M', 110, 0.7, { metal: 0 })).wh).toBe(0);
    expect(matBeh(malzeme('M', 110, 0.7, { metal: 0.4 })).wh).toBe(1);
  });

  it('grup tablosunu değiştirmez', () => {
    matBeh(malzeme('M', 110, 0.7, { beh: { eng: 0.1 } }));
    expect(MB_ISO.M.eng).toBe(0.8);
  });
});

describe('mbK', () => {
  it('süre katsayısı 1 / (Vc · f), kabada kavrama ve talaş derinliği çarpanına bölünür', () => {
    // S: eng 0,6 ve apT 0,6; 1 / (100 · 0,5) = 0,02
    const k = mbK(malzeme('S', 100, 0.5));
    expect(k.fin).toBeCloseTo(0.02, 12);
    expect(k.mill).toBeCloseTo(0.02 / 0.6, 12);
    expect(k.turn).toBeCloseTo(0.02 / 0.6, 12);
  });

  it('Vc · f 1\'in altındaysa payda 1 sayılır', () => {
    expect(mbK(malzeme('P', 0.5, 0.5)).fin).toBe(1);
  });
});

describe('mbStars', () => {
  it('referans C45 (Vc 180, f çarpanı 0,9) katalogdan gelir', () => {
    expect(matRef()).toMatchObject({ id: 'c45', vcK: 180, fk: 0.9, iso: 'P' });
  });

  // C45 kaba katsayısı 1 / 162. Oran = 162 / (Vc · f · eng).
  it.each([
    ['P', 400, 1, 1, 0.405],
    ['P', 180, 0.9, 2, 1],
    ['P', 120, 0.9, 3, 1.5],
    ['P', 60, 0.9, 4, 3],
    ['S', 50, 0.6, 5, 9],
  ] as const)('%s Vc %d f %d: %d yıldız, oran %d', (iso, vcK, fk, yildiz, oran) => {
    const s = mbStars(malzeme(iso, vcK, fk));
    expect(s.yildiz).toBe(yildiz);
    expect(s.oran).toBeCloseTo(oran, 9);
  });

  // Eşikler 0,8 / 1,3 / 2,2 / 4: sınırın kendisi üst yıldıza geçer.
  it.each([
    [205, 1], [202.5, 2], [200, 2],
    [126, 2], [124, 3],
    [74, 3], [162 / 2.2, 4], [73, 4],
    [41, 4], [40.5, 5], [40, 5],
  ])('P Vc %d f 1: %d yıldız', (vcK, yildiz) => {
    expect(mbStars(malzeme('P', vcK, 1)).yildiz).toBe(yildiz);
  });
});
