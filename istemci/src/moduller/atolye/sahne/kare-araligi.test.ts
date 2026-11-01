import { describe, expect, it } from 'vitest';
import { BOSTA_KARE_MS, DURGUN_KARE_MS, kareAraligi } from './kare-araligi.ts';
import type { KareDurumu } from './kare-araligi.ts';

const durgun: KareDurumu = { etkin: false, kirli: false, gecis: false, hareket: false, yanip: false, enAzKareMs: 0 };

describe('kare aralığı', () => {
  it('kullanıcı dokunurken tam hız; dokunmatikte cihazın alt sınırı', () => {
    expect(kareAraligi({ ...durgun, etkin: true })).toBe(0);
    expect(kareAraligi({ ...durgun, etkin: true, enAzKareMs: 30 })).toBe(30);
  });

  it('hiçbir şey kıpırdamıyorsa saniyede bir kare (eskiden saniyede 30)', () => {
    expect(kareAraligi(durgun)).toBe(DURGUN_KARE_MS);
  });

  it('veri ya da seçim değişince bir kez hemen çizilir', () => {
    expect(kareAraligi({ ...durgun, kirli: true })).toBe(0);
  });

  it('makine hareketi ve yanıp sönme bugünkü gibi saniyede 30 kare', () => {
    expect(kareAraligi({ ...durgun, hareket: true })).toBe(BOSTA_KARE_MS);
    expect(kareAraligi({ ...durgun, yanip: true })).toBe(BOSTA_KARE_MS);
    expect(kareAraligi({ ...durgun, yanip: true, enAzKareMs: 40 })).toBe(40);
  });

  it('kapı ve görüş geçişi akıcı', () => {
    expect(kareAraligi({ ...durgun, gecis: true })).toBe(BOSTA_KARE_MS);
  });
});
