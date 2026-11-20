import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { esdegerStokPayi } from './esdeger-stok-kurallar.ts';
import { planIhtiyaclari, type IhtiyacGirdisi } from './plan-ihtiyaci-kurallar.ts';
import { mrpSatirlari, type MrpGirdisi } from './mrp-kurallar.ts';

// 3463-1b (Risk K1): eşdeğer kartların stoğu birlikte sayılır, çift sayılmaz. Veriler uydurmadır.
const A = 10;
const B = 11;
const C = 12;
const grup = new Map([[A, [A, B]], [B, [A, B]]]);
const T0 = Date.UTC(2026, 10, 2, 9);

describe('plan: eşdeğer kartların stoğu (3463-1b)', () => {
  test('her kart önce kendi stoğunu kullanır; artan eksiği olan üyeye geçer; pay toplamı sıfır', () => {
    const pay = esdegerStokPayi(new Map([[A, 8], [B, 8]]), new Map([[A, '10']]), grup);
    assert.deepEqual([pay.get(A), pay.get(B)], [-2, 2]);
    assert.deepEqual([...esdegerStokPayi(new Map([[A, 8]]), new Map([[A, '10'], [B, '3']]), grup)], [], 'eksik yoksa pay yok');
    assert.deepEqual([...esdegerStokPayi(new Map([[A, 8], [B, 8]]), new Map([[A, '10']]), new Map())], [], 'grup yoksa pay yok');
  });

  test('grupta olmayan kart grubun stoğunu almaz; ihtiyacı olmayan üyenin stoğu sayılır', () => {
    const pay = esdegerStokPayi(new Map([[A, 5], [C, 5]]), new Map([[B, '4']]), grup);
    assert.deepEqual([pay.get(A), pay.get(B), pay.get(C)], [4, -4, undefined]);
  });

  const plan: IhtiyacGirdisi = {
    emirler: [{ id: 1, no: 'E-1' }, { id: 2, no: 'E-2' }],
    ihtiyaclar: new Map([[1, [{ malzemeNo: A, opNo: 10, brut: '8' }]], [2, [{ malzemeNo: B, opNo: 10, brut: '8' }]]]),
    sarflar: [],
    baslangiclar: new Map([['1:10', T0], ['2:10', T0]]),
    kartlar: new Map([[A, { tur: 'hammadde' }], [B, { tur: 'hammadde' }]]),
    serbest: new Map([[A, '10']]),
    agaclar: new Map(),
  };

  test('K1: A stok 10, A ve B ihtiyacı 8+8 -> eksik 6 (B kartında); grupsuz hesapta 8', () => {
    assert.deepEqual(planIhtiyaclari({ ...plan, esdegerler: grup }).map((x) => [x.malzemeNo, x.miktar, x.stokBilinmiyor]), [[B, 6, false]]);
    assert.deepEqual(planIhtiyaclari(plan).map((x) => [x.malzemeNo, x.miktar, x.stokBilinmiyor]), [[B, 8, true]]);
  });

  test('K1 MRP: serbest sütunu kartın kendisi, net grubun stoğuyla', () => {
    const mrp: MrpGirdisi = {
      ...plan, emirler: plan.emirler.map((e) => ({ ...e, baslama: null })), kritik: new Map(), gelisler: new Map(), esdegerler: grup,
    };
    const l = mrpSatirlari(mrp);
    const s = (no: number) => l.find((x) => x.malzemeNo === no)!;
    assert.deepEqual([s(A).serbest, s(A).net, s(B).serbest, s(B).net], [10, 0, null, 6]);
    assert.equal(mrpSatirlari({ ...mrp, esdegerler: new Map() }).find((x) => x.malzemeNo === B)!.net, null, 'grupsuz: B stoğu bilinmez');
  });
});
