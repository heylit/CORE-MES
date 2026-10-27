import { describe, expect, it } from 'vitest';
import { etkinResimler, kmBagi, kmPlani, kmResimDurumu, kmSahibi } from './km-cizim.ts';

// Kalite Merkezi resmi ve balonları (789, 795 a); değerler uydurmadır.
const BALON = {
  id: 7, no: 3, nominal: 'Ø12', tolerans: null, alt: null, ust: null, alet: null, siklik: 'Her 10 parça', kritik: false, yontem: 'cmm' as const,
  olcuAletiGerekir: false, tur: null, sayfa: null, x: null, y: null, yaziKutusu: null, surum: 1,
};

describe('Kalite Merkezi çizimi', () => {
  it('plan maddesi balon numarasını ve Kalite Merkezi kimliğini taşır; sınırsız balon mastar olur', () => {
    expect(kmPlani({ balonlar: [BALON] })).toEqual([{ id: 3, x: 0, y: 0, nom: 'Ø12', min: 0, max: 0, gauge: true, crit: false, m: 'cmm', freq: 'Her 10 parça', kmBalon: 7 }]);
  });
  it('sıklığı olmayan balon ilk parçada ölçülür', () => {
    expect(kmPlani({ balonlar: [{ ...BALON, siklik: null }] })[0]?.freq).toBe('İlk parça');
  });
  it('bağ yalnız kimlik ve sürümle okunur; bozuk kayıt bağ sayılmaz', () => {
    expect(kmBagi({ kmResim: { id: 1, surum: 2 } })).toEqual({ id: 1, surum: 2 });
    expect(kmBagi({ kmResim: { id: '1', surum: 2 } })).toBeNull();
    expect(kmBagi({ kmResim: null })).toBeNull();
    expect(kmBagi({})).toBeNull();
  });
  it('resim durumu: aynı sürüm pakette, yeni sürüm değişti, başka resim yok', () => {
    const p = { kmResim: { id: 1, surum: 2 } };
    expect(kmResimDurumu(p, { id: 1, surum: 2 })).toBe('pakette');
    expect(kmResimDurumu(p, { id: 1, surum: 3 })).toBe('degisti');
    expect(kmResimDurumu(p, { id: 2, surum: 2 })).toBe('yok');
  });
  it('yalnız malzemesi olan paket Kalite Merkezi\'ne bağlıdır; kaldırılmış resim listelenmez', () => {
    expect(kmSahibi({ malzemeNo: 5 })).toBe(true);
    expect(kmSahibi({ malzemeNo: null })).toBe(false);
    expect(kmSahibi({})).toBe(false);
    const r = { id: 1, malzemeNo: 5, tur: 'resim' as const, merkezBelgeId: 2, ozet: 'a', ad: 'A', revizyon: null, surum: 1, eklendi: '2026-01-01T00:00:00Z', balonlar: [] };
    expect(etkinResimler([{ ...r, aktif: true }, { ...r, id: 2, aktif: false }]).map((x) => x.id)).toEqual([1]);
  });
});
