import { describe, expect, it } from 'vitest';
import { seriler } from '../spc.ts';
import type { OlcumSerisi } from '../tipler.ts';
import { dagilim, spcSayaci } from './hesap.ts';

describe('ölçüm analizi yardımcıları', () => {
  it('dağılım kutuları bütün ölçümleri sayar ve tolerans dışını işaretler', () => {
    const k = dagilim({ noktalar: [9.8, 10, 10, 10.1, 10.3].map((v) => ({ v })), lo: 9.9, hi: 10.2 });
    expect(k.reduce((a, b) => a + b.adet, 0)).toBe(5);
    expect(k[0]?.disarida).toBe(true);
    expect(k[k.length - 1]?.disarida).toBe(true);
    expect(dagilim({ noktalar: [], lo: 0, hi: 1 })).toEqual([]);
  });

  it('sayaç on ve üzeri ölçümlü yeteneksiz serileri sayar; yoksa boş', () => {
    const spc = (degerler: number[]): OlcumSerisi => ({ _id: 's', parcaNo: 'P-1', ad: 'Çap', nominal: 10, alt: 0.01, ust: 0.01, degerler });
    expect(spcSayaci(seriler({ insp: [], spc: [spc([10, 10.02, 9.98, 10.03, 9.97, 10.01, 9.99, 10.02, 9.98, 10])] }))).toEqual({ n: 1, kotu: true });
    expect(spcSayaci(seriler({ insp: [], spc: [spc([10, 10.001])] }))).toBeNull();
  });
});
