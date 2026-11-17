import { describe, expect, it } from 'vitest';
import { LISTE_SOZLESMEYLE_AYNI, paraAlanlariniAyikla } from './maliyet.ts';

describe('maliyet kilidi listesi', () => {
  it('istemcideki liste sozlesmedeki listeyle aynidir (tip denetimi derlemede)', () => {
    expect(LISTE_SOZLESMEYLE_AYNI).toBe(true);
  });
  it('listedeki her alani ayiklar, olculere dokunmaz', () => {
    const durum = { machine: 'f5a', stock: { ax: 40, price: 9 }, life: { vc: 180, price: 840, rate: 1750 } };
    expect(paraAlanlariniAyikla(durum)).toEqual({ machine: 'f5a', stock: { ax: 40 }, life: { vc: 180 } });
    expect(durum.life.rate).toBe(1750);
    expect(paraAlanlariniAyikla(null)).toBeNull();
  });
});
