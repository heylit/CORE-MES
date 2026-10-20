import { describe, expect, it } from 'vitest';
import { refakatKodu, refakatIsi } from '../../../../arkon/web/src/data/refakat-okut.ts';

// Kart #1062: refakat kartı (tek QR, UE:<emir id>) okutulunca emrin bu istasyondaki sıradaki bekleyen işi açılır, başlatılmaz.
// Sunucu bitmiş iş emrinin paketinde planı boş bırakır (data/tmi-plan.ts); planlanmamış iş beklemededir.
const pk = (isEmriId: number, emirId: number, opNo: number, machine: string, plan: { canli: boolean } | null = { canli: true }) =>
  ({ id: `tmi-ie-${isEmriId}`, no: `UE-${String(emirId).padStart(6, '0')}`, machine, status: 'published',
    tmi: { emirId, isEmriId, opNo, plan: plan === null ? null : { ...plan, sira: 1, eslesiyor: true } } });
const is = (p: ReturnType<typeof pk>, state = 'queued') => ({ no: p.no, state, pkg: p });

describe('refakat kartı kodu', () => {
  it('UE:<id> emir kimliği, UE-004512 emir numarasıdır; büyük-küçük harf ve boşluk önemsiz', () => {
    expect(refakatKodu('UE:4512')).toEqual({ emirId: 4512 });
    expect(refakatKodu(' ue: 17 ')).toEqual({ emirId: 17 });
    expect(refakatKodu('UE-004512')).toEqual({ emirNo: 'UE-004512' });
    expect(refakatKodu('ue-004512')).toEqual({ emirNo: 'UE-004512' });
  });
  it('başka kod refakat kartı değildir: eski eşleme (emir no, parça no) sürer', () => {
    for (const k of ['UE:', 'UE:12a', 'LOC:A-01', 'MLZ:5', 'FLN-120', '', 'UE:-3']) expect(refakatKodu(k), k).toBeNull();
  });
});

describe('refakat kartıyla iş açma', () => {
  const a10 = pk(1, 7, 10, 'TZG-04'), a20 = pk(2, 7, 20, 'TZG-04'), b30 = pk(3, 7, 30, 'FRZ-02'), baska = pk(4, 8, 10, 'TZG-04');

  it('emrin bu istasyondaki ilk bitmemiş işi açılır (sıra listesinde önde olan)', () => {
    const isler = [is(baska), is(a10, 'done'), is(a20)];
    expect(refakatIsi({ emirId: 7 }, isler, [a10, a20, b30, baska])).toEqual({ tur: 'ac', sira: 2 });
    expect(refakatIsi({ emirNo: 'UE-000007' }, isler, [a10, a20, b30, baska])).toEqual({ tur: 'ac', sira: 2 });
  });

  it('bu istasyonda işi yoksa ya da hepsi bittiyse emrin sıradaki adımının istasyonu söylenir', () => {
    expect(refakatIsi({ emirId: 7 }, [is(baska)], [a10, a20, b30, baska])).toEqual({ tur: 'baska-istasyon', istasyon: 'TZG-04' });
    expect(refakatIsi({ emirId: 7 }, [is(a10, 'done'), is(a20, 'done')], [a10, a20, b30, baska])).toEqual({ tur: 'baska-istasyon', istasyon: 'FRZ-02' });
  });

  it('bitmiş (planı boş) iş sıradaki adım sayılmaz, planlanmamış iş sayılır', () => {
    const bitti = pk(5, 9, 10, 'TZG-04', null), planlanmadi = pk(6, 9, 20, 'FRZ-02', { canli: false }), son = pk(7, 9, 30, 'TAS-01');
    expect(refakatIsi({ emirId: 9 }, [], [son, bitti, planlanmadi])).toEqual({ tur: 'baska-istasyon', istasyon: 'FRZ-02' });
  });

  it('emrin hiç işi ya da paketi yoksa emir bulunamadı', () => {
    expect(refakatIsi({ emirId: 99 }, [is(baska)], [a10, baska])).toEqual({ tur: 'yok' });
    expect(refakatIsi({ emirNo: 'UE-999999' }, [is(baska)], [a10, baska])).toEqual({ tur: 'yok' });
  });

  it('karar yalnız okur: girdiler değişmez', () => {
    const isler = [is(a10)], pkler = [a10, b30];
    const once = JSON.stringify([isler, pkler]);
    refakatIsi({ emirId: 7 }, isler, pkler);
    expect(JSON.stringify([isler, pkler])).toBe(once);
  });
});
