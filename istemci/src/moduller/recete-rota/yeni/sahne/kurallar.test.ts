import { describe, expect, it } from 'vitest';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { hareketYaz, kaydedilecekler, sablonHareketiUygula, parcaDegistir, sahneEksigi, sahneOner, VARSAYILAN_HAREKET, yonOner, type ParcaKutusu } from './kurallar.ts';

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

  it('şablon hareketi adımlara sırayla uygulanır; var olan parça ve kamera kalır, eksik parça sayısı bildirilir (3646)', () => {
    const kamera = { yatay: 1, dikey: 0.5, uzaklik: 300 };
    const mevcut = [adim(1, [2], { kamera })];
    const s = { yon: '-Y' as const, mesafeMm: 60, sureSn: 2.4, sirali: true };
    const r = sablonHareketiUygula(mevcut, [1, 2], [{ sahneHareketi: { ...s, parcaSayisi: 1 } }, { sahneHareketi: { ...s, parcaSayisi: 4 } }, { sahneHareketi: { ...s, parcaSayisi: 9 } }]);
    expect(r.uygulanan).toBe(2);
    expect(r.adimlar.find((a) => a.sira === 1)?.hareket).toMatchObject({ ...s, parcalar: [2], kamera });
    expect(r.adimlar.find((a) => a.sira === 2)?.hareket).toMatchObject({ ...s, parcalar: [], kamera: null });
    expect([...r.beklenen]).toEqual([[2, 4]]);
    expect(kaydedilecekler(r.adimlar).map((a) => a.sira)).toEqual([1]);
    expect(sablonHareketiUygula(mevcut, [1], [{ sahneHareketi: null }]).uygulanan).toBe(0);
    // Yalnız "sıralı" farkı da ezilecek değer sayılır; aynı değerler fark sayılmaz.
    const ayni = { ...s, sirali: false };
    const m2 = [adim(1, [2], { ...ayni })];
    expect(sablonHareketiUygula(m2, [1], [{ sahneHareketi: { ...ayni, parcaSayisi: 1 } }]).degisen).toEqual([]);
    expect(sablonHareketiUygula(m2, [1], [{ sahneHareketi: { ...ayni, sirali: true, parcaSayisi: 1 } }]).degisen).toEqual([1]);
  });
});
