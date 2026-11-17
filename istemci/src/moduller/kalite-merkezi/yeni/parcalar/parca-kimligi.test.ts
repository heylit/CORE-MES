import { describe, expect, it } from 'vitest';
import { parcaKimligi } from './parca.ts';

describe('parça kartı kimliği', () => {
  it('saklanan kimlik harf katlamasından etkilenmez: var olan kart ve ekleri aynı kimlikle bulunur', () => {
    expect(parcaKimligi('orn-mil-01')).toBe('p-ORN-M_L-01');
    expect(parcaKimligi('ORN-MIL-01')).toBe('p-ORN-MIL-01');
    expect(parcaKimligi(' orn kapak ')).toBe('p-ORN_KAPAK');
  });
});
