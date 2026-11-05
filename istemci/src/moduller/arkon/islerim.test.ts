import { describe, expect, it } from 'vitest';
import { isimDurumu, isimEtiketi, isimSuresi, isimYeri, type IslerimSatiri } from '../../../../arkon/web/src/data/islerim.ts';

// 2125-1 b: İşlerim şeridinin kartı nereye götürür. Kodlar uydurmadır.
const satir = (ek: Partial<IslerimSatiri> = {}): IslerimSatiri => ({
  emirId: 7, emirNo: 'UE-DENEME-7', isEmriId: 70, opNo: 20, istasyon: 'IST-A', istasyonAd: 'Deneme A', mc: 'MK-1', makineAd: 'Deneme makine', giris: '2026-01-01T08:00:00.000Z', ...ek,
});

describe('2125-1 b İşlerim', () => {
  const ortam = { istasyon: 'IST-A', ekrandaki: { emirId: 7, isEmriId: 70 }, gecilebilir: ['IST-A', 'IST-B'] };

  it('ekrandaki iş ekranda; aynı istasyonda başka iş burada', () => {
    expect(isimDurumu(satir(), ortam)).toBe('ekranda');
    expect(isimDurumu(satir({ isEmriId: 71, opNo: 30 }), ortam)).toBe('burada');
    expect(isimDurumu(satir({ emirId: 8 }), ortam)).toBe('burada');
    expect(isimDurumu(satir(), { ...ortam, ekrandaki: null })).toBe('burada');
  });

  it('başka istasyon cihazda seçilebiliyorsa baska, seçilemiyorsa kapali (reddedilen)', () => {
    expect(isimDurumu(satir({ istasyon: 'IST-B' }), ortam)).toBe('baska');
    expect(isimDurumu(satir({ istasyon: 'IST-C' }), ortam)).toBe('kapali');
  });

  it('başlık makinedir, makinesizde istasyon; etiket emir ve op', () => {
    expect(isimYeri(satir())).toEqual({ kod: 'MK-1', ad: 'Deneme makine' });
    expect(isimYeri(satir({ mc: null, makineAd: null }))).toEqual({ kod: 'IST-A', ad: 'Deneme A' });
    expect(isimEtiketi(satir())).toBe('UE-DENEME-7 · Op 20');
    expect(isimEtiketi(satir({ opNo: null }))).toBe('UE-DENEME-7');
  });

  it('süre işe girişten; eksi sapma sıfır, bilinmeyen giriş "—"', () => {
    const t0 = Date.parse('2026-01-01T08:00:00.000Z');
    expect(isimSuresi(t0, t0 + 30_000)).toBe("1 dk'dan az");
    expect(isimSuresi(t0, t0 + 12 * 60_000)).toBe('12 dk');
    expect(isimSuresi(t0, t0 + 135 * 60_000)).toBe('2 sa 15 dk');
    expect(isimSuresi(t0, t0 - 60_000)).toBe("1 dk'dan az");
    expect(isimSuresi(Number.NaN, t0)).toBe('—');
  });
});
