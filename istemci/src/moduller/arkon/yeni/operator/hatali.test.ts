import { describe, expect, it } from 'vitest';
import { hataliNedenleri, hataliUstSiniri } from './kurallar.ts';

// Hatalı parça penceresinin süzgeci ve üst sınırı. Neden adları uydurmadır.
describe('hatalı parça nedenleri ve adet sınırı', () => {
  const nedenler = [{ code: 'H-01', l: 'Ölçü dışı' }, { code: 'FSN-HURDA', l: 'Firmada hurda', fason: true }];

  it('talaşlı işte fason nedenleri çıkmaz; öteki iş türünde kalır', () => {
    expect(hataliNedenleri(nedenler, { opType: 'cnc' }).map((r) => r.code)).toEqual(['H-01']);
    expect(hataliNedenleri(nedenler, { opType: 'kalite' }).map((r) => r.code)).toEqual(['H-01', 'FSN-HURDA']);
  });

  it('üst sınır hedeften sayılan ve ayrılan hatalı düşülerek bulunur; hatalı bilinmiyorsa sınır yok', () => {
    expect(hataliUstSiniri({ target: 30, good: 3 }, 2)).toBe(25);
    expect(hataliUstSiniri({ target: 30, good: 30 }, 0)).toBe(0);
    expect(hataliUstSiniri({ target: 30, good: 3 }, null)).toBeNull();
    expect(hataliUstSiniri({ target: 30, good: 3 }, undefined)).toBeNull();
  });
});
