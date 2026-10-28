import { describe, expect, it } from 'vitest';
import { toCSV } from './util.ts';

describe('Satın Alma Merkezi CSV', () => {
  it('formül gibi başlayan metin \' ile başlar; sayı ve düz sayı metni değişmez', () => {
    expect(toCSV([['=HYPERLINK("http://x")', '@a', -2, '-3', 'Vida']]).slice(1)).toBe(`"'=HYPERLINK(""http://x"")";'@a;-2;-3;Vida`);
  });
});
