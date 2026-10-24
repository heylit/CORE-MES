import { describe, expect, it } from 'vitest';
import { gorselMi, olcu } from './gorseller.ts';

describe('gorseller', () => {
  it('uzun kenar sınıra iner, oran korunur; küçük resim büyütülmez', () => {
    expect(olcu(3200, 1600, 1600)).toEqual({ en: 1600, boy: 800 });
    expect(olcu(1000, 4000, 1600)).toEqual({ en: 400, boy: 1600 });
    expect(olcu(800, 600, 1600)).toEqual({ en: 800, boy: 600 });
    expect(olcu(0, 0, 1600)).toEqual({ en: 1, boy: 1 });
  });

  it('yalnız resim türü kabul edilir', () => {
    expect(gorselMi({ type: 'image/png' })).toBe(true);
    expect(gorselMi({ type: 'application/pdf' })).toBe(false);
  });
});
