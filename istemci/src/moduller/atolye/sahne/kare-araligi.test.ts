import { describe, expect, it } from 'vitest';
import { BOSTA_KARE_MS, DURGUN_KARE_MS, YANIP_KARE_MS, hafifGerekir, kareAraligi, yanipDegeri } from './kare-araligi.ts';
import type { KareDurumu } from './kare-araligi.ts';

const durgun: KareDurumu = { etkin: false, kirli: false, gecis: false, hareket: false, yanip: false, hafif: false, enAzKareMs: 0 };

describe('kare aralığı', () => {
  it('kullanıcı dokunurken tam hız; dokunmatikte cihazın alt sınırı', () => {
    expect(kareAraligi({ ...durgun, etkin: true })).toBe(0);
    expect(kareAraligi({ ...durgun, etkin: true, enAzKareMs: 30 })).toBe(30);
  });

  it('hiçbir şey kıpırdamıyorsa saniyede bir kare (eskiden saniyede 30)', () => {
    expect(kareAraligi(durgun)).toBe(DURGUN_KARE_MS);
    expect(kareAraligi({ ...durgun, hafif: true })).toBe(DURGUN_KARE_MS);
  });

  it('veri ya da seçim değişince bir kez hemen çizilir', () => {
    expect(kareAraligi({ ...durgun, kirli: true })).toBe(0);
    expect(kareAraligi({ ...durgun, kirli: true, hafif: true })).toBe(0);
  });

  it('tam görünümde makine hareketi ve yanıp sönme bugünkü gibi saniyede 30 kare', () => {
    expect(kareAraligi({ ...durgun, hareket: true })).toBe(BOSTA_KARE_MS);
    expect(kareAraligi({ ...durgun, yanip: true })).toBe(BOSTA_KARE_MS);
    expect(kareAraligi({ ...durgun, yanip: true, enAzKareMs: 40 })).toBe(40);
  });

  it('hafif görünümde ortam hareketi kare istemez; yanıp sönme saniyede 4 kare', () => {
    expect(kareAraligi({ ...durgun, hafif: true, hareket: true })).toBe(DURGUN_KARE_MS);
    expect(kareAraligi({ ...durgun, hafif: true, yanip: true })).toBe(YANIP_KARE_MS);
  });

  it('kapı ve görüş geçişi hafif görünümde de akıcı', () => {
    expect(kareAraligi({ ...durgun, hafif: true, gecis: true })).toBe(BOSTA_KARE_MS);
  });
});

describe('andon yanıp sönmesi', () => {
  it('hafif görünümde yarım saniye açık, yarım saniye kapalı', () => {
    expect(yanipDegeri(0, true)).toBe(1);
    expect(yanipDegeri(499, true)).toBe(1);
    expect(yanipDegeri(500, true)).toBe(0);
    expect(yanipDegeri(1000, true)).toBe(1);
  });

  it('tam görünümde 0 ile 1 arasında yumuşak nabız', () => {
    for (const t of [0, 100, 267, 1234, 99999]) {
      const v = yanipDegeri(t, false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('hafif görünüm önerisi', () => {
  it('yalnız piksel oranı en alttayken ve kareler yavaşken', () => {
    expect(hafifGerekir(40, 0.75, 0.75)).toBe(true);
    expect(hafifGerekir(40, 1, 0.75)).toBe(false);
    expect(hafifGerekir(20, 0.75, 0.75)).toBe(false);
  });
});
