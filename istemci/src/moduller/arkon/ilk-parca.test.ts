import { describe, expect, it } from 'vitest';
import { ILK_PARCA_BEKLIYOR_ILETISI, ILK_PARCA_KARAR_BEKLIYOR_ILETISI, KALITE_MERKEZI_KARARI_ILETISI, ilkParcaKarari, kaliteMerkeziKarariBekler, ilkParcaSayimReddi, kararBekleyenEki, kararBekleyenSayisi, yenidenIlkParcaAcik, yenidenIlkParcaTabani } from '../../../../arkon/web/src/data/ilk-parca.ts';

describe('ilk parça kapısı (129, 131 b)', () => {
  it('327 a, 521 1 a: ilk parça kararı beklenirken ilk parça dahil bütün sağlam karar bekler (sunucuyla aynı sayı); ret varsa sayı gösterilmez', () => {
    expect(kararBekleyenSayisi(true, 0, false)).toBe(0);
    expect(kararBekleyenSayisi(true, 4, false)).toBe(4);
    expect(kararBekleyenSayisi(true, 38, false)).toBe(38);
    expect(kararBekleyenSayisi(true, 4, true)).toBeNull();
    expect(kararBekleyenSayisi(false, 9, false)).toBe(0);
    expect(kararBekleyenEki({ kararBekleyen: 3 })).toBe(' · karar bekleyen 3');
    expect(kararBekleyenEki({ kararBekleyen: null })).toBe('');
  });

  it('521 1 a: karar Kalite Merkezi\'nde; ilk parça ölçüsü taşıyan numune onaylanınca kaliteci yönlendirilir, onaylı emirde ve ilk parçasız numunede yönlendirilmez', () => {
    expect(ILK_PARCA_KARAR_BEKLIYOR_ILETISI).toMatch(/Kalite Merkezi/);
    expect(KALITE_MERKEZI_KARARI_ILETISI).toMatch(/Kalite Merkezi/);
    expect(kaliteMerkeziKarariBekler({}, [1, 2], [2])).toBe(true);
    expect(kaliteMerkeziKarariBekler({ tmi: { ilkParca: { karar: 'ret', zaman: 'z' } } }, [2], [2])).toBe(true);
    expect(kaliteMerkeziKarariBekler({ tmi: { ilkParca: { karar: 'onay', zaman: 'z' } } }, [2], [2])).toBe(false);
    expect(kaliteMerkeziKarariBekler({}, [1, 3], [2])).toBe(false);
    expect(kaliteMerkeziKarariBekler(undefined, [1], [])).toBe(false);
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
