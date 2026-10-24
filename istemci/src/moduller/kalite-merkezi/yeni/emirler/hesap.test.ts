import { describe, expect, it } from 'vitest';
import type { Emir } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';
import { emirBaglari, emirCsvAyristir, izlenebilirlik, retSayisi } from './hesap.ts';

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

describe('ERP CSV aktarımı', () => {
  const mevcut = [{ _id: 'e1', no: 'IE-9' }] as Emir[];

  it('başlığı tanır, tarihi ve türü çevirir, kayıtlı ve boş numarayı atlar', () => {
    const s = emirCsvAyristir('No;Parça no;Miktar;Termin;Tür\nIE-1;P-100;12;05.03.2026;Satınalma\nIE-9;P-1;1;;\n;P-2;1;;', mevcut);
    if ('hata' in s) throw new Error(s.hata);
    expect(s.atlanan).toBe(2);
    expect(s.kayitlar).toEqual([{ no: 'IE-1', tip: 'Satınalma siparişi', durum: 'Açık', parcaNo: 'P-100', parcaAdi: '', miktar: 12, termin: '2026-03-05' }]);
  });

  it('numara ya da parça sütunu yoksa hata verir', () => {
    expect(emirCsvAyristir('Açıklama;Miktar\nx;1', mevcut)).toEqual({ hata: 'Başlıkta en az "no" ve "parça no" sütunları olmalı.' });
    expect(emirCsvAyristir('No;Parça no', mevcut)).toEqual({ hata: 'Dosya boş.' });
  });
});
