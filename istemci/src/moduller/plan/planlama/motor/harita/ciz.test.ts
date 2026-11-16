import { describe, expect, it } from 'vitest';
import { kirp, ortaKirp } from './ciz.ts';

// Tuvalin yazı ölçüsü yerine sabit genişlik: her harf 6 birim.
const g = { measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics };

describe('haritada uzun adın kırpılması', () => {
  it('sığan ad aynen kalır; sığmayan sondan kırpılır ve üç nokta alır, kutuyu aşmaz', () => {
    expect(kirp(g, 'ORN-CNC-T1', 60)).toBe('ORN-CNC-T1');
    const k = kirp(g, 'Ornek Fason Isil Islem', 60);
    expect(k).toBe('Ornek Fas…');
    expect(g.measureText(k).width).toBeLessThanOrEqual(60);
  });

  it('kırpılan yer boşluksa boşluk bırakılmaz; yer hiç yoksa yazı çizilmez', () => {
    expect(kirp(g, 'Ornek Operator Bir', 42)).toBe('Ornek…');
    expect(kirp(g, 'ORN', 0)).toBe('');
  });

  it('tezgâh adı ortadan kırpılır: son parça kalır, benzer kodlar ayırt edilir', () => {
    expect(ortaKirp(g, 'ORN-CNC-T1', 60)).toBe('ORN-CNC-T1');
    const t1 = ortaKirp(g, 'ORN-CNC-T1', 48), f1 = ortaKirp(g, 'ORN-CNC-F1', 48);
    expect(t1).toBe('ORN-…-T1');
    expect(f1).toBe('ORN-…-F1');
    expect(g.measureText(t1).width).toBeLessThanOrEqual(48);
    expect(ortaKirp(g, 'Ornek Operator Bir', 60)).toBe('Ornek…Bir');
    expect(ortaKirp(g, 'ORN-CNC-T1', 12)).toBe('T1');
    expect(ortaKirp(g, 'ORN', 0)).toBe('');
  });
});
