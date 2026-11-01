import { describe, expect, it } from 'vitest';
import { onayKalemi } from './pano-kaynaklari.tsx';

describe('malzemeler pano kaynagi (kart 1585)', () => {
  it('onay bekleyen bekliyor; sifir ve yetkisiz (null) kalem vermez', () => {
    expect(onayKalemi({ onayBekleyen: 2 })[0]).toMatchObject({ aciliyet: 'bekliyor', eylem: 'Onayla' });
    expect(onayKalemi({ onayBekleyen: 0 })).toEqual([]);
    expect(onayKalemi({ onayBekleyen: null })).toEqual([]);
  });
});
