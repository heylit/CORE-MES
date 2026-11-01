import { describe, expect, it } from 'vitest';
import { kalibrasyonKalemleri } from './pano-kaynaklari.tsx';

describe('kalibrasyon pano kaynagi (kart 1585)', () => {
  it('vadesi gecen gecikmis, yaklasan bu hafta; ikisi sifirsa kalem yok', () => {
    expect(kalibrasyonKalemleri({ vadesiGecen: 1, yaklasan: 2 }).map((k) => k.aciliyet)).toEqual(['gecikmis', 'hafta']);
    expect(kalibrasyonKalemleri({ vadesiGecen: 0, yaklasan: 0 })).toEqual([]);
  });
});
