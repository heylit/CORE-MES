import { describe, expect, it } from 'vitest';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { hareketYaz, kaydedilecekler, parcaDegistir, parcaHali, parcaIlerleyisi, sahneEksigi, sahneOner, VARSAYILAN_HAREKET, yonOner, type ParcaKutusu } from './kurallar.ts';

const adim = (sira: number, parcalar: number[], ek: Partial<SahneAdimi['hareket']> = {}): SahneAdimi => ({ sira, hareket: { ...VARSAYILAN_HAREKET, parcalar, ...ek } });
const kutu = (en: [number, number, number], ust: [number, number, number]): ParcaKutusu => ({ en, ust });

describe('talimat sahnesi kuralları (3209 a)', () => {
  it('parça adım süresinde uzaktan yerine gelir; sıralı adımda parçalar sırayla girer', () => {
    const h = adim(1, [3, 4], { sureSn: 2 }).hareket;
    expect(parcaIlerleyisi(h, 3, 0)).toBe(0);
    expect(parcaIlerleyisi(h, 3, 2)).toBe(1);
    expect(parcaIlerleyisi(h, 9, 0)).toBe(1);
    const s = { ...h, sirali: true };
    expect(parcaIlerleyisi(s, 3, 1)).toBe(1);
    expect(parcaIlerleyisi(s, 4, 1)).toBe(0);
    expect(parcaIlerleyisi(s, 4, 2)).toBe(1);
  });

  it('etkin adımdan önce giren yerinde, sonra giren gizli ya da soluk, etkin adımdaki giriş yönünden kayar', () => {
    const adimlar = [adim(1, [1], { yon: '+Z', mesafeMm: 100, sureSn: 1 }), adim(2, [2], { yon: '-X', mesafeMm: 50, sureSn: 1 })];
    expect(parcaHali(adimlar, 2, 1, 0, true)).toEqual({ gorunur: true, hayalet: false, kayma: [0, 0, 0] });
    expect(parcaHali(adimlar, 1, 2, 0, false).gorunur).toBe(false);
    expect(parcaHali(adimlar, 1, 2, 0, true)).toMatchObject({ gorunur: true, hayalet: true });
    expect(parcaHali(adimlar, 2, 2, 0, true).kayma).toEqual([-50, 0, 0]);
    expect(parcaHali(adimlar, 2, 2, 1, true).kayma.map(Math.abs)).toEqual([0, 0, 0]);
    expect(parcaHali(adimlar, 1, 0, 0, true).kayma).toEqual([0, 0, 0]);
  });

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
