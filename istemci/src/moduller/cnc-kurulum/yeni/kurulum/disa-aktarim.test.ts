import { afterEach, describe, expect, it, vi } from 'vitest';
import { state } from '../depo.ts';
import type { IsMalzemesi, Tezgah } from '../veri/tipler.ts';
import { csvMetni, kurulumKartiHtml, yazdir, type KurulumAktarimi } from './disa-aktarim.ts';

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

// Yazdırma alanı innerHTML ile kurulur (değerlendirme 2197 R08); elle yazılan alanlar etiket olarak ayrıştırılmamalı.
const X = '"\'></textarea></title><img src=x onerror=alert(1)><script>alert(2)</script>';
function enjeksiyon(kok: ParentNode): string[] {
  const bulgu: string[] = [];
  for (const el of kok.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT') bulgu.push('script');
    if (el.tagName === 'IMG' && el.getAttribute('src') === 'x') bulgu.push('img');
    for (const a of el.attributes) if (a.name.startsWith('on')) bulgu.push(`${el.tagName.toLowerCase()}[${a.name}]`);
  }
  return bulgu;
}

describe('kurulum kartı yazdırma (2201d)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.querySelectorAll('.tc-ck-yazdir').forEach((x) => { x.remove(); }); });

  it('kötü niyetli parça no, takım adı ve kalem adı metin olarak çizilir', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    state.meta = { part: X, prog: X, op: X, stock: X };
    const r: KurulumAktarimi = { m: {} as Tezgah, mat: {} as IsMalzemesi, gen: [[X, X, X]], tl: [['T01', X, X, X, '', '', '', '', '', '', X]], g: [X], c: [X] };
    yazdir(kurulumKartiHtml(r, X));
    const alan = document.querySelector('.tc-ck-yazdir');
    expect(alan).not.toBeNull();
    expect(enjeksiyon(alan!)).toEqual([]);
    expect(alan!.querySelector('.pm td:nth-child(2)')?.textContent).toBe(X);
    expect(alan!.querySelector('.pm td:nth-child(8)')?.textContent).toBe(X);
  });
});
