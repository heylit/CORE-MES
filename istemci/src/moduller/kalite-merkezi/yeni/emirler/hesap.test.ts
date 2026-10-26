import { describe, expect, it } from 'vitest';
import type { KmVerisi } from '../veri.ts';
import { emirBaglari, izlenebilirlik, retSayisi } from './hesap.ts';

const veri = {
  lot: [{ _id: 'l1', no: 'LOT-1', emir: 'IE-1', tarih: '2026-01-02', karar: 'Ret' }, { _id: 'l2', no: 'LOT-2', emir: 'IE-2' }],
  insp: [{ _id: 'i1', no: 'MUA-1', emir: 'IE-1', tarih: '2026-01-03', sonuc: 'Kabul' }],
  ncr: [{ _id: 'n1', no: 'NCR-1', emir: 'IE-1', tarih: '2026-01-01', durum: 'Açık' }],
} as unknown as KmVerisi;

describe('iş emri bağları', () => {
  it('numaraya bağlı lot, muayene ve NCR kayıtlarını eskiden yeniye verir', () => {
    const b = emirBaglari(veri, 'IE-1');
    expect([b.lot.length, b.insp.length, b.ncr.length]).toEqual([1, 1, 1]);
    expect(retSayisi(b)).toBe(1);
    expect(izlenebilirlik(b).map((r) => r.kol)).toEqual(['ncr', 'lot', 'insp']);
  });

  it('numarasız emirde bağ aramaz', () => {
    const b = emirBaglari(veri, '');
    expect(b.lot.length + b.insp.length + b.ncr.length).toBe(0);
  });
});
