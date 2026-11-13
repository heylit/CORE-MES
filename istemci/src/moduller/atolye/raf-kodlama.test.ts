import { describe, expect, it } from 'vitest';
import { adrestenBolme, bolmeAraligi, duzMu, gozKodu, rafAraligi, sirasiBozukMu, type RafBoyu } from './raf-kodlama.ts';

// 3168: 3 bölme x 4 kat x 1 göz; numaralar sunucunun sırasıyla (bölme, göz sütunu, kat aşağıdan yukarı).
const raf = (gozNolari: (number | null)[] | null, ek: Partial<RafBoyu> = {}): RafBoyu => ({ kod: 'A', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 1, gozNolari, ...ek });
const ilk = Array.from({ length: 12 }, (_, i) => i + 1);

describe('raf kodlama (3168)', () => {
  it('sıra numaralı kod raf harfi ve numaradır; aşağıdan yukarı, sonra yandaki bölme', () => {
    const r = raf(ilk);
    expect(duzMu(r)).toBe(true);
    expect([1, 2, 3, 4].map((k) => gozKodu(r, 1, k, 1))).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect([1, 2, 3, 4].map((k) => gozKodu(r, 2, k, 1))).toEqual(['A5', 'A6', 'A7', 'A8']);
    expect(bolmeAraligi(r, 2)).toBe('A5–A8');
    expect(rafAraligi(r)).toBe('A1–A12');
    expect(sirasiBozukMu(r)).toBe(false);
  });

  it('öbür kodlamada (numara verilmez) adres raf, bölme, kat ve gözdür; bölme adı kalır', () => {
    const r = raf(null);
    expect(duzMu(r)).toBe(false);
    expect(gozKodu(r, 2, 3, 1)).toBe('A-02-3-1');
    expect(adrestenBolme(r, 'A-02-3-1')).toBe(2);
  });

  it('sonradan eklenen bölme sıradaki numarayı alır: aralık parçalı, sıra bozuk; numarası gelmeyen göz eski adresle', () => {
    // 2. bölme silinip yeniden eklenmiş: 13-16.
    const r = raf([1, 2, 3, 4, 13, 14, 15, 16, 9, 10, 11, 12]);
    expect(bolmeAraligi(r, 2)).toBe('A13–A16');
    expect(rafAraligi(r)).toBe('A1–A4, A9–A16');
    expect(sirasiBozukMu(r)).toBe(true);
    expect(gozKodu(raf([1, null]), 1, 2, 1)).toBe('A-01-2-1');
  });

  it('3171 R7: aranan gözün bölmesi koddan bölünerek değil, rafın numaralarından bulunur', () => {
    const r = raf([1, 2, 3, 4, 13, 14, 15, 16, 9, 10, 11, 12]);
    expect(adrestenBolme(r, 'A14')).toBe(2);
    expect(adrestenBolme(r, 'A9')).toBe(3);
    expect(adrestenBolme(r, 'A5')).toBeNull();
    expect(adrestenBolme(r, 'B1')).toBeNull();
    expect(adrestenBolme(raf(ilk, { gozSayisi: 2, katSayisi: 2 }), 'A7')).toBe(2);
  });
});
