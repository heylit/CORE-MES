import { describe, expect, it } from 'vitest';
import { tamSayiGirdisi, tutarGirdisi } from './gorunum.ts';

describe('sayı girdisi (IDR-6)', () => {
  it('tutar binlik noktalı, virgüllü ya da noktalı kuruşla okunur', () => {
    expect(tutarGirdisi('1.250,50', 10)).toBe('1250.50');
    expect(tutarGirdisi('1250,5', 10)).toBe('1250.5');
    expect(tutarGirdisi('1250.50', 10)).toBe('1250.50');
    expect(tutarGirdisi('30.000', 12)).toBe('30000');
    expect(tutarGirdisi('1.234.567,89', 10)).toBe('1234567.89');
    expect(tutarGirdisi(' 980 ', 10)).toBe('980');
  });

  it('okunamayan tutar null', () => {
    for (const v of ['', '-5', '1,234', '1.25.0', '12.50,5', '1250,', 'abc', '1.2345', '12345678901']) expect(tutarGirdisi(v, 10)).toBeNull();
  });

  it('km binlik noktalı ya da düz okunur; ondalık ve eksi okunmaz', () => {
    expect(tamSayiGirdisi('20.000', 7)).toBe(20_000);
    expect(tamSayiGirdisi('1.234.567', 7)).toBe(1_234_567);
    expect(tamSayiGirdisi('89150', 7)).toBe(89_150);
    for (const v of ['', '20,5', '20.5', '-1', '12345678', '1.00']) expect(tamSayiGirdisi(v, 7)).toBeNull();
  });
});
