import { describe, expect, it } from 'vitest';
import { CAP_DEF, capDefOf } from './sinirlar.ts';

describe('capDefOf', () => {
  it('tezgâh kimliğinin katalog değerini verir', () => {
    expect(capDefOf({ id: 'f5a' })).toBe(CAP_DEF['f5a']);
    expect(capDefOf({ id: 'ulathe' })).toBe(CAP_DEF['ulathe']);
  });

  it('kopya tezgâh aslının değerini alır', () => {
    expect(capDefOf({ id: 'f5a_2' })).toBe(CAP_DEF['f5a']);
    expect(capDefOf({ id: 'tcy_12' })).toBe(CAP_DEF['tcy']);
  });

  it('katalogda olmayan tezgâh boş değer alır; yalnız sondaki _sayı soneki atılır', () => {
    expect(capDefOf({ id: 'yok' })).toEqual({});
    expect(capDefOf({ id: 'f5a_x' })).toEqual({});
    expect(capDefOf({ id: 'f5a_2_3' })).toEqual({});
  });
});
