import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siparisLogoOzetleri } from './kurallar.ts';
import type { OzetIrsaliyeSatiri, OzetKalemi } from './kurallar.ts';

// 3384 a: siparişin Logo özeti saf kuralı. ORN- uydurma veri.
const kalem = (id: number, ref: string | null, ek: Partial<OzetKalemi> = {}): OzetKalemi => ({
  siparisNo: 'SP-2026-001', siparisTarihi: '2026-11-01', siparisSatiriId: id, kalemAdi: `ORN kalem ${id}`, miktar: '120.000', birim: 'kg', teslim: '0', logoSatirRef: ref, ...ek,
});
const irs = (ref: number, satirRef: string, miktar: string | null, ek: Partial<OzetIrsaliyeSatiri> = {}): OzetIrsaliyeSatiri => ({
  firma: 1, donem: 1, irsaliyeRef: ref, fisNo: `ORN-IRS-${ref}`, belgeNo: null, tarih: '2026-11-10', tur: 1, faturaNo: null,
  siparisNo: 'SP-2026-001', siparisSatirRef: satirRef, miktar, birim: 'KG', ...ek,
});
const PENCERE = '2026-08-18';
const ozet = (k: OzetKalemi[], i: OzetIrsaliyeSatiri[], f: Map<string, string[]> | null = null) => siparisLogoOzetleri(['SP-2026-001'], k, i, f, PENCERE)[0]!;

describe('3384 a: sipariş Logo özeti', () => {
  test('Logo net miktarı CORE teslimiyle karşılaştırılır; fark Logo eksi CORE; birim harf duyarsız; aynı ve bekliyor ayrılır', () => {
    const o = ozet(
      [kalem(1, '901', { teslim: '120' }), kalem(2, '902', { teslim: '80' }), kalem(3, '903'), kalem(4, '904', { teslim: '5' })],
      [irs(10, '901', '118'), irs(10, '902', '80.0000'), irs(11, '904', '5', { birim: 'adet' })],
    );
    assert.deepEqual(o.kalemler.map((k) => [k.durum, k.logoMiktari, k.fark]), [['fark', '118', '-2'], ['ayni', '80', null], ['bekliyor', '0', null], ['birim', '5', null]]);
    assert.equal(o.farkliKalem, 1, 'birim tutmayan fark sayılmaz');
    assert.equal(o.irsaliyeliKalem, 3);
    assert.deepEqual(o.irsaliyeler.map((x) => x.kayitNo), [10, 11], 'irsaliye bir kez');
    assert.equal(o.logoda, true);
  });

  test("CORE'da kabul yoksa CORE sıfırdır ve fark sayılır; alış iadesi Logo net miktarından düşer", () => {
    const o = ozet([kalem(1, '901'), kalem(2, '902', { teslim: '10' })], [irs(10, '901', '120'), irs(12, '902', '12'), irs(13, '902', '2', { tur: 6 })]);
    assert.deepEqual(o.kalemler.map((k) => [k.durum, k.logoMiktari, k.fark]), [['fark', '120', '120'], ['ayni', '10', null]]);
    assert.deepEqual(o.irsaliyeler.map((x) => x.iade), [false, false, true]);
  });

  test("pencereden eski siparişte irsaliyesi okunmamış kalem 'okunmadi' (sıfır uydurulmaz); penceredekinde Logo sıfırdır", () => {
    const eski = ozet([kalem(1, '901', { siparisTarihi: '2026-05-01', teslim: '120' })], []);
    assert.deepEqual(eski.kalemler.map((k) => [k.durum, k.logoMiktari]), [['okunmadi', null]]);
    assert.equal(eski.farkliKalem, 0);
    const yeni = ozet([kalem(1, '901', { teslim: '120' })], []);
    assert.deepEqual(yeni.kalemler.map((k) => [k.durum, k.logoMiktari, k.fark]), [['fark', '0', '-120']]);
  });

  test("Logo'ya gitmemiş kalem ve sipariş; başka siparişin ya da bağlanmamış Logo satırı karışmaz", () => {
    const o = ozet([kalem(1, null)], [irs(10, '901', '5'), irs(11, '777', '5', { siparisNo: 'SP-2026-002' })]);
    assert.equal(o.logoda, false);
    assert.deepEqual(o.kalemler.map((k) => k.durum), ['logo-bagi-yok']);
    assert.deepEqual(o.irsaliyeler, []);
  });

  test('fatura: okunmamış sipariş bilinmiyor (null); okunmuş ama faturasız boş liste; irsaliyenin faturası da girer', () => {
    assert.equal(ozet([kalem(1, '901')], [], null).faturalar, null);
    assert.equal(ozet([kalem(1, '901')], [], new Map()).faturalar, null);
    assert.deepEqual(ozet([kalem(1, '901')], [], new Map([['SP-2026-001', []]])).faturalar, []);
    assert.deepEqual(ozet([kalem(1, '901')], [irs(10, '901', '1', { faturaNo: 'ORN-F-2' })], new Map([['SP-2026-001', ['ORN-F-1', 'ORN-F-2']]])).faturalar, ['ORN-F-1', 'ORN-F-2']);
    assert.deepEqual(ozet([kalem(1, '901')], [irs(10, '901', '1', { faturaNo: 'ORN-F-3' })], null).faturalar, ['ORN-F-3']);
  });

  test('3472 b: iptal fatura ayrı listededir, faturalar\'a girmez; irsaliyenin taşıdığı iptal fatura numarası da girmez', () => {
    const iptal = new Map([['SP-2026-001', ['ORN-F-9']]]);
    const o = siparisLogoOzetleri(['SP-2026-001'], [kalem(1, '901')], [irs(10, '901', '1', { faturaNo: 'ORN-F-9' })], new Map([['SP-2026-001', []]]), PENCERE, iptal)[0]!;
    assert.deepEqual([o.faturalar, o.iptalFaturalar], [[], ['ORN-F-9']]);
    assert.deepEqual(ozet([kalem(1, '901')], [], null).iptalFaturalar, []);
  });

  test('okunamayan miktar karşılaştırılmaz', () => {
    const o = ozet([kalem(1, '901', { teslim: '1' })], [irs(10, '901', null)]);
    assert.deepEqual(o.kalemler.map((k) => k.durum), ['okunmadi']);
  });
});
