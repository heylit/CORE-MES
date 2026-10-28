import { describe, expect, it } from 'vitest';
import { olcumRaporu, type Balon } from './kurallar.ts';

describe('ölçüm raporu CSV', () => {
  it('formül gibi başlayan metin \' ile başlar; sayı ve sayı metni olduğu gibi kalır', () => {
    const bal = [{ id: 1, x: 0, y: 0, l: '=HYPERLINK("http://x")', nom: '10', tol: '+0.1/-0.05', min: -0.05, max: 10.1, tool: '@kumpas' }] as Balon[];
    const satir = olcumRaporu(bal, { 1: { v: '-0.02', ok: true, at: 0 } }, () => 'z').split('\r\n')[1];
    expect(satir).toBe(`"1";"'=HYPERLINK(""http://x"")";"10";"'+0.1/-0.05";"-0.05";"10.1";"'@kumpas";"Elle";"-0.02";"UYGUN";"z"`);
  });
});
