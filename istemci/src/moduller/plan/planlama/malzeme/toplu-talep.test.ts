import { describe, expect, it } from 'vitest';
import type { PlanSatiri } from './kurallar.ts';
import { HAFTALIK_ESIGI, acikTalepler, aralikGunleri, grupAnahtari, gunlukTuketim, isoGun, sutunHucresi, sutunlar, teslimler } from './toplu-talep.ts';

// Veri uydurmadır. Taban 2026-11-23 (Pazartesi) 00:00 UTC; saatler tabandan.
const TABAN = Date.UTC(2026, 10, 23);
const G = 24;
const satir = (kod: string, gun: number, q: number, tur: PlanSatiri['tur'], j: string | null = 'E-1'): PlanSatiri => ({
  kod, j, q, tur, alimNo: null, ihtiyac: gun * G + 6, alim: gun * G, tedarikci: null, fiyat: null, tutar: null, gecikti: false,
});
const girdi = (satirlar: PlanSatiri[], ek: Partial<Parameters<typeof gunlukTuketim>[0]> = {}) => gunlukTuketim({
  satirlar, taban: TABAN, simdi: 0, bas: 0, bit: 4 * G, stok: () => 10, talep: () => 0, ...ek,
});

describe('gunlukTuketim', () => {
  it('işe bağlı satırı gününe toplar, eksik yeni alımdır, kalan stoktan düşer', () => {
    const t = girdi([satir('11', 0, 6, 'stok'), satir('11', 1, 4, 'stok'), satir('11', 1, 3, 'yeni'), satir('11', 2, 5, 'acik'), satir('11', 2, 1, 'acik', null)]);
    expect(t.gunler).toEqual([0, G, 2 * G, 3 * G, 4 * G]);
    const s = t.satirlar[0]!;
    expect(s.gunler.get(0)).toEqual({ tuketim: 6, eksik: 0, siparisten: 0, kalan: 4 });
    expect(s.gunler.get(G)).toEqual({ tuketim: 7, eksik: 3, siparisten: 0, kalan: 0 });
    // Açık siparişin stoğa giden kalanı (j yok) tüketim değildir.
    expect(s.gunler.get(2 * G)).toEqual({ tuketim: 5, eksik: 0, siparisten: 5, kalan: 0 });
    expect([s.toplam, s.eksik]).toEqual([18, 3]);
  });

  it('açık talebi en erken eksikten düşer, aralık dışındakinden de', () => {
    const l = [satir('11', 0, 2, 'yeni'), satir('11', 3, 5, 'yeni')];
    const t = girdi(l, { bas: 3 * G, bit: 4 * G, talep: () => 4 });
    const s = t.satirlar[0]!;
    expect(s.talepte).toBe(4);
    expect(s.gunler.get(3 * G)?.eksik).toBe(3);
    expect(s.gunler.has(0)).toBe(false);
  });

  it('geçmiş tarihli satır bugüne düşer; stok bilinmiyorsa kalan null', () => {
    const t = girdi([satir('11', -2, 4, 'yeni')], { simdi: G + 3, bas: G, stok: () => null });
    expect(t.satirlar[0]!.gunler.get(G)).toEqual({ tuketim: 4, eksik: 4, siparisten: 0, kalan: null });
  });

  it('eksiği olan malzeme önce gelir; aralıkta tüketimi olmayan satır yoktur', () => {
    const t = girdi([satir('12', 0, 1, 'stok'), satir('11', 0, 1, 'yeni'), satir('13', 9, 1, 'yeni')]);
    expect(t.satirlar.map((s) => s.kod)).toEqual(['11', '12']);
  });
});

describe('teslimler', () => {
  const s = girdi([satir('11', 0, 2.2, 'yeni', 'E-1'), satir('11', 1, 3, 'yeni', 'E-2'), satir('11', 3, 4, 'yeni', 'E-1'), satir('11', 2, 9, 'stok')],
    { bit: 40 * G }).satirlar[0]!;
  it('günlük: her eksik gün bir teslim, miktar yukarı yuvarlanır', () => {
    expect(teslimler(s, TABAN, 'gunluk', 3, 0)).toEqual([
      { gun: 0, miktar: 3, isler: ['E-1'] }, { gun: G, miktar: 3, isler: ['E-2'] }, { gun: 3 * G, miktar: 4, isler: ['E-1'] },
    ]);
  });
  it('haftalık, aylık ve tek: grubun ilk eksik günü, toplam miktar', () => {
    expect(teslimler(s, TABAN, 'haftalik', 3, 0)).toEqual([{ gun: 0, miktar: 10, isler: ['E-1', 'E-2'] }]);
    expect(teslimler(s, TABAN, 'aylik', 3, 0)).toEqual([{ gun: 0, miktar: 10, isler: ['E-1', 'E-2'] }]);
    expect(teslimler(s, TABAN, 'tek', 3, 0)).toHaveLength(1);
  });
  it('her N günde: aralığın başından N günlük dilimler', () => {
    expect(teslimler(s, TABAN, 'herN', 2, 0).map((t) => [t.gun / G, t.miktar])).toEqual([[0, 6], [3, 4]]);
    expect(grupAnahtari(TABAN, 'herN', 0, 0, 5 * G)).toBe(5);
  });
});

describe('yardımcılar', () => {
  it('aralık günleri ve ISO gün', () => {
    expect(aralikGunleri(TABAN, 0, 2 * G)).toHaveLength(3);
    expect(isoGun(TABAN, 2 * G)).toBe('2026-11-25');
  });
  it('uzun aralıkta sütunlar haftalık toplanır, kalan son günündür', () => {
    const gunler = aralikGunleri(TABAN, 0, HAFTALIK_ESIGI * G);
    const c = sutunlar(TABAN, gunler);
    expect(c[0]!.gunler).toHaveLength(7);
    const s = girdi([satir('11', 0, 2, 'yeni'), satir('11', 3, 1, 'stok')], { bit: HAFTALIK_ESIGI * G }).satirlar[0]!;
    expect(sutunHucresi(s, c[0]!)).toEqual({ tuketim: 3, eksik: 2, siparisten: 0, kalan: 9 });
    expect(sutunlar(TABAN, gunler.slice(0, 5))).toHaveLength(5);
  });
  it('açık talep yalnız malzeme satırında ve kartın biriminde toplanır', () => {
    const m = acikTalepler([
      { tur: 'malzeme', malzemeNo: 11, birim: 'kg', karsilayanlar: [{ tur: 'talep', miktar: '4', birim: 'kg' }, { tur: 'talep', miktar: '2', birim: 'adet' }, { tur: 'siparis', miktar: '9', birim: 'kg' }] },
      { tur: 'hizmet', malzemeNo: 12, birim: 'adet', karsilayanlar: [{ tur: 'talep', miktar: '1', birim: 'adet' }] },
    ]);
    expect([...m]).toEqual([['11', 4]]);
  });
});
