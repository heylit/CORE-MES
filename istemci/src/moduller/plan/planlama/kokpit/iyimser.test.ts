import { describe, expect, test } from 'vitest';
import { iyimserKatman, iyimserUygula, tumPlanDiziliyor } from './iyimser.ts';
import type { KokpitIsi, KokpitModeli } from './kurallar.ts';

const is = (id: string, m: string, S: number, C: number): KokpitIsi => ({ id, job: 'ORN-1', ad: id, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0 });
const model = { isler: { a: is('a', 'M1', 8, 10), b: is('b', 'M1', 10, 12) } } as unknown as KokpitModeli;

describe('iyimser yerleşim (3664)', () => {
  test('katman işin yerini, itilen işle birlikte, değiştirir; modeli bozmaz', () => {
    const k = iyimserKatman([{ isId: 'a', tezgah: 'M2', S: 20, C: 22 }, { isId: 'b', tezgah: 'M1', S: 22, C: 24 }]);
    const g = iyimserUygula(model, k);
    expect(g.isler['a']).toMatchObject({ m: 'M2', S: 20, C: 22 });
    expect(g.isler['b']).toMatchObject({ m: 'M1', S: 22, C: 24 });
    expect(model.isler['a']).toMatchObject({ m: 'M1', S: 8 });
  });
  test('katman yoksa ya da iş modelde yoksa model aynen döner', () => {
    expect(iyimserUygula(model, null)).toBe(model);
    expect(iyimserUygula(model, iyimserKatman([{ isId: 'yok', tezgah: 'M1', S: 1, C: 2 }]))).toBe(model);
    expect(iyimserKatman([])).toBeNull();
  });
  test("'*' bütün plan notunu açar", () => {
    expect(tumPlanDiziliyor(['*', '6'])).toBe(true);
    expect(tumPlanDiziliyor(['6'])).toBe(false);
  });
});
