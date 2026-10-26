import { describe, expect, it } from 'vitest';
import { ILK_PARCA_BEKLIYOR_ILETISI, ILK_PARCA_KARAR_BEKLIYOR_ILETISI, KALITE_MERKEZI_KARARI_ILETISI, KALITE_MERKEZI_RETTI_ILETISI, ilkParcaKarari, kaliteMerkeziNumuneYamasi, kaliteMerkeziKarariBekler, ilkParcaSayimReddi, kararBekleyenEki, kararBekleyenSayisi, yenidenIlkParcaAcik, yenidenIlkParcaTabani } from '../../../../arkon/web/src/data/ilk-parca.ts';

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

  it('557, 521 1 a: Kalite Merkezi kararı kalitede bekleyen ilk parça numunesini terminalde kapatır; ret, daha yeni karar yoksa uyarıdır (559 2)', () => {
    const zaman = '2026-10-25T10:00:00Z';
    const once = Date.parse(zaman) - 60e3;
    const paket = (karar: string) => ({ tmi: { ilkParca: { karar, zaman } } });
    const bekleyen = { pendingReq: 'r1', pendingItems: [1, 2], pendingAt: once };
    expect(kaliteMerkeziNumuneYamasi(bekleyen, paket('onay'), [1, 2])).toEqual({ pendingReq: null, pendingItems: null });
    expect(kaliteMerkeziNumuneYamasi(bekleyen, paket('ret'), [1, 2])).toEqual({
      pendingReq: null, pendingItems: null, lastDecision: { status: 'rejected', bad: 'İlk parça', note: KALITE_MERKEZI_RETTI_ILETISI, at: Date.parse(zaman), km: true },
    });
    expect(kaliteMerkeziNumuneYamasi({ ...bekleyen, lastDecision: { at: Date.parse(zaman) + 1 } }, paket('ret'), [1, 2])).toEqual({ pendingReq: null, pendingItems: null });
  });

  it('557: karardan sonra gönderilen, ilk parça dışı ölçü taşıyan ya da kararsız emrin numunesi açık kalır', () => {
    const zaman = '2026-10-25T10:00:00Z';
    const onay = { tmi: { ilkParca: { karar: 'onay', zaman } } };
    const bekleyen = { pendingReq: 'r1', pendingItems: [1], pendingAt: Date.parse(zaman) - 60e3 };
    expect(kaliteMerkeziNumuneYamasi({ ...bekleyen, pendingAt: Date.parse(zaman) + 60e3 }, onay, [1])).toBeNull();
    expect(kaliteMerkeziNumuneYamasi({ ...bekleyen, pendingItems: [1, 3] }, onay, [1])).toBeNull();
    expect(kaliteMerkeziNumuneYamasi({ ...bekleyen, pendingItems: [] }, onay, [1])).toBeNull();
    expect(kaliteMerkeziNumuneYamasi({ ...bekleyen, pendingAt: null }, onay, [1])).toBeNull();
    expect(kaliteMerkeziNumuneYamasi({ ...bekleyen, pendingReq: null }, onay, [1])).toBeNull();
    for (const p of [{}, { tmi: {} }, { tmi: { ilkParca: { karar: 'onay', zaman: 'gecersiz' } } }, null, undefined]) expect(kaliteMerkeziNumuneYamasi(bekleyen, p, [1])).toBeNull();
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
