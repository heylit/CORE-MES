import { describe, expect, it } from 'vitest';
import { ILK_PARCA_BEKLIYOR_ILETISI, ilkParcaKarari, ilkParcaSayimReddi, kararBekleyenEki, kararBekleyenSayisi, yenidenIlkParcaAcik, yenidenIlkParcaTabani } from '../../../../arkon/web/src/data/ilk-parca.ts';

describe('ilk parça kapısı (129, 131 b)', () => {
  it('ilk parça kararı beklenirken ilk sağlamdan sonrası karar bekler; ret varsa sayı gösterilmez', () => {
    expect(kararBekleyenSayisi(true, 0, false)).toBe(0);
    expect(kararBekleyenSayisi(true, 4, false)).toBe(3);
    expect(kararBekleyenSayisi(true, 4, true)).toBeNull();
    expect(kararBekleyenSayisi(false, 9, false)).toBe(0);
    expect(kararBekleyenEki({ kararBekleyen: 3 })).toBe(' · karar bekleyen 3');
    expect(kararBekleyenEki({ kararBekleyen: null })).toBe('');
  });

  it('yeniden ilk parça kapısı açıkken yalnız ilk sağlam sayılır; düzeltme serbest; kapı kapalıyken sınır yok', () => {
    expect(ilkParcaSayimReddi(true, 0, 1)).toBeNull();
    expect(ilkParcaSayimReddi(true, 1, 1)).toBe(ILK_PARCA_BEKLIYOR_ILETISI);
    expect(ilkParcaSayimReddi(true, 0, 2)).toBe(ILK_PARCA_BEKLIYOR_ILETISI);
    expect(ilkParcaSayimReddi(true, 3, -1)).toBeNull();
    expect(ilkParcaSayimReddi(false, 10, 5)).toBeNull();
  });

  it('denetim #12: kapının kararı paketteki Kalite Merkezi kararıdır (sunucu yazar); Arkon numunesi karar değildir', () => {
    expect(ilkParcaKarari({ tmi: { ilkParca: { karar: 'onay', zaman: 'x' } } })).toBe('onay');
    expect(ilkParcaKarari({ tmi: { ilkParca: { karar: 'ret', zaman: 'x' } } })).toBe('ret');
    for (const p of [{ tmi: { ilkParca: { karar: 'baska' } } }, { tmi: {} }, { tmi: null }, {}, null, undefined]) expect(ilkParcaKarari(p)).toBeNull();
  });

  it('denetim #12: yeniden ilk parça kararın anından sonraki Kalite Merkezi onayıyla kapanır; Arkon numunesi, ret ve eski onay kapatmaz', () => {
    const fpRe = { on: true, at: Date.parse('2026-10-19T10:00:00Z') };
    const ilkParca = (karar: string, zaman: string) => ({ tmi: { ilkParca: { karar, zaman } } });
    expect(yenidenIlkParcaAcik({ fpRe })).toBe(true);
    expect(yenidenIlkParcaAcik({ fpRe, ...ilkParca('onay', '2026-10-19T09:00:00Z') })).toBe(true);
    expect(yenidenIlkParcaAcik({ fpRe, ...ilkParca('ret', '2026-10-19T11:00:00Z') })).toBe(true);
    expect(yenidenIlkParcaAcik({ fpRe, ...ilkParca('onay', '2026-10-19T11:00:00Z') })).toBe(false);
    expect(yenidenIlkParcaAcik({ fpRe: { on: true }, ...ilkParca('onay', '2026-10-19T11:00:00Z') })).toBe(true);
    expect(yenidenIlkParcaAcik({ fpRe: { on: false, at: 1 } })).toBe(false);
    expect(yenidenIlkParcaAcik(null)).toBe(false);
  });

  it('yeniden ilk parçanın tabanı sunucunun damgaladığı sayımdır; damgasız kararda sıfır', () => {
    expect(yenidenIlkParcaTabani({ fpRe: { on: true, cnt: 4 } })).toBe(4);
    expect(yenidenIlkParcaTabani({ fpRe: { on: true } })).toBe(0);
    expect(yenidenIlkParcaTabani(null)).toBe(0);
  });
});
