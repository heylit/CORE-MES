import { describe, expect, it } from 'vitest';
import { sonuclar } from './Arama.tsx';

describe('arama sayfa kısayolları', () => {
  it('318 a: eski Raflar sayfası kısayolda yok; raflar Depo ve haritadan açılır', () => {
    const yollar = sonuclar(undefined, 'raf').map((s) => s.yol);
    expect(yollar).not.toContain('/stok/raflar');
    expect(yollar).toEqual(expect.arrayContaining(['/stok/depo', '/atolye']));
  });

  it('GH 45: Türkçe harf büyük-küçük ve şapkasız yazımda aynı sayfayı bulur; geçmeyen sözcük sayfa bulmaz', () => {
    const yollar = (q: string) => sonuclar(undefined, q).map((s) => s.yol);
    for (const q of ['çıkış', 'ÇIKIŞ', 'cikis']) expect(yollar(q)).toContain('/stok/sepet');
    for (const q of ['İŞ KUTUSU', 'IS KUTUSU', 'iş kutusu']) expect(yollar(q)).toContain('/stok');
    expect(yollar('karanlık')).toEqual([]);
  });
});
