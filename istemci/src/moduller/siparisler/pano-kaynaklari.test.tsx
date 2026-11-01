import { describe, expect, it } from 'vitest';
import { aylikOlcu, terminKalemleri } from './pano-kaynaklari.tsx';

const ozet = { acikTeklif: 0, yaklasanTermin: 3, gecikenSiparis: 1, aylik: [{ ay: '2026-09', sayi: 20 }, { ay: '2026-10', sayi: 18 }] };

describe('siparisler pano kaynaklari (kart 1585)', () => {
  it('geciken gecikmis, yaklasan bu hafta; sifirlar kalem vermez', () => {
    expect(terminKalemleri(ozet).map((k) => k.aciliyet)).toEqual(['gecikmis', 'hafta']);
    expect(terminKalemleri({ ...ozet, yaklasanTermin: 0, gecikenSiparis: 0 })).toEqual([]);
  });
  it('aylik siparis onceki ayla yonsuz kiyas', () => {
    expect(aylikOlcu(ozet)[0]).toMatchObject({ deger: 18, kiyas: { etiket: '09.26', deger: 20, iyiYon: null }, seri: [20, 18] });
    expect(aylikOlcu({ ...ozet, aylik: [] })).toEqual([]);
  });
});
