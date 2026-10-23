import { describe, expect, it } from 'vitest';
import { AZAMI_KART_EMRI, istasyondakiKartlar, kartDoldu, kartEmirleri, refakatIsi, sayimKartAlani, sinirMetni } from '../../../../arkon/web/src/data/refakat-karti.ts';
import type { RefakatKarti } from '../../../../arkon/web/src/data/refakat-karti.ts';

// Kart #156 (Soru 134): Arkon'da okutma yok; iş, işin altındaki refakat kartından "Aç" ile ya da Malzeme Teslim'den kartla açılır.
const kart = (id: number, uretimEmriId: number, ek: Partial<RefakatKarti> = {}): RefakatKarti => ({
  id, uretimEmriId, etiket: `UE-${String(uretimEmriId).padStart(6, '0')}-P${id}`, lotNo: 'LT-1', malzemeKod: null, malzemeAd: null, birim: null, verilen: '10',
  istasyondaSatirVar: true, sayilan: null, sinir: null, ...ek,
});

describe('refakat kartı listesi', () => {
  it('işin altında yalnız emrin bu istasyonda satırı olan kartları durur; emirsiz işte liste boş', () => {
    const l = [kart(1, 7), kart(2, 7, { istasyondaSatirVar: false }), kart(3, 8), kart(4, 7, { lotNo: null })];
    expect(istasyondakiKartlar(l, 7).map((k) => k.id)).toEqual([1, 4]);
    expect(istasyondakiKartlar(l, null)).toEqual([]);
  });

  it('Soru 132: sınır yumuşaktır; sayılan ya da sınır bilinmiyorsa gösterilmez, dolunca doldu denir', () => {
    expect(sinirMetni({ sayilan: null, sinir: null })).toBeNull();
    expect(sinirMetni({ sayilan: 4, sinir: null })).toBeNull();
    expect(sinirMetni({ sayilan: 4, sinir: 10 })).toBe('4 / 10');
    expect([kartDoldu({ sayilan: 9, sinir: 10 }), kartDoldu({ sayilan: 10, sinir: 10 }), kartDoldu({ sayilan: 12, sinir: 10 }), kartDoldu({ sayilan: 3, sinir: null })]).toEqual([false, true, true, false]);
  });

  it('sayım satırı kartı taşır; kartsız işte alan yazılmaz', () => {
    expect(sayimKartAlani(37)).toEqual({ refakatPartisiId: 37 });
    for (const k of [null, undefined, 0, -1, 1.5, '37']) expect(sayimKartAlani(k), String(k)).toBeNull();
  });

  it('sorulacak emirler: bitmemiş işlerin emirleri, tekrarsız ve sıralı, en çok 50', () => {
    expect(kartEmirleri([{ state: 'queued', emirId: 9 }, { state: 'done', emirId: 3 }, { state: 'running', emirId: 9 }, { state: 'queued', emirId: null }, { state: 'paused', emirId: 4 }])).toEqual([4, 9]);
    expect(kartEmirleri(Array.from({ length: 60 }, (_, i) => ({ state: 'queued', emirId: i + 1 }))).length).toBe(AZAMI_KART_EMRI);
  });
});

// Kart #1062 kararı yeniden kullanılır: emrin bu istasyondaki sıradaki bitmemiş işi açılır, başlatılmaz.
// Sunucu bitmiş iş emrinin paketinde planı boş bırakır (data/tmi-plan.ts); planlanmamış iş beklemededir.
const pk = (isEmriId: number, emirId: number, opNo: number, machine: string, plan: { canli: boolean } | null = { canli: true }) =>
  ({ id: `tmi-ie-${isEmriId}`, no: `UE-${String(emirId).padStart(6, '0')}`, machine, status: 'published',
    tmi: { emirId, isEmriId, opNo, plan: plan === null ? null : { ...plan, sira: 1, eslesiyor: true } } });
const is = (p: { no: string }, state = 'queued') => ({ no: p.no, state, pkg: p });

describe('kartla iş açma', () => {
  const a10 = pk(1, 7, 10, 'TZG-04'), a20 = pk(2, 7, 20, 'TZG-04'), b30 = pk(3, 7, 30, 'FRZ-02'), baska = pk(4, 8, 10, 'TZG-04');

  it('emrin bu istasyondaki ilk bitmemiş işi açılır; rotasız emrin paketi de bulunur', () => {
    expect(refakatIsi(7, [is(baska), is(a10, 'done'), is(a20)], [a10, a20, b30, baska])).toEqual({ tur: 'ac', sira: 2 });
    const rotasiz = { id: 'tmi-ue-12', no: 'UE-000012', machine: 'TZG-04', tmi: null };
    expect(refakatIsi(12, [is(baska), is(rotasiz)], [baska, rotasiz])).toEqual({ tur: 'ac', sira: 1 });
  });

  it('bu istasyonda işi yoksa ya da hepsi bittiyse emrin sıradaki adımının istasyonu söylenir', () => {
    expect(refakatIsi(7, [is(baska)], [a10, a20, b30, baska])).toEqual({ tur: 'baska-istasyon', istasyon: 'TZG-04' });
    expect(refakatIsi(7, [is(a10, 'done'), is(a20, 'done')], [a10, a20, b30, baska])).toEqual({ tur: 'baska-istasyon', istasyon: 'FRZ-02' });
  });

  it('bitmiş (planı boş) iş sıradaki adım sayılmaz, planlanmamış iş sayılır', () => {
    const bitti = pk(5, 9, 10, 'TZG-04', null), planlanmadi = pk(6, 9, 20, 'FRZ-02', { canli: false }), son = pk(7, 9, 30, 'TAS-01');
    expect(refakatIsi(9, [], [son, bitti, planlanmadi])).toEqual({ tur: 'baska-istasyon', istasyon: 'FRZ-02' });
  });

  it('emrin hiç işi ya da paketi yoksa emir bulunamadı', () => {
    expect(refakatIsi(99, [is(baska)], [a10, baska])).toEqual({ tur: 'yok' });
  });

  it('karar yalnız okur: girdiler değişmez', () => {
    const isler = [is(a10)], pkler = [a10, b30];
    const once = JSON.stringify([isler, pkler]);
    refakatIsi(7, isler, pkler);
    expect(JSON.stringify([isler, pkler])).toBe(once);
  });
});
