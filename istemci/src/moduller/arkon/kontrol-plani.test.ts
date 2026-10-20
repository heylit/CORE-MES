import { describe, expect, it } from 'vitest';
import { elleNumuneOlculeri, herNParcaYap, olculeriSil, type NumuneKurali } from '../../../../arkon/web/src/data/kontrol-plani.ts';

describe('Arkon kontrol planı', () => {
  const plan = [{ id: 'a' }, { id: 'b', crit: true }, { id: 'c' }];
  const kurallar: NumuneKurali[] = [
    { id: 'r1', when: 'first', items: 'all' },
    { id: 'r2', when: 'every', n: 10, who: ['q'], items: ['a', 'b'] },
    { id: 'r3', when: 'every', n: 50, who: ['op'], items: ['c'] },
  ];

  it('silinen ölçü plandan ve numune kurallarından düşer; listesi boşalan kural da silinir', () => {
    const s = olculeriSil(plan, kurallar, ['a', 'c']);
    expect(s.plan.map((b) => b.id)).toEqual(['b']);
    expect(s.samp).toEqual([
      { id: 'r1', when: 'first', items: 'all' },
      { id: 'r2', when: 'every', n: 10, who: ['q'], items: ['b'] },
    ]);
  });

  it('her N parça: ölçü öteki sayı kuralından çıkar, aynı sıklıktaki kalite kuralına eklenir ya da yeni kural açılır', () => {
    const ayniya = herNParcaYap(kurallar, 'c', 10, () => 'yeni');
    expect(ayniya.map((r) => [r.id, r.items])).toEqual([['r1', 'all'], ['r2', ['a', 'b', 'c']]]);

    const yeni = herNParcaYap(kurallar, 'a', 25, () => 'yeni');
    expect(yeni).toEqual([
      { id: 'r1', when: 'first', items: 'all' },
      { id: 'r2', when: 'every', n: 10, who: ['q'], items: ['b'] },
      { id: 'r3', when: 'every', n: 50, who: ['op'], items: ['c'] },
      { id: 'yeni', when: 'every', n: 25, who: ['q'], items: ['a'] },
    ]);
    expect(herNParcaYap([], 'a', 0, () => 'k')[0]?.n).toBe(1);
  });

  it('operatörün istediği numune bütün ölçüleri kritikler önde gönderir', () => {
    expect(elleNumuneOlculeri(plan).map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });
});
