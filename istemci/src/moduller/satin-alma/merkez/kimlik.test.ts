import { describe, expect, it } from 'vitest';
import type { PurchaseRequest } from './tipler.ts';
import { gelisGunu, kalemOzeti } from './kimlik.ts';

const kalem = (name: string, qty: number | null, unit = 'adet') => ({ id: name, name, spec: '', qty, unit });
const talep = (items: ReturnType<typeof kalem>[]) => ({ items } as unknown as PurchaseRequest);

describe('3442-3 talebin kimliği', () => {
  it('ilk iki kalem miktar ve birimiyle, kalanı sayıyla; miktarı olmayan kalemde sayı uydurulmaz', () => {
    expect(kalemOzeti(talep([kalem('ORN- mil', 400, 'kg')]))).toBe('ORN- mil (400 kg)');
    expect(kalemOzeti(talep([kalem('ORN- mil', 400, 'kg'), kalem('ORN- burç', 12.5), kalem('ORN- vida', 3)]))).toBe('ORN- mil (400 kg), ORN- burç (12,5 adet) +1 kalem');
    expect(kalemOzeti(talep([kalem('ORN- kart bekler', null)]))).toBe('ORN- kart bekler');
    expect(kalemOzeti(talep([kalem('ORN- a', 1), kalem('ORN- b', 2)]), 1)).toBe('ORN- a (1 adet) +1 kalem');
    expect(kalemOzeti(talep([]))).toBe('Kalem yok');
  });
  it('geliş günü açılış zamanından; zaman yoksa boş', () => {
    expect(gelisGunu({ createdAt: new Date(2026, 10, 12, 9, 30).getTime() })).toBe('2026-11-12');
    expect(gelisGunu({ createdAt: 0 })).toBe('');
  });
});
