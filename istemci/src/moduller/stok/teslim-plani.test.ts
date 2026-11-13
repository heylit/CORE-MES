import { describe, expect, it } from 'vitest';
import { adim, binde, bindenMetin, miktarAyarla, okutulanSatir, oneriPlani, planaEkle, planToplami, type TeslimLotu } from './teslim-plani.ts';

const lot = (id: number, miktar: string, onerilen: string | null, partiId: number | null = id, konumId = id): TeslimLotu =>
  ({ bakiyeId: id, konumId, konumKod: `ORN-A0${String(id)}`, partiId, partiEtiketi: `ORN-L-000${String(id)}`, miktar, ilkGiris: '2026-10-01T10:00:00Z', sonKullanma: null, onerilen });

describe('teslim plani', () => {
  const lotlar = [lot(1, '4', '4'), lot(2, '8', '2'), lot(3, '10', null)];
  it('oneriyle dolu acilir: yalniz onerilen lotlar, onerilen miktarla, onaysiz', () => {
    expect(oneriPlani(lotlar)).toEqual([{ bakiyeId: 1, miktar: 4000, onay: null }, { bakiyeId: 2, miktar: 2000, onay: null }]);
    expect(bindenMetin(planToplami(oneriPlani(lotlar)))).toBe('6.000');
    expect(binde('2.5')).toBe(2500);
  });
  it('planda olmayan lot onaysiz satirlarin yerini sondan alir; onayli satira dokunmaz', () => {
    const plan = oneriPlani(lotlar);
    expect(planaEkle(plan, lotlar[2]!, 6000, 'okut')).toEqual([{ bakiyeId: 3, miktar: 6000, onay: 'okut' }]);
    const biriOnayli = plan.map((s) => (s.bakiyeId === 1 ? { ...s, onay: 'okut' as const } : s));
    expect(planaEkle(biriOnayli, lotlar[2]!, 6000, 'el')).toEqual([{ bakiyeId: 1, miktar: 4000, onay: 'okut' }, { bakiyeId: 3, miktar: 2000, onay: 'el' }]);
  });
  it('istenen onaylilarla tamamsa lot eklenmez; yeten lot onaysiz satirin yerini butunuyle alir', () => {
    const tamam = oneriPlani(lotlar).map((s) => ({ ...s, onay: 'el' as const }));
    expect(planaEkle(tamam, lotlar[2]!, 6000, 'okut')).toBeNull();
    expect(planaEkle([{ bakiyeId: 1, miktar: 4000, onay: null }], lotlar[2]!, 9000, 'okut')).toEqual([{ bakiyeId: 3, miktar: 9000, onay: 'okut' }]);
  });
  it('miktar lotta olani asamaz, sifirda satir cikar; adim tam birime gider', () => {
    const plan = oneriPlani(lotlar);
    expect(miktarAyarla(plan, lotlar[0]!, 9000)[0]).toEqual({ bakiyeId: 1, miktar: 4000, onay: null });
    expect(miktarAyarla(plan, lotlar[0]!, 0).map((s) => s.bakiyeId)).toEqual([2]);
    expect([adim(2500, -1), adim(2500, 1), adim(3000, -1), adim(3000, 1)]).toEqual([2000, 3000, 2000, 4000]);
  });
  it('ayni lot iki konumdaysa okutma once onay bekleyen plan satirini karsilar', () => {
    const iki = [lot(1, '4', null, 7, 1), lot(2, '8', '2', 7, 2), lot(3, '10', null)];
    expect(okutulanSatir(iki, oneriPlani(iki), 7)?.bakiyeId).toBe(2);
    expect(okutulanSatir(iki, [], 7)?.bakiyeId).toBe(1);
    expect(okutulanSatir(iki, [], 99)).toBeNull();
  });
});
