import { describe, expect, it } from 'vitest';
import { EN_COK_YAKINLIK, cubukAraligi, genislik, gunCizgileri, konum, olcekKur } from './olcek.ts';

describe('olcek', () => {
  it('saat ekranda yakınlıkla çarpılır; pencere dışı kenara kırpılır', () => {
    const o = olcekKur(0, 48, 10);
    expect(genislik(o)).toBe(480);
    expect(konum(o, 12)).toBe(120);
    expect(konum(o, -5)).toBe(0);
    expect(konum(o, 100)).toBe(480);
  });

  it('yakınlık sınırlanır; ters pencere bir günlük olur', () => {
    expect(olcekKur(0, 10, 1000).yakinlik).toBe(EN_COK_YAKINLIK);
    expect(olcekKur(30, 10)).toMatchObject({ bas: 30, bit: 54 });
  });

  it('pencereyle kesişmeyen çubuk null; kesişen kırpılır', () => {
    const o = olcekKur(24, 48, 10);
    expect(cubukAraligi(o, 0, 10)).toBeNull();
    expect(cubukAraligi(o, 50, 60)).toBeNull();
    expect(cubukAraligi(o, 20, 30)).toEqual({ x: 0, en: 60 });
  });

  it('gün çizgileri pencere içindeki gün başlarıdır', () => {
    expect(gunCizgileri(olcekKur(10, 60))).toEqual([24, 48]);
  });
});
