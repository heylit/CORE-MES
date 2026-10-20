import { describe, expect, it } from 'vitest';
import { sayaclariOku } from './ikinci-menu-sayaclari.ts';

describe('sayaclariOku', () => {
  it('eksi olmayan tam sayı sayıdır; metin, eksi ve kesirli değer bilinmeyen sayılır', () => {
    expect(sayaclariOku({ a: 2, b: 0, c: null, d: '5', e: -1, f: 1.5, g: true }))
      .toEqual({ a: 2, b: 0, c: null, d: null, e: null, f: null, g: null });
  });

  it('nesne olmayan cevapta sayı yoktur', () => {
    expect(sayaclariOku({})).toEqual({});
    for (const ham of [null, undefined, 3, 'a', [1, 2]]) expect(sayaclariOku(ham)).toBeNull();
  });
});
