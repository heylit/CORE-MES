import { describe, expect, it } from 'vitest';
import { degerleriAyir, istatistik, oneriler, seriAnahtari, seriler } from './spc.ts';

describe('SPC', () => {
  it('değerleri boşluk, satır ve noktalı virgülle; tek parçada virgülle ayırır', () => {
    expect(degerleriAyir('1,5 2,5;3')).toEqual([1.5, 2.5, 3]);
    expect(degerleriAyir('1.1,1.2,1.3')).toEqual([1.1, 1.2, 1.3]);
    expect(degerleriAyir('')).toEqual([]);
  });

  it('veri yoksa ve azsa durumu yazar; yetenekli süreç Cpk >= 1,33', () => {
    expect(istatistik({ noktalar: [], lo: 0, hi: 1 }).durum.metin).toBe('Veri yok');
    const noktalar = [10.0, 10.01, 9.99, 10.0, 10.01, 9.99, 10.0, 10.01, 9.99, 10.0, 10.01, 9.99].map((v) => ({ v }));
    const s = istatistik({ noktalar, lo: 9.9, hi: 10.1 });
    expect(s.n).toBe(12);
    expect(s.durum.metin).toBe('Yetenekli');
    expect(s.cpk).toBeGreaterThan(1.33);
  });

  it('8 ardışık nokta aynı tarafta kontrol dışı', () => {
    const noktalar = [...Array(8).fill(10.05), ...Array(4).fill(9.9)].map((v: number) => ({ v }));
    expect(istatistik({ noktalar, lo: 9, hi: 11 }).kontrolde).toBe(false);
  });

  it('seriler muayene ve ölçüm serisinden birleşir; anahtar parça ve karakteristik', () => {
    const L = seriler({
      insp: [{ _id: 'i1', parcaNo: 'p1', tarih: '2026-01-01', chars: [{ ad: 'Çap', tip: 'Nicel', nominal: '10', alt: '0,1', ust: '0,1', olcum: '10,02' }] }],
      spc: [{ _id: 's1', parcaNo: 'P1', ad: 'çap', nominal: '10', alt: '0.1', ust: '0.1', tarih: '2026-01-02', degerler: [10.01, 9.99] }],
    });
    expect(L).toHaveLength(1);
    expect(L[0]!.n).toBe(3);
    expect(L[0]!.kimlikler).toEqual(['s1']);
    expect(seriAnahtari(' p1 ', 'ÇAP')).toBe(seriAnahtari('P1', 'çap'));
    expect(oneriler(L[0]!)[0]).toContain('en az 25');
  });
});
