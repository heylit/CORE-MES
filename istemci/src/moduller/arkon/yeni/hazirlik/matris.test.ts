import { describe, expect, it } from 'vitest';
import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { matrisSatirlari } from './matris.ts';
import type { Pkg } from './tipler.ts';

// 3606: Matris görünümünün saf hesabı. Emir, iş ve madde durumları uydurmadır (ORN-).
const P = (id: string, opNo: number, isEmriId: number, ek: Partial<Pkg> = {}): Pkg => ({
  id, no: 'ORN-UE-1', opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'A', op: `Op ${String(opNo)}`, machine: 'ORN-IST', target: 10, cycle: 1,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'published', version: 1, dirty: false,
  createdAt: 1, updatedAt: 1, by: 'ORN', tmi: { emirId: 7, isEmriId, opNo }, ...ek,
} as Pkg);
const hazirlik = (cnc: 'tamam' | 'eksik', makine: 'tamam' | 'eksik'): HazirlikCevabi => ({
  maddeler: [
    { madde: 'cnc', durum: cnc, muafTutulur: true, isEmriDuzeyi: false }, { madde: 'makine', durum: makine, muafTutulur: false, isEmriDuzeyi: false },
    { madde: 'cizim', durum: 'muaf', muafTutulur: true, isEmriDuzeyi: false },
  ],
  muafiyetler: [],
  isEmirleri: [
    { isEmriId: 1, opNo: 10, ad: 'Torna', bitti: false, maddeler: [] }, { isEmriId: 2, opNo: 20, ad: 'Freze', bitti: true, maddeler: [] },
    { isEmriId: 3, opNo: 30, ad: 'Taşlama', bitti: false, maddeler: [] },
  ],
} as HazirlikCevabi);

describe('3606 matris satırları', () => {
  it('paketli iş paketiyle, paketsiz açık iş emrin adımından gelir; biten adım yok', () => {
    const s = matrisSatirlari([P('a', 10, 1)], new Map([[7, hazirlik('tamam', 'eksik')]]));
    expect(s.map((x) => [x.ad, x.paket?.id ?? null])).toEqual([['Op 10', 'a'], ['Op 30 · Taşlama', null]]);
  });

  it('durum matrisle aynı hesap: durduran eksik durur, yalnız uyaran eksik uyarıyla başlar; muaf hâli korunur', () => {
    const [a] = matrisSatirlari([P('a', 10, 1)], new Map([[7, hazirlik('eksik', 'tamam')]]));
    expect(a!.durum).toBe('durur');
    const [b] = matrisSatirlari([P('a', 10, 1)], new Map([[7, hazirlik('tamam', 'eksik')]]));
    expect(b!.durum).toBe('uyari');
    expect(b!.hal.get('makine')).toBe('uyari');
    expect(b!.hal.get('cizim')).toBe('muaf');
    const [c] = matrisSatirlari([P('a', 10, 1)], new Map([[7, hazirlik('tamam', 'tamam')]]));
    expect(c!.durum).toBe('hazir');
  });

  it('hazırlık okunamadıysa paket satırı kalır, durum yok; paketsiz adım uydurulmaz', () => {
    const s = matrisSatirlari([P('a', 10, 1)], new Map());
    expect(s).toHaveLength(1);
    expect(s[0]!.durum).toBeNull();
    expect(s[0]!.hal.size).toBe(0);
  });

  it('hazırlık cevabında karşılığı olmayan paket kaybolmaz', () => {
    const s = matrisSatirlari([P('a', 10, 1), P('z', 99, 99)], new Map([[7, hazirlik('tamam', 'tamam')]]));
    expect(s.map((x) => x.paket?.id ?? null)).toEqual(['a', null, 'z']);
  });
});
