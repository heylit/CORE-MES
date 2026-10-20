import { describe, expect, it } from 'vitest';
import { gecmisMi, gerceklesmeler, gunBasi, yuzde, type SeritDurusu } from './serit.ts';

// Yerel saatle kurulur: test makinesinin saat diliminden bağımsız.
const an = (g: number, s: number, d = 0) => new Date(2026, 9, g, s, d).getTime();
const iso = (g: number, s: number, d = 0) => new Date(an(g, s, d)).toISOString();
const PENCERE = an(12, 0); // 12.10.2026 pazartesi 00:00
const temel: SeritDurusu = { baslangic: iso(12, 8), bitis: iso(12, 10), tekrar: 'yok', gunler: [], tekrarBitis: null, aktif: true };
const saatler = (d: SeritDurusu) => gerceklesmeler(d, PENCERE, 7).map((a) => [new Date(a.bas).getDate(), new Date(a.bas).getHours(), (a.bit - a.bas) / 3_600_000]);

describe('planlı duruş şeridi (kart #544)', () => {
  it('tek seferlik duruş bir kez; pencere dışı ve pasif hiç', () => {
    expect(saatler(temel)).toEqual([[12, 8, 2]]);
    expect(saatler({ ...temel, baslangic: iso(20, 8), bitis: iso(20, 10) })).toEqual([]);
    expect(saatler({ ...temel, aktif: false })).toEqual([]);
  });

  it('her gün tekrar ilk günden başlar, tekrar bitişinden sonra başlamaz', () => {
    expect(saatler({ ...temel, baslangic: iso(14, 8), bitis: iso(14, 9), tekrar: 'gunluk' }).map((x) => x[0])).toEqual([14, 15, 16, 17, 18]);
    expect(saatler({ ...temel, tekrar: 'gunluk', tekrarBitis: iso(14, 12) }).map((x) => x[0])).toEqual([12, 13, 14]);
  });

  it('haftalık yalnız seçili ISO günlerde (1 pazartesi, 7 pazar); önceki günden taşan gece duruşu pencereye kesilir', () => {
    expect(saatler({ ...temel, baslangic: iso(1, 8), bitis: iso(1, 10), tekrar: 'haftalik', gunler: [1, 3, 7] }).map((x) => x[0])).toEqual([12, 14, 18]);
    const gece = gerceklesmeler({ ...temel, baslangic: iso(5, 22), bitis: iso(6, 2), tekrar: 'gunluk' }, PENCERE, 7);
    expect(gece[0]).toEqual({ bas: PENCERE, bit: an(12, 2) });
    expect(gece).toHaveLength(8);
  });

  it('geçmiş: bitmiş tek seferlik ve bitmiş tekrar; süresiz tekrar geçmiş olmaz', () => {
    const simdi = an(15, 12);
    expect(gecmisMi(temel, simdi)).toBe(true);
    expect(gecmisMi({ ...temel, baslangic: iso(16, 8), bitis: iso(16, 9) }, simdi)).toBe(false);
    expect(gecmisMi({ ...temel, tekrar: 'gunluk', tekrarBitis: iso(14, 12) }, simdi)).toBe(true);
    expect(gecmisMi({ ...temel, tekrar: 'gunluk' }, simdi)).toBe(false);
  });

  it('konum yüzdesi pencereye sığar', () => {
    expect(gunBasi(an(14, 13))).toBe(an(14, 0));
    expect(yuzde(PENCERE, PENCERE, 7)).toBe(0);
    expect(yuzde(an(15, 12), PENCERE, 7)).toBeCloseTo(50);
    expect(yuzde(an(30, 0), PENCERE, 7)).toBe(100);
  });
});
