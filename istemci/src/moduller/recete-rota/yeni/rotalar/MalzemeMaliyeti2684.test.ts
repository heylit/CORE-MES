import { describe, expect, it } from 'vitest';
import { malzemeMaliyeti, type Adim, type Malzeme } from './kurallar.ts';

// 2684 (Maliyet K1): bulunamayan ya da döngüye giren kart toplamı bilinmez yapar; sıfır sayılmaz, atlanmaz. Veri uydurmadır.
const kart = (id: string, type: string) => ({ id, type }) as unknown as Malzeme;
const adim = (ins: { itemId: string; qty: number }[]) => ({ id: 'a', seq: 10, rejectPct: 0, ins: ins.map((x) => ({ ...x, scrap: 0 })) }) as unknown as Adim;
const birim = (id: string): number | null => ({ 2: 5, 3: 1 } as Record<string, number>)[id] ?? null;

describe('2684 malzeme maliyeti', () => {
  it('silinmiş giren kart null verir; kartlar tamken toplam gelir', () => {
    const kartlar = new Map([['1', kart('1', 'mamul')], ['2', kart('2', 'ham')], ['3', kart('3', 'ham')]]);
    const rota = (id: string) => (id === '1' ? [adim([{ itemId: '2', qty: 2 }, { itemId: '3', qty: 1 }])] : []);
    expect(malzemeMaliyeti('1', rota, (id) => kartlar.get(id), birim)).toBe(11);
    kartlar.delete('3');
    expect(malzemeMaliyeti('1', rota, (id) => kartlar.get(id), birim)).toBeNull();
  });

  it('kendisi bulunamayan kart ve kendine dönen rota null verir', () => {
    expect(malzemeMaliyeti('9', () => [], () => undefined, birim)).toBeNull();
    const kartlar = new Map([['1', kart('1', 'mamul')], ['4', kart('4', 'yari')]]);
    const rota = (id: string) => (id === '1' ? [adim([{ itemId: '4', qty: 1 }])] : id === '4' ? [adim([{ itemId: '1', qty: 1 }])] : []);
    expect(malzemeMaliyeti('1', rota, (id) => kartlar.get(id), birim)).toBeNull();
  });
});
