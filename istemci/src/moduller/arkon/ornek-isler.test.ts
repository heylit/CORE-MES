import { describe, expect, it } from 'vitest';
import { ORNEK_ISTASYON, ornekIslerAcik } from '../../../../arkon/web/src/data/ornek-isler.ts';

// Önizleme yalnız önizlenen paketi gösterir: örnek iş emirleri (FLN-120 vb.) tanıtım modunda bile eklenmez.
describe('operatör ekranının örnek iş emirleri', () => {
  it('yalnız tanıtım modunda, örnek istasyonda ve önizleme dışında açılır', () => {
    expect(ornekIslerAcik(true, ORNEK_ISTASYON, false)).toBe(true);
    expect(ornekIslerAcik(true, ORNEK_ISTASYON, true)).toBe(false);
    expect(ornekIslerAcik(false, ORNEK_ISTASYON, true)).toBe(false);
    expect(ornekIslerAcik(false, ORNEK_ISTASYON, false)).toBe(false);
    expect(ornekIslerAcik(true, 'AI1', false)).toBe(false);
  });
});
