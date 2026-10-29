import { describe, expect, it } from 'vitest';
import { csvMetni } from './kurallar.ts';

describe('Arkon pano CSV', () => {
  it('formül gibi başlayan metin \' ile başlar; sayı ve düz sayı metni değişmez', () => {
    expect(csvMetni([['=1+1', '@a', -2.345, '-3', 'Tezgah']]).slice(1)).toBe("'=1+1;'@a;-2,35;-3;Tezgah");
  });
});
