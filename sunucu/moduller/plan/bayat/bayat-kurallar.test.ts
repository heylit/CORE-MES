import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BAYAT_OLAY_EN_COK, bayatDuruslar, bayatOzeti, terminEtkiledigiEmirler, type BayatOlayi } from './kurallar.ts';

// 2319 (2311 S7): canlı plan bayat işaretinin kuralları. Veriler uydurmadır.
const olay = (neden: BayatOlayi['neden'], zaman: string): BayatOlayi => ({ neden, zaman, uretimEmriId: 1, emirNo: 'E-1', makineId: null, makineKod: null });
const SON = '2026-11-08T08:00:00.000Z';

describe('plan bayat kuralları', () => {
  test('BK-01: canlı plan yoksa bayat değildir; olay sayılmaz', () => {
    assert.deepEqual(bayatOzeti(null, [olay('emir-bitti', '2026-11-08T09:00:00Z')]), { bayat: false, sonCanliyaAlma: null, sayilar: { 'emir-bitti': 0, 'fason-donusu': 0, durus: 0, 'rota-degisti': 0, 'adim-bitti': 0, 'emir-iptal': 0, 'satin-alma-termini': 0 }, olaylar: [] });
  });

  test('BK-02: yalnız son canlıya almadan sonraki olaylar sayılır, yeniden eskiye', () => {
    const o = bayatOzeti(SON, [olay('emir-bitti', '2026-11-08T07:59:00Z'), olay('durus', '2026-11-08T09:00:00Z'), olay('fason-donusu', '2026-11-08T10:00:00Z')]);
    assert.equal(o.bayat, true);
    assert.deepEqual(o.sayilar, { 'emir-bitti': 0, 'fason-donusu': 1, durus: 1, 'rota-degisti': 0, 'adim-bitti': 0, 'emir-iptal': 0, 'satin-alma-termini': 0 });
    assert.deepEqual(o.olaylar.map((x) => x.neden), ['fason-donusu', 'durus']);
  });

  test('BK-03: liste en çok BAYAT_OLAY_EN_COK, sayı hepsini sayar', () => {
    const l = Array.from({ length: BAYAT_OLAY_EN_COK + 5 }, (_, i) => olay('emir-bitti', new Date(Date.parse(SON) + (i + 1) * 60_000).toISOString()));
    const o = bayatOzeti(SON, l);
    assert.equal(o.olaylar.length, BAYAT_OLAY_EN_COK);
    assert.equal(o.sayilar['emir-bitti'], BAYAT_OLAY_EN_COK + 5);
  });

  test('BK-04: duruş: arıza ya da bakım, son canlıya almadan sonra, canlıda işi olan makine', () => {
    const d = bayatDuruslar([
      { makineId: 1, durum: 'ariza', degisme: '2026-11-08T09:00:00Z' },
      { makineId: 2, durum: 'bakim', degisme: '2026-11-08T09:00:00Z' },
      { makineId: 3, durum: 'calisir', degisme: '2026-11-08T09:00:00Z' },
      { makineId: 4, durum: 'ariza', degisme: '2026-11-08T07:00:00Z' },
      { makineId: 5, durum: 'ariza', degisme: '2026-11-08T09:00:00Z' },
    ], SON, new Set([1, 2, 3, 4]));
    assert.deepEqual(d.map((x) => x.makineId), [1, 2]);
  });
});

describe('plan bayat: satın alma termini (3256-1)', () => {
  test('gelişi değişen malzemeyi canlıda bitmemiş adımında kullanan emir; bitmiş adımın malzemesi ve başka malzeme sayılmaz', () => {
    const ihtiyac = new Map<number, { malzemeNo: number; opNo: number }[] | null>([
      [1, [{ malzemeNo: 7, opNo: 10 }]], [2, [{ malzemeNo: 7, opNo: 20 }]], [3, [{ malzemeNo: 8, opNo: 10 }]], [4, null],
    ]);
    const adimlar = [{ uretimEmriId: 1, opNo: 10 }, { uretimEmriId: 2, opNo: 30 }, { uretimEmriId: 3, opNo: 10 }, { uretimEmriId: 4, opNo: 10 }];
    assert.deepEqual(terminEtkiledigiEmirler(adimlar, ihtiyac, [7]), [1]);
    assert.deepEqual(terminEtkiledigiEmirler(adimlar, ihtiyac, [7, 8]), [1, 3]);
    assert.deepEqual(terminEtkiledigiEmirler(adimlar, ihtiyac, [9]), []);
    assert.deepEqual(terminEtkiledigiEmirler([], ihtiyac, [7]), []);
  });
  test('özet satın alma olayını sayar', () => {
    const o = bayatOzeti('2026-11-08T08:00:00Z', [olay('satin-alma-termini', '2026-11-08T09:00:00Z')]);
    assert.equal(o.bayat, true);
    assert.equal(o.sayilar['satin-alma-termini'], 1);
  });
});
