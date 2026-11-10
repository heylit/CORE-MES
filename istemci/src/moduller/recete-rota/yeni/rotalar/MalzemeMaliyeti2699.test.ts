import { describe, expect, it } from 'vitest';
import { malzemeMaliyeti, malzemeMaliyetiSonucu, type Adim, type Malzeme } from './kurallar.ts';

// 2699: taslakta miktarı girilmemiş giren toplamı bilinmez yapar (sıfır sayılmaz); boş maliyetin nedeni yazılır. Veri uydurmadır.
const kart = (id: string, type: string) => ({ id, code: `K-${id}`, type }) as unknown as Malzeme;
const adim = (ins: { itemId: string; qty: number | null }[]) => ({ id: 'a', seq: 10, opNo: 10, rejectPct: 0, ins: ins.map((x) => ({ ...x, scrap: 0 })) }) as unknown as Adim;
const kartlar = new Map([['1', kart('1', 'mamul')], ['2', kart('2', 'ham')], ['3', kart('3', 'ham')]]);
const birim = (id: string): number | null => ({ 2: 5 } as Record<string, number>)[id] ?? null;
const hesapla = (ins: { itemId: string; qty: number | null }[]) => malzemeMaliyetiSonucu('1', (id) => (id === '1' ? [adim(ins)] : []), (id) => kartlar.get(id), birim);

describe('2699 malzeme maliyeti nedeni', () => {
  it('miktarı boş ya da sıfır giren null verir ve nedenini yazar', () => {
    expect(hesapla([{ itemId: '2', qty: 2 }])).toEqual({ deger: 10, neden: null });
    for (const qty of [null, 0]) expect(hesapla([{ itemId: '2', qty }])).toEqual({ deger: null, neden: 'K-1 OP 10: K-2 miktarı girilmemiş.' });
    expect(malzemeMaliyeti('1', (id) => (id === '1' ? [adim([{ itemId: '2', qty: null }])] : []), (id) => kartlar.get(id), birim)).toBeNull();
  });

  it('birim maliyeti olmayan, bulunamayan giren ve girensiz rota nedenini yazar', () => {
    expect(hesapla([{ itemId: '3', qty: 1 }]).neden).toBe('K-3 birim maliyeti girilmemiş.');
    expect(hesapla([{ itemId: '9', qty: 1 }]).neden).toBe('Giren kartı bulunamadı (#9).');
    expect(hesapla([]).neden).toBe('K-1 rotasında giren yok.');
  });
});
