import { describe, expect, it } from 'vitest';
import { csvMetni, ondalik } from './csv.ts';

describe('S4 b: CSV metni', () => {
  it('başlık ve satırlar noktalı virgülle, BOM ile; sayı ondalık virgülle, boş değer boş alan', () => {
    const m = csvMetni(['Kod', 'Hazırlık dk', 'Not'], [['OP1', ondalik('2.5000'), null], ['OP2', 10, 'a"b;c']]);
    expect(m.startsWith('﻿')).toBe(true);
    expect(m.slice(1).split('\r\n')).toEqual(['"Kod";"Hazırlık dk";"Not"', '"OP1";"2,5";""', '"OP2";"10";"a""b;c"']);
  });

  it('satırsız liste yalnız başlık satırıdır', () => {
    expect(csvMetni(['Kod'], []).slice(1)).toBe('"Kod"');
    expect(csvMetni(['Kod'], [['=1+1'], [-2]]).slice(1).split('\r\n').slice(1)).toEqual([`"'=1+1"`, '"-2"']);
  });
});
