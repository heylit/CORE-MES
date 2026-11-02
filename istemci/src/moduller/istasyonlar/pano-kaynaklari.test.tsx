import { describe, expect, it } from 'vitest';
import type { MakineDurumlariCevabi, MakinelerCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { duranKalemi, makineKutulari, makineOlcusu } from './pano-kaynaklari.tsx';

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

describe('makine durumu grafigi (kart 1773)', () => {
  it('pasif makine dusmez; durumu yazilmamis makine durum yok olur; once ariza ve bakim', () => {
    const makineler = [
      { id: 1, kod: 'T-02', ad: 'Torna', aktif: true }, { id: 2, kod: 'T-01', ad: 'Torna', aktif: true },
      { id: 3, kod: 'F-01', ad: 'Freze', aktif: true }, { id: 4, kod: 'X-01', ad: 'Eski', aktif: false },
    ] as unknown as MakinelerCevabi['makineler'];
    const durumlar = [{ makineId: 1, durum: 'ariza', aciklama: 'Mil' }, { makineId: 2, durum: 'calisir', aciklama: null }] as unknown as MakineDurumlariCevabi['durumlar'];
    expect(makineKutulari(makineler, durumlar).map((k) => [k.kod, k.ton, k.aciklama])).toEqual([['T-02', 'ariza', 'Mil'], ['F-01', 'bilinmiyor', null], ['T-01', 'calisiyor', null]]);
  });
});
