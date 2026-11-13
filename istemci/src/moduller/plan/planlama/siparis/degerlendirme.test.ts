import { describe, expect, it } from 'vitest';
import { DEGERLENDIRME_BEKLEME_MS, degerlendirmeBeklemesi, degerlendirmeIste } from './degerlendirme.ts';

describe('sunucu değerlendirmesinin yoklaması', () => {
  it('ilk yoklamalar sık, sonrakiler üst sınırdadır', () => {
    expect([0, 1, 2, 9, 10, 40].map(degerlendirmeBeklemesi)).toEqual([100, 100, 200, 200, DEGERLENDIRME_BEKLEME_MS, DEGERLENDIRME_BEKLEME_MS]);
  });

  it('kısa iş üçüncü yoklamada biter; aradaki iki bekleme 100 ms sürer', async () => {
    const beklenen: number[] = [];
    let okuma = 0, an = 0;
    const cevap = { calismaSurumu: 1, sonuc: { tur: 'plan-uygula' } };
    const r = await degerlendirmeIste(1, { tur: 'plan-uygula', isler: ['*'] } as never, {
      post: () => Promise.resolve({ is: 'x' }) as never,
      get: () => Promise.resolve(++okuma < 3 ? { durum: 'suruyor' } : { durum: 'bitti', cevap }) as never,
      bekle: (ms) => { beklenen.push(ms); an += ms; return Promise.resolve(); },
      simdi: () => an,
    });
    expect(r).toBe(cevap);
    expect(beklenen).toEqual([100, 100]);
  });
});
