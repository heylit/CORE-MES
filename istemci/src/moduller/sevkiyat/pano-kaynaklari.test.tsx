import { describe, expect, it } from 'vitest';
import { sevkiyatKalemleri } from './pano-kaynaklari.tsx';

describe('sevkiyat pano kaynagi (kart 1585)', () => {
  it('gecikmis havuzun icindedir: bekleyen satiri kalani sayar', () => {
    const k = sevkiyatKalemleri({ bekleyen: 5, gecikmis: 2 });
    expect(k.map((x) => [x.aciliyet, x.baslik])).toEqual([['gecikmis', '2 sevkiyat işi gecikti'], ['bugun', '3 sevkiyat işi araca verilmedi']]);
    expect(sevkiyatKalemleri({ bekleyen: 0, gecikmis: 0 })).toEqual([]);
  });
});
