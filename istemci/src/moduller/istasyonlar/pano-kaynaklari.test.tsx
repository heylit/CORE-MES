import { describe, expect, it } from 'vitest';
import { duranKalemi, makineOlcusu } from './pano-kaynaklari.tsx';

describe('istasyonlar pano kaynaklari (kart 1585)', () => {
  it('ariza varsa gecikmis, yalniz bakim varsa bekliyor; duran yoksa kalem yok', () => {
    expect(duranKalemi({ toplam: 12, calisir: 9, ariza: 1, bakim: 1 }, '/x')[0]).toMatchObject({ baslik: '2 makine duruyor', aciliyet: 'gecikmis', yol: '/x' });
    expect(duranKalemi({ toplam: 12, calisir: 9, ariza: 0, bakim: 2 }, '/x')[0]?.aciliyet).toBe('bekliyor');
    expect(duranKalemi({ toplam: 12, calisir: 12, ariza: 0, bakim: 0 }, '/x')).toEqual([]);
  });
  it('calisan makine toplam makineye karsi', () => {
    expect(makineOlcusu({ toplam: 12, calisir: 9, ariza: 1, bakim: 1 })[0]).toMatchObject({ deger: 9, plan: 12 });
  });
});
