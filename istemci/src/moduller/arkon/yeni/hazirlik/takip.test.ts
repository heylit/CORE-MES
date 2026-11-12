import { describe, expect, it } from 'vitest';
import { paketleriGrupla } from '../../../../../../arkon/web/src/data/paket-grup.ts';
import { baslamaDurumu } from '../operator/HazirlikListesi.tsx';
import { calisiyorMu, geriCekilebilir, takipEmirleri, takipSuzgeciOku, topluGeriCekilebilir } from './kurallar.ts';
import type { Pkg, Result } from './tipler.ts';

// 3111: takip tablosunun saf hesapları. Emir, operasyon ve sayılar uydurmadır (ORN-).

const P = (id: string, opNo: number, isEmriId: number, status: Pkg['status'], ek: Partial<Pkg> = {}): Pkg => ({
  id, no: 'ORN-UE-1', opType: 'cnc', st: {}, partNo: 'ORN-P-1', part: 'ORN parça', rev: 'A', op: `Op ${String(opNo)}`, machine: 'ORN-IST',
  target: 10, cycle: 1, due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status, version: 1,
  dirty: false, createdAt: 1, updatedAt: 1, by: 'ORN', tmi: { emirId: 7, isEmriId, opNo }, ...ek,
} as Pkg);
const R = (id: string, state: Result['state']): Result => ({ id, no: 'ORN-UE-1', state, good: 3, scrap: 0, meas: {}, pins: [], at: 1 });
const ADIMLAR = { isEmirleri: [
  { isEmriId: 1, opNo: 10, ad: 'Torna', bitti: true }, { isEmriId: 2, opNo: 20, ad: 'Freze', bitti: false },
  { isEmriId: 3, opNo: 30, ad: 'Kalite', bitti: false }, { isEmriId: 4, opNo: 40, ad: 'Paketleme', bitti: false },
] };

describe('3111 takip tablosu', () => {
  const paketler = [P('a', 10, 1, 'published'), P('b', 20, 2, 'published'), P('c', 30, 3, 'draft')];
  const sonuclar = { a: R('a', 'done'), b: R('b', 'running') };
  const gruplar = paketleriGrupla(paketler, 'emir');

  it('payda emrin bütün adımlarıdır; paketi olmayan adım satırdır, biten sayılır', () => {
    const [e] = takipEmirleri(gruplar, sonuclar, new Map([[7, ADIMLAR]]), 'hepsi');
    expect(e!.dilimler).toEqual(['bitti', 'calisiyor', 'taslak', 'yok']);
    expect(e!.biten).toBe(1);
    expect(e!.satirlar.map((s) => [s.opNo, s.paket?.id ?? null])).toEqual([[10, 'a'], [20, 'b'], [30, 'c'], [40, null]]);
  });

  it('hazırlık okunmadıysa emir paketlerden kurulur', () => {
    const [e] = takipEmirleri(gruplar, sonuclar, new Map(), 'hepsi');
    expect(e!.dilimler).toEqual(['bitti', 'calisiyor', 'taslak']);
  });

  it('süzgeç: açık işler biteni gizler, paketsiz açık adım bağlam olarak kalır; yalnız paketsiz kalan emir listelenmez', () => {
    const [e] = takipEmirleri(gruplar, sonuclar, new Map([[7, ADIMLAR]]), 'acik');
    expect(e!.satirlar.map((s) => s.opNo)).toEqual([20, 30, 40]);
    expect(takipEmirleri(gruplar, sonuclar, new Map([[7, ADIMLAR]]), 'yayinda')).toEqual([]);
    expect(takipEmirleri(gruplar, sonuclar, new Map([[7, ADIMLAR]]), 'uretimde')[0]!.satirlar.map((s) => s.opNo)).toEqual([20]);
    expect(takipSuzgeciOku('bozuk')).toBe('acik');
  });

  it('geri çekme: taslak dışı her paket tek tek; toplu yalnız yayında ve başlamamış', () => {
    expect(geriCekilebilir({ status: 'draft' })).toBe(false);
    expect(geriCekilebilir({ status: 'review' })).toBe(true);
    expect(topluGeriCekilebilir({ status: 'published' }, null)).toBe(true);
    expect(topluGeriCekilebilir({ status: 'published' }, { state: 'queued' })).toBe(true);
    for (const s of ['setup', 'running', 'paused', 'stopped', 'done'] as const) expect(topluGeriCekilebilir({ status: 'published' }, { state: s })).toBe(false);
    expect(topluGeriCekilebilir({ status: 'review' }, null)).toBe(false);
    expect(calisiyorMu({ state: 'paused' })).toBe(true);
    expect(calisiyorMu({ state: 'done' })).toBe(false);
  });

  it('başlama durumu matrisle aynı: durduran eksik durur, yalnız uyaran eksik uyarıyla başlar', () => {
    expect(baslamaDurumu([{ hal: 'eksik', uyarir: false }, { hal: 'eksik', uyarir: true }])).toBe('durur');
    expect(baslamaDurumu([{ hal: 'eksik', uyarir: true }, { hal: 'tamam', uyarir: false }])).toBe('uyari');
    expect(baslamaDurumu([{ hal: 'muaf', uyarir: false }, { hal: 'gerekmez', uyarir: false }])).toBe('hazir');
  });
});
