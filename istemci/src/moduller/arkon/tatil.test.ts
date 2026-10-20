import { describe, expect, it } from 'vitest';
import { gunAnahtari, kapaliGun, kapaliGunEtiketi, tatilleriOku } from '../../../../arkon/web/src/data/tatil.ts';

describe('TMI tatilleri Arkon vardiyasında', () => {
  const tatiller = tatilleriOku({ '2026-10-29': { type: 'tatil', name: 'Cumhuriyet Bayramı' }, '2026-11-02': { type: 'kapali', name: null } });
  it('günün yerel tarihine göre kapalı günü bulur; öteki günler açıktır', () => {
    expect(kapaliGun(tatiller, new Date(2026, 9, 29, 7, 30).getTime())?.type).toBe('tatil');
    expect(kapaliGun(tatiller, new Date(2026, 9, 28, 23, 59).getTime())).toBeNull();
    expect(gunAnahtari(new Date(2026, 0, 5, 0, 0).getTime())).toBe('2026-01-05');
  });
  it('etiket adı, yoksa türü söyler', () => {
    expect(kapaliGunEtiketi(tatiller['2026-10-29']!)).toBe('Cumhuriyet Bayramı');
    expect(kapaliGunEtiketi(tatiller['2026-11-02']!)).toBe('Kapalı gün');
  });
  it('bozuk ayar tatil sayılmaz', () => {
    expect(tatilleriOku(null)).toEqual({});
    expect(tatilleriOku([1])).toEqual({});
    expect(tatilleriOku({ 'x': { type: 'tatil' }, '2026-10-30': { type: 'baska' }, '2026-10-31': 'tatil' })).toEqual({});
  });
});
