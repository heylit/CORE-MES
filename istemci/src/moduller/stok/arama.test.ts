import { describe, expect, it } from 'vitest';
import { sonuclar } from './Arama.tsx';

describe('arama sayfa kısayolları', () => {
  it('318 a: eski Raflar sayfası kısayolda yok; raflar Depo ve haritadan açılır', () => {
    const yollar = sonuclar(undefined, 'raf').map((s) => s.yol);
    expect(yollar).not.toContain('/stok/raflar');
    expect(yollar).toEqual(expect.arrayContaining(['/stok/depo', '/atolye']));
  });
});
