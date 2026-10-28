import { describe, expect, it } from 'vitest';
import { csvMetni } from './csv.ts';

describe('istasyon listesi CSV', () => {
  it('formül gibi başlayan metin \' ile başlar; sayı değişmez', () => {
    expect(csvMetni(['Ad', 'Saat'], [['=cmd|\' /C calc\'!A0', -1.5]]).slice(1).split('\r\n')[1]).toBe(`"'=cmd|' /C calc'!A0";"-1,5"`);
  });
});
