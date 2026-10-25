import { describe, expect, it } from 'vitest';
import { olcekHesapla } from './olcek.ts';

// Eski useFit'in (baslat.ts) hesabı, menü payı 0 ile: aynı girdide aynı sonucu vermeli.
function eskiHesap(W: number, H: number, ov: number | null): { mobil: boolean; z: number } {
  const m = W < 900 || (W < 1200 && H > W * 1.05);
  if (m) return { mobil: true, z: 1 };
  let z = Math.min(W / 1600, H / 900);
  if (ov) z *= ov;
  return { mobil: false, z: Math.max(0.5, Math.min(2, z)) };
}

describe('olcekHesapla', () => {
  const durumlar: [number, number, number | null][] = [
    [1080, 720, null], [1600, 900, null], [1920, 1080, null], [3840, 2160, null], [899, 600, null], [1100, 1300, null],
    [1100, 1000, null], [1280, 400, null], [1080, 720, 1.2], [1080, 720, 0.4],
  ];
  it.each(durumlar)('%i x %i (çarpan %s) eskisiyle aynı', (W, H, ov) => {
    expect(olcekHesapla(W, H, ov)).toEqual(eskiHesap(W, H, ov));
  });
  it('dar ve dik ekranda ölçek 1', () => {
    expect(olcekHesapla(800, 600)).toEqual({ mobil: true, z: 1 });
    expect(olcekHesapla(1100, 1300)).toEqual({ mobil: true, z: 1 });
  });
  it('geçersiz çarpan yok sayılır', () => {
    expect(olcekHesapla(1600, 900, Number.NaN).z).toBe(1);
    expect(olcekHesapla(1600, 900, -2).z).toBe(1);
  });
});
