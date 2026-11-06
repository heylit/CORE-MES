import { describe, expect, it, vi } from 'vitest';
import { state } from '../depo.ts';
import type { IsMalzemesi, Tezgah } from '../veri/tipler.ts';
import { csvMetni, type KurulumAktarimi } from './disa-aktarim.ts';

vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));

// csvMetni tezgâh ve malzemeyi okumaz; satırlar elle verilir.
const aktarim = (tl: (string | number)[][]): KurulumAktarimi =>
  ({ m: {} as Tezgah, mat: {} as IsMalzemesi, gen: [], tl, g: ['@SUM(A1)'], c: [] });

describe('kurulum kartı CSV', () => {
  it('formülle başlayan elle yazılmış alanı kesme işaretiyle yazar', () => {
    state.meta = { part: '=1+1', prog: '+P1', op: 'Op1', stock: '' };
    const metin = csvMetni(aktarim([['T01', '=HYPERLINK("x")', '', '', '', '', '', '', '', '', '']]), '01.01.2026');
    expect(metin).toContain("Parça No;'=1+1;Program No;'+P1;Operatör;Op1");
    expect(metin).toContain(`T01;"'=HYPERLINK(""x"")"`);
    expect(metin).toContain("Ölçüm Aletleri;'@SUM(A1)");
  });

  it('düz sayı metnine ve sayıya dokunmaz', () => {
    state.meta = { part: 'P', prog: '', op: '', stock: '' };
    const metin = csvMetni(aktarim([['T01', 'Matkap', '', '', '-0,02', 3, '', '', '', '', '']]), '01.01.2026');
    expect(metin).toContain('T01;Matkap;;;-0,02;3;');
  });
});
