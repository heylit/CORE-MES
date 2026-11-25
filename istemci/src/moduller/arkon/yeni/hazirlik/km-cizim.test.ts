import { describe, expect, it } from 'vitest';
import { etkinResimler, kmBagi, kmNumuneDurumu, kmNumuneKurallari, kmNumunePlani, kmPlani, kmResimDurumu, kmSahibi, otomatikKmNumunesi, otomatikKmResmi } from './km-cizim.ts';

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

  // 3687: taslak, Kalite Merkezi'nin balonlu resmiyle kendiliğinden kurulur; yayındaki ya da bağı olan paket elle güncellenir.
  it('otomatik resim: taslakta ilk etkin, güncel, balonlu resim; öteki durumlarda yok', () => {
    const r = { id: 1, malzemeNo: 5, tur: 'resim' as const, merkezBelgeId: 2, ozet: 'a', ad: 'A', revizyon: null, aktif: true, surum: 1, eklendi: '2026-01-01T00:00:00Z', balonlar: [BALON] };
    const taslak = { malzemeNo: 5, status: 'draft' as const, plan: [] };
    expect(otomatikKmResmi(taslak, [{ ...r, id: 9, balonlar: [] }, { ...r, id: 8, aktif: false }, { ...r, id: 7, eski: true }, { ...r, id: 6, tur: 'model' }, r])?.id).toBe(1);
    expect(otomatikKmResmi(taslak, [{ ...r, balonlar: [] }])).toBeNull();
    expect(otomatikKmResmi({ ...taslak, status: 'published' as const }, [r])).toBeNull();
    expect(otomatikKmResmi({ ...taslak, kmResim: { id: 1, surum: 1 } }, [r])).toBeNull();
    expect(otomatikKmResmi({ ...taslak, plan: [{ id: 1 }] }, [r])).toBeNull();
    expect(otomatikKmResmi({ malzemeNo: null, status: 'draft' as const }, [r])).toBeNull();
  });

  // 3689: numune planının sahibi Kalite Merkezi; paket `samp`'ına çevrilir, sürüm pakette tutulur.
  const PLAN = { opNo: 20, surum: 3, kurallar: [
    { kimlik: 'a', ne: 'ilk' as const, kim: ['kalite' as const], balonlar: 'hepsi' as const, kapi: true },
    { kimlik: 'b', ne: 'her' as const, n: 25, kim: ['operator' as const, 'kalite' as const], balonlar: 'kritik' as const },
    { kimlik: 'c', ne: 'vardiya' as const, kim: ['operator' as const], balonlar: [3, 5] },
  ] };
  it('Kalite Merkezi kuralı paket numune kuralına çevrilir', () => {
    expect(kmNumuneKurallari(PLAN)).toEqual([
      { id: 'a', when: 'first', who: ['q'], items: 'all', gate: true },
      { id: 'b', when: 'every', n: 25, who: ['op', 'q'], items: 'crit' },
      { id: 'c', when: 'shift', who: ['op'], items: [3, 5] },
    ]);
  });
  it('plan paketin operasyon numarasıyla bulunur; sürüm farkı "değişti" der', () => {
    const p = { malzemeNo: 5, tmi: { opNo: 20 }, kmNumune: { surum: 3 } };
    expect(kmNumunePlani(p, [PLAN, { ...PLAN, opNo: 30 }])?.opNo).toBe(20);
    expect(kmNumunePlani({ malzemeNo: 5, tmi: { opNo: 99 } }, [PLAN])).toBeNull();
    expect(kmNumuneDurumu(p, PLAN)).toBe('pakette');
    expect(kmNumuneDurumu(p, { ...PLAN, surum: 4 })).toBe('degisti');
    expect(kmNumuneDurumu({ malzemeNo: 5 }, PLAN)).toBe('bagsiz');
    expect(kmNumuneDurumu(p, null)).toBe('yok');
  });
  it('otomatik numune planı: yalnız taslakta, bağsız ve kuralsız pakette, kuralı olan planla', () => {
    const t = { malzemeNo: 5, status: 'draft' as const, tmi: { opNo: 20 }, samp: [] };
    expect(otomatikKmNumunesi(t, [PLAN])?.surum).toBe(3);
    expect(otomatikKmNumunesi({ ...t, status: 'published' as const }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi({ ...t, kmNumune: { surum: 1 } }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi({ ...t, samp: [{ id: 'x', when: 'first', who: ['q'], items: 'all' }] as unknown as never[] }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi({ ...t, malzemeNo: null }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi(t, [{ ...PLAN, kurallar: [] }])).toBeNull();
  });
});
