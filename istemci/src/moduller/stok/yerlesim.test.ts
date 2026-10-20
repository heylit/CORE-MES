import { describe, expect, it } from 'vitest';
import { adresAraligi, bolmeNo, bosYerBul, cakisanlar, carpisir, dunyaya, ilkYerlesim, sonrakiKod, sutunAdi, yeniRaf, yerlesmemisMi } from './yerlesim.ts';

const bina = { x0: -10, x1: 30, z0: -30, z1: 10 }, kabul = { x: 10, z: 5, genislik: 12, derinlik: 5 };
describe('yerleşim geometrisi (önizlemedeki eksen)', () => {
  it('raf ekseni: bölmeler -z yönünde; 90° saat yönünün tersine döndürür', () => {
    expect(dunyaya({ xM: 1, zM: 2, aci: 0 }, 0, -3)).toEqual({ x: 1, z: -1 });
    const p = dunyaya({ xM: 0, zM: 0, aci: 90 }, 0, -3);
    expect(p.x).toBeCloseTo(-3); expect(p.z).toBeCloseTo(0);
  });
  it('çakışma: üst üste raflar çakışır, koridorla ayrılanlar çakışmaz', () => {
    const a = yeniRaf('palet', 0, 0, 'A'), b = { ...yeniRaf('palet', 0.5, 0, 'B') }, c = { ...yeniRaf('palet', 5, 0, 'C') };
    expect(carpisir(a, b)).toBe(true);
    expect(carpisir(a, c)).toBe(false);
    expect([...cakisanlar([a, b, c], (r) => r.kod)].sort()).toEqual(['A', 'B']);
  });
  it('boş yer: bina içinde, kabul alanına ve rafa koridor payıyla değmeyen en yakın yer', () => {
    const var1 = { ...yeniRaf('palet', 0, 0, 'A') };
    const y = bosYerBul(yeniRaf('palet', 0, 0, 'B'), [var1], bina, kabul, 0, 0)!;
    expect(carpisir({ ...yeniRaf('palet', 0, 0, 'B'), xM: y.x, zM: y.z }, var1, 1.6)).toBe(false);
  });
  it('numaralama, sonraki kod, sütun adı, adres aralığı', () => {
    expect([0, 1, 2].map((k) => bolmeNo({ numaralama: 'cift', ilkBolme: 1 }, k))).toEqual([2, 4, 6]);
    expect(sonrakiKod([{ kod: 'A' }, { kod: 'B' }])).toBe('C');
    expect([sutunAdi(0), sutunAdi(25), sutunAdi(26)]).toEqual(['A', 'Z', 'AA']);
    expect(adresAraligi(yeniRaf('celik', 0, 0, 'B'))).toEqual(['B-01-01', 'B-06-05']);
  });
  it('yerleşmemiş raflar sırt sırta çiftler ve koridorla dizilir, çakışmaz', () => {
    const r = [yeniRaf('palet', 0, 0, 'A'), yeniRaf('palet', 0, 0, 'A'), yeniRaf('palet', 0, 0, 'B')].map((x) => ({ ...x, xM: 0, zM: 0 }));
    expect(yerlesmemisMi(r)).toBe(true);
    const y = ilkYerlesim(r, bina);
    expect(y[1]!.onYuzTers).toBe(true);
    expect(cakisanlar(y, (x) => `${x.kod}${x.xM}`).size).toBe(0);
  });
});
