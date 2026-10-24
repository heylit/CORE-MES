import { describe, expect, it } from 'vitest';
import { aqlPlani, lotAnahtari, SIKI } from '../aql.ts';
import type { Lot } from '../tipler.ts';
import {
  lotEksikleri, lotKayitEngeli, lotRetNcrOnDegeri, lotSayaci, lotSikiligi, lotSuz, lotTopla, ocOzeti, planHucreleri, tedarikciBazinda,
} from './hesap.ts';

const temel = { no: 'LOT-1', N: 500, seviye: 'II', kr: '%100', mj: '1.0', mn: '2.5', parcaNo: 'P-1', tedarikci: 's1' };
const anahtar = lotAnahtari('P-1', 's1');
const gecmis = (kararlar: string[]): Lot[] => kararlar.map((karar, i) => ({ _id: `l${i}`, no: `LOT-0${i}`, tarih: `2026-01-0${i + 1}`, anahtar, karar }));

describe('lot planı ve kararı', () => {
  it('sınıf başına planı K0 tablolarından çıkarır', () => {
    const r = planHucreleri(500, 'II', temel, 'Normal');
    expect(r.map((x) => [x.c, x.p?.n, x.p?.ac, x.p?.re])).toEqual([['Kritik', 500, 0, 1], ['Majör', 50, 1, 2], ['Minör', 50, 3, 4]]);
  });

  it('sayılar girilmeden bekliyor, Ac içinde kabul, aşınca ret', () => {
    expect(lotTopla([], temel, null).karar).toBe('Bekliyor');
    expect(lotTopla([], { ...temel, bKr: 0, bMj: 1, bMn: 3 }, null)).toMatchObject({ karar: 'Kabul', siddet: 'Normal' });
    const ret = lotTopla([], { ...temel, bKr: 0, bMj: 2, bMn: 0 }, null);
    expect(ret.karar).toBe('Ret');
    expect(ret.plan?.['Majör']).toEqual({ kod: 'H', n: 50, ac: 1, re: 2, aql: '1.0' });
    expect(String(lotRetNcrOnDegeri(ret).tanim)).toContain('Majör: 2 bulundu (Ac 1)');
  });

  it('beş lotta iki ret sıkılaştırır, beş ret durdurur ve kaydı engeller', () => {
    expect(lotSikiligi(gecmis(['Kabul', 'Ret', 'Ret']), temel, null).st).toBe(SIKI);
    expect(lotTopla(gecmis(['Ret', 'Ret']), temel, null).siddet).toBe(SIKI);
    const dur = gecmis(['Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'Ret']);
    expect(lotKayitEngeli(dur, { ...temel, bKr: 0, bMj: 0, bMn: 0 }, null)).toContain('durduruldu');
    expect(lotSayaci(dur)).toEqual({ n: 1, kotu: true });
    expect(lotSayaci([])).toBeNull();
  });

  it('kayıtlı lotun sıkılığı kayıttan gelir', () => {
    const kayit = { _id: 'k', siddet: SIKI } as Lot;
    expect(lotSikiligi(gecmis(['Kabul']), temel, kayit).st).toBe(SIKI);
  });

  it('eksikler parti ve bulunan sayılarını ister', () => {
    expect(lotEksikleri({ N: 1 }).map((e) => e.adim)).toEqual([0, 2]);
    expect(lotEksikleri({ ...temel, bKr: 0, bMj: 0, bMn: 0 })).toEqual([]);
  });
});

describe('lot listesi ve OC', () => {
  it('yeniden başlatma kaydı listede ve tedarikçi grafiğinde yoktur', () => {
    const L = [...gecmis(['Kabul', 'Ret']), { _id: 'r', tip: 'reset', anahtar } as Lot];
    expect(lotSuz(L).map((l) => l._id)).toEqual(['l1', 'l0']);
    expect(tedarikciBazinda(L, [{ _id: 's1', ad: 'Tedarikçi A' }])).toEqual([{ ad: 'İç üretim', kabul: 1, ret: 1 }]);
  });

  it('OC özeti AQL kabul olasılığını ve sıralı oranları verir', () => {
    const p = aqlPlani(500, 'II', '1.0', 'Normal')!;
    const o = ocOzeti(p, '1.0', 500);
    expect(o.aqldeKabul).toBeGreaterThan(0.9);
    expect(o.p95).toBeLessThan(o.p10);
    expect(o.aoql).toBeGreaterThan(0);
  });
});
