import { describe, expect, it } from 'vitest';
import type { BakiyeSatiri, KodCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { adetMi, aktarimKodlari, eksikMiktar, miktarDegistir, okutmaUygula, okutulmayanlar, SAYIM_BASI, sayimGovdesi, type SayimDurumu } from './okutarak-sayim.ts';

// Okutarak sayım kuralları (1905): sentetik kayıtlar.
const bakiye = (malzemeId: number, partiId: number | null): BakiyeSatiri => ({
  id: malzemeId * 100 + (partiId ?? 0), malzemeId, malzemeAd: `Deneme ${malzemeId}`, konumId: 41, konumKod: 'A-01-1', partiId, partiEtiketi: partiId ? `LT-${partiId}` : null,
  miktar: '10.000', ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'serbest',
});
const konum = (id: number, kod: string, bakiyeler: BakiyeSatiri[]): KodCozCevabi => ({
  tur: 'konum', bakiyeler,
  konum: { id, kod, tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: bakiyeler.length, haritaGozId: null, haritaAlanId: null, surum: 1 },
});
const ozet = (id: number, birim: string | null) => ({ id, tur: 'hammadde' as const, kod: `HM-${id}`, ad: `Deneme ${id}`, onayDurumu: 'onayli', kullanilabilir: true, birim });
const lot = (malzemeId: number, partiId: number, birim: string | null = 'Adet'): KodCozCevabi => ({ tur: 'lot', parti: { id: partiId, lotNo: `LT-${partiId}`, etiket: `LT-${partiId}` }, ozet: ozet(malzemeId, birim), toplam: '0', bakiyeler: [] });
const malzeme = (id: number, birim: string | null = 'adet'): KodCozCevabi => ({ tur: 'malzeme', ozet: ozet(id, birim), toplam: '0', bakiyeler: [], kesit: null });
const uygula = (d: SayimDurumu, ...c: KodCozCevabi[]) => c.reduce((s, x) => okutmaUygula(s, 'KOD', x).durum, d);

describe('okutarak sayım', () => {
  it('göz okutulmadan gelen etiket eklenmez (reddedilen)', () => {
    const r = okutmaUygula(SAYIM_BASI, 'LOT:LT-7', lot(1, 7));
    expect(r.sonuc.ton).toBe('hata');
    expect(r.durum).toBe(SAYIM_BASI);
  });

  it('göz açılır, aynı lotun her okutması bir sayar; başka göz okutulunca açık göz değişir', () => {
    const d = uygula(SAYIM_BASI, konum(41, 'A-01-1', []), lot(1, 7), lot(1, 7), konum(42, 'A-01-2', []), lot(2, 8));
    expect(d.acik).toBe(42);
    expect(d.gozler.map((g) => [g.kod, g.satirlar.map((s) => [s.malzemeId, s.partiId, s.miktar])])).toEqual([
      ['A-01-1', [[1, 7, '2']]],
      ['A-01-2', [[2, 8, '1']]],
    ]);
  });

  it('daha önce sayılan göz yeniden okutulunca satırları korunur', () => {
    const d = uygula(SAYIM_BASI, konum(41, 'A-01-1', []), lot(1, 7), konum(42, 'A-01-2', []), konum(41, 'A-01-1', []), lot(1, 7));
    expect(d.gozler).toHaveLength(2);
    expect(d.gozler[0]!.satirlar[0]!.miktar).toBe('2');
  });

  it('adet dışı birimde okutma satırı açar, miktar elle yazılır', () => {
    const r = okutmaUygula(uygula(SAYIM_BASI, konum(41, 'A-01-1', [])), 'LOT:LT-9', lot(3, 9, 'kg'));
    expect(r.sonuc.ton).toBe('uyari');
    const s = r.durum.gozler[0]!.satirlar[0]!;
    expect([s.elle, s.miktar]).toEqual([true, '']);
    expect(okutmaUygula(r.durum, 'LOT:LT-9', lot(3, 9, 'kg')).durum.gozler[0]!.satirlar[0]!.miktar).toBe('');
    expect(eksikMiktar(r.durum.gozler[0]!)).toHaveLength(1);
    expect(eksikMiktar(miktarDegistir(r.durum, 41, 0, '12,5').gozler[0]!)).toHaveLength(0);
    expect([adetMi('ADET'), adetMi(' Ad '), adetMi(null), adetMi('m')]).toEqual([true, true, false, false]);
  });

  it('malzeme etiketi gözdeki tek partiye sayılır; birden çok partide lot istenir (reddedilen); partisiz gözde parti boş kalır', () => {
    const tek = okutmaUygula(uygula(SAYIM_BASI, konum(41, 'A-01-1', [bakiye(1, 7)])), 'MLZ:1', malzeme(1));
    expect(tek.durum.gozler[0]!.satirlar[0]!.partiId).toBe(7);
    const cok = uygula(SAYIM_BASI, konum(41, 'A-01-1', [bakiye(1, 7), bakiye(1, 8)]));
    const r = okutmaUygula(cok, 'MLZ:1', malzeme(1));
    expect(r.sonuc.ton).toBe('hata');
    expect(r.durum).toBe(cok);
    expect(okutmaUygula(uygula(SAYIM_BASI, konum(41, 'A-01-1', [])), 'MLZ:1', malzeme(1)).durum.gozler[0]!.satirlar[0]!.partiId).toBeNull();
  });

  it('raf etiketi gözün etiketini ister, durumu değiştirmez (reddedilen)', () => {
    const d = uygula(SAYIM_BASI, konum(41, 'A-01-1', []));
    const r = okutmaUygula(d, 'RAF:A12', { tur: 'bilinmiyor', kod: 'RAF:A12' });
    expect(r.sonuc).toMatchObject({ ton: 'uyari', baslik: 'Raf A12' });
    expect(r.durum).toBe(d);
  });

  it('tanınmayan kod durumu değiştirmez (reddedilen)', () => {
    const d = uygula(SAYIM_BASI, konum(41, 'A-01-1', []));
    const r = okutmaUygula(d, 'XYZ:1', { tur: 'bilinmiyor', kod: 'XYZ:1' });
    expect(r.sonuc.ton).toBe('hata');
    expect(r.durum).toBe(d);
  });

  it('gövde: okutulan satırlar ve sistemde olup okutulmayanlar 0; aynı malzeme ve parti tek satır', () => {
    const d = uygula(SAYIM_BASI, konum(41, 'A-01-1', [bakiye(1, 7), bakiye(2, 8), { ...bakiye(2, 8), id: 999, statuId: 3 }]), lot(1, 7), lot(1, 7));
    const g = d.gozler[0]!;
    expect(okutulmayanlar(g)).toEqual([{ malzemeId: 2, partiId: 8 }]);
    expect(sayimGovdesi(miktarDegistir(d, 41, 0, '3,5').gozler[0]!)).toEqual({
      konumId: 41,
      satirlar: [{ malzemeId: 1, partiId: 7, sayilanMiktar: '3.5' }, { malzemeId: 2, partiId: 8, sayilanMiktar: '0' }],
    });
  });

  it('hafıza aktarımı: her satır bir okutma, boş satır ve CR atılır', () => {
    expect(aktarimKodlari('LOC:A-01-1\r\nLOT:LT-7\r\n\r\n  LOT:LT-7 \rMLZ:1\n')).toEqual(['LOC:A-01-1', 'LOT:LT-7', 'LOT:LT-7', 'MLZ:1']);
  });
});
