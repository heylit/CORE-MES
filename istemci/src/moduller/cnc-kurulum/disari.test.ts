import { describe, expect, it } from 'vitest';
import { state } from './yeni/depo.ts';
import { kutuphaneRaflari } from './disari.ts';

describe('CNC kütüphanesi dışarıya (3762)', () => {
  it('özel kalem kendi rafında görünür, kimlikte lv_ öneki düşer; açık CNC durumu değişmez', () => {
    const onceki = state.custom;
    const raflar = kutuphaneRaflari([{ id: 'lv_orn-ozel-1', name: 'ORN Özel tutucu', kind: 'holder', shelf: 'fix' }]);
    const fix = raflar.find((r) => r.anahtar === 'fix');
    expect(fix?.kalemler.some((k) => k.kimlik === 'orn-ozel-1' && k.ad === 'ORN Özel tutucu')).toBe(true);
    expect(state.custom).toBe(onceki);
    const kimlikler = raflar.flatMap((r) => r.kalemler.map((k) => k.kimlik));
    expect(new Set(kimlikler).size).toBe(kimlikler.length);
  });
});
