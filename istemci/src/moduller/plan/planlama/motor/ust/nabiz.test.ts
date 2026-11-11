import { describe, expect, it } from 'vitest';
import { NABIZ_GOSTERGELERI } from './nabiz.ts';

// 2999 a: nabızdaki gecikme ağırlıksız toplamdır; atölyedeki öncelik ağırlıklı gecikmeyle aynı adı taşımaz.
describe('plan nabzı göstergeleri', () => {
  it('gecikme göstergesinin adı "Toplam gecikme", ipucu ağırlıksız olduğunu söyler', () => {
    const g = NABIZ_GOSTERGELERI.find((x) => x.id === 'wT');
    expect(g?.ad).toBe('Toplam gecikme');
    expect(g?.ipucu).toMatch(/ağırlıklandırılmaz/);
    expect(NABIZ_GOSTERGELERI.some((x) => /ağırlıklı/i.test(x.ad))).toBe(false);
  });
});
