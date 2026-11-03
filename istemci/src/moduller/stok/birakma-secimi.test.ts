import { describe, expect, it } from 'vitest';
import type { OkutCozCevabi, SepetSatiri } from '#paylasilan/sozlesme/stok.ts';
import { birakmaBasi, okutarakSec, okutulanSatirlar } from './birakma-secimi.ts';

// Okutarak bırakma (1919 a): sentetik kayıtlar.
const satir = (id: number, malzemeId: number, partiId: number | null, refakat: number | null = null): SepetSatiri => ({
  id, malzemeId, malzemeAd: `Deneme ${malzemeId}`, malzemeKod: `HM-${malzemeId}`, kaynakKonumId: 5, kaynakKonumKod: 'KABUL', partiId, partiEtiketi: partiId ? `LT-${partiId}` : null,
  miktar: '1', mevcut: '1', eklenme: '2026-11-03T08:00:00+03:00', refakat: refakat ? { id: refakat, etiket: `UE-000001-P${refakat}` } : null,
});
const SEPET = [satir(1, 10, 7), satir(2, 10, 8), satir(3, 20, null), satir(4, 30, 9, 4)];
const mlz = (id: number, parti: number | null, refakat?: number) =>
  ({ tur: 'malzeme', malzeme: { id, kod: null, ad: null, birim: null }, parti: parti ? { id: parti, etiket: `LT-${parti}` } : null, yerler: [], baskaSepetler: [],
    ...(refakat ? { refakat: { id: refakat } } : {}) }) as unknown as OkutCozCevabi;

describe('okutarak birakma secimi', () => {
  it('lot o lotu, malzeme o malzemenin satirlarini, refakat karti kartin satirini secer; baska kod secmez', () => {
    expect(okutulanSatirlar(SEPET, mlz(10, 8))).toEqual([2]);
    expect(okutulanSatirlar(SEPET, mlz(10, null))).toEqual([1, 2]);
    expect(okutulanSatirlar(SEPET, mlz(30, 9, 4))).toEqual([4]);
    expect(okutulanSatirlar(SEPET, mlz(99, null))).toEqual([]);
    expect(okutulanSatirlar(SEPET, { tur: 'eski-kart', kod: 'UE:1', uretimEmriId: 1 })).toEqual([]);
  });
  it('ilk okutma hepsi secili durumu birakir, sonrakiler ekler; eslesmeyen okutma secimi bozmaz', () => {
    let d = birakmaBasi(SEPET);
    expect([...d.secili]).toEqual([1, 2, 3, 4]);
    d = okutarakSec(d, []);
    expect(d.okutuldu).toBe(false);
    d = okutarakSec(d, [2]);
    expect([...d.secili]).toEqual([2]);
    d = okutarakSec(d, [4]);
    expect([...d.secili]).toEqual([2, 4]);
  });
});
