import { describe, expect, it } from 'vitest';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { hareketYaz, kaydedilecekler, parcaDegistir, sahneEksigi, sahneOner, VARSAYILAN_HAREKET, yonOner, type ParcaKutusu } from './kurallar.ts';

const adim = (sira: number, parcalar: number[], ek: Partial<SahneAdimi['hareket']> = {}): SahneAdimi => ({ sira, hareket: { ...VARSAYILAN_HAREKET, parcalar, ...ek } });
const kutu = (en: [number, number, number], ust: [number, number, number]): ParcaKutusu => ({ en, ust });

describe('talimat sahnesi kuralları (3209 a)', () => {
  it('öneri: en büyük parça gövde kalır, kalanlar büyükten küçüğe adımlara dağılır, yön merkezden dışarıdır', () => {
    const kutular = [
      kutu([0, 0, 0], [100, 100, 20]),
      kutu([40, 40, 20], [60, 60, 60]),
      kutu([0, 45, 5], [5, 55, 15]),
      kutu([95, 45, 5], [100, 55, 15]),
    ];
    const o = sahneOner(kutular, [1, 2]);
    expect(o.map((a) => a.hareket.parcalar)).toEqual([[1], [2, 3]]);
    expect(o[0]?.hareket.yon).toBe('+Z');
    expect(o[1]?.hareket.sirali).toBe(true);
    expect(yonOner(kutular[2]!, kutu([0, 0, 0], [100, 100, 60]))).toBe('-X');
    expect(sahneOner([], [1])).toEqual([]);
  });

  it('parça tek adımda girer: başka adıma eklenen parça eskisinden çıkar; ikinci tıklama çıkarır', () => {
    let a = parcaDegistir([adim(1, [5])], 2, 5);
    expect(a.map((x) => x.hareket.parcalar)).toEqual([[], [5]]);
    a = parcaDegistir(a, 2, 5);
    expect(a.map((x) => x.hareket.parcalar)).toEqual([[], []]);
    expect(kaydedilecekler(a)).toEqual([]);
    expect(sahneEksigi([adim(1, [5]), adim(2, [5])])).toBe('6. parça hem 1. hem 2. adımda giriyor; parça tek adımda takılır.');
    expect(hareketYaz([], 3, { yon: '-Y' })).toEqual([adim(3, [], { yon: '-Y' })]);
  });
});
