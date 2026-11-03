import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ozellikleriTani } from './kurallar.ts';
import type { TanimaYuzu, Yuz, YuzKenari } from './kurallar.ts';

// Saf kural testleri (kart 2044): yüz grafı elle kurulur, veritabanı ve libcascade yok. Ölçüler mm.
const yuz = (y: Partial<Yuz> & Pick<Yuz, 'tur'>): Yuz => ({
  ters: false, alanMm2: 100, yaricapMm: null, ikinciYaricapMm: null, yariAciDerece: null, eksen: null, konum: null, ...y,
});
const duzlem = (normal: [number, number, number], konum: [number, number, number], alanMm2 = 100): TanimaYuzu =>
  ({ yuz: yuz({ tur: 'duzlem', eksen: normal, konum, alanMm2 }), yan: null, normal, u: [0, 10], v: [0, 10] });
const silindir = (r: number, v: [number, number], yan: 'ic' | 'dis', aci = 2 * Math.PI, eksen: [number, number, number] = [0, 0, 1]): TanimaYuzu =>
  ({ yuz: yuz({ tur: 'silindir', yaricapMm: r, eksen, konum: [0, 0, 0] }), yan, normal: null, u: [0, aci], v });
const koni = (r: number, yariAci: number, v: [number, number], yan: 'ic' | 'dis', z = 0): TanimaYuzu =>
  ({ yuz: yuz({ tur: 'koni', yaricapMm: r, yariAciDerece: yariAci, eksen: [0, 0, 1], konum: [0, 0, z] }), yan, normal: null, u: [0, 2 * Math.PI], v });
const k = (a: number, b: number, tur: YuzKenari['tur'], uzunlukMm = 10): YuzKenari => ({ a, b, tur, uzunlukMm });

describe('geometri: özellik tanıma kuralları (2044)', () => {
  test('GEO-OZ1 tam tur iç silindir ve içbükey dik düzlem: düz dipli kör delik, eksen girişten içeri', () => {
    const o = ozellikleriTani([silindir(3, [0, 10], 'ic'), duzlem([0, 0, 1], [0, 0, 0]), duzlem([0, 0, 1], [0, 0, 10])],
      [k(0, 1, 'icbukey'), k(0, 2, 'disbukey')]);
    assert.equal(o.length, 1);
    assert.deepEqual([o[0]!.tur, o[0]!.capMm, o[0]!.derinlikMm, o[0]!.gecis, o[0]!.dip, o[0]!.eksen, o[0]!.konum, o[0]!.yuzler],
      ['delik', 6, 10, false, 'duz', [0, 0, -1], [0, 0, 10], [1, 2]]);
  });

  test('GEO-OZ2 dip kenarı dışbükeyse dip yoktur: geçiş deliği (reddedilen: kör sayılmaz)', () => {
    const o = ozellikleriTani([silindir(3, [0, 10], 'ic'), duzlem([0, 0, -1], [0, 0, 0]), duzlem([0, 0, 1], [0, 0, 10])],
      [k(0, 1, 'disbukey'), k(0, 2, 'disbukey')]);
    assert.deepEqual([o[0]!.gecis, o[0]!.dip, o[0]!.derinlikMm], [true, null, 10]);
  });

  test('GEO-OZ3 yarım tur iç silindir delik değildir; teğet komşusu yoksa radyüs de değildir', () => {
    assert.deepEqual(ozellikleriTani([silindir(3, [0, 10], 'ic', Math.PI), duzlem([1, 0, 0], [0, 0, 0]), duzlem([0, 1, 0], [0, 0, 0])],
      [k(0, 1, 'icbukey'), k(0, 2, 'icbukey')]), []);
  });

  test('GEO-OZ4 iki komşusuna teğet çeyrek iç silindir: iç köşe radyüsü, boy eksen boyunca', () => {
    const o = ozellikleriTani([silindir(2, [0, 15], 'ic', Math.PI / 2), duzlem([1, 0, 0], [0, 0, 0]), duzlem([0, 1, 0], [0, 0, 0])],
      [k(0, 1, 'teget'), k(0, 2, 'teget')]);
    assert.deepEqual(o.map((x) => [x.tur, x.yaricapMm, x.ic, x.boyMm]), [['radyus', 2, true, 15]]);
  });

  test('GEO-OZ5 iki dik düzlemin arasındaki 45 derece dar düzlem pahtır; açıyı bölmeyen dar düzlem pah değildir', () => {
    const s = Math.SQRT1_2;
    const pah = ozellikleriTani([duzlem([s, s, 0], [0, 0, 0], 2 * 30), duzlem([1, 0, 0], [0, 0, 0], 500), duzlem([0, 1, 0], [0, 0, 0], 400)],
      [k(0, 1, 'disbukey', 30), k(0, 2, 'disbukey', 30), k(1, 2, 'disbukey', 5)]);
    assert.deepEqual(pah.map((x) => [x.tur, x.genislikMm, x.boyMm, x.aciDerece]), [['pah', 2, 30, 45]]);
    const egik = Math.sin(Math.PI / 6), dik = Math.cos(Math.PI / 6);
    assert.deepEqual(ozellikleriTani([duzlem([dik, egik, 0], [0, 0, 0], 60), duzlem([1, 0, 0], [0, 0, 0], 500), duzlem([-1, 0, 0], [0, 0, 0], 400)],
      [k(0, 1, 'disbukey', 30), k(0, 2, 'disbukey', 30)]), [], 'karşılıklı yüzler arasında açı bölünmez');
    assert.deepEqual(ozellikleriTani([duzlem([s, s, 0], [0, 0, 0], 60), duzlem([1, 0, 0], [0, 0, 0], 500), duzlem([0, 1, 0], [0, 0, 0], 400)],
      [k(0, 1, 'icbukey', 30), k(0, 2, 'disbukey', 30)]), [], 'içbükey kenarlı yüz pah değildir');
  });

  test('GEO-OZ6 mil ucunda aynı eksenli dış silindire dışbükey bağlı dış koni pahtır; silindirsiz koni pah değildir', () => {
    const pah = ozellikleriTani([koni(10, -45, [0, 1.5 * Math.SQRT2], 'dis'), silindir(10, [-20, 0], 'dis'), duzlem([0, 0, 1], [0, 0, 1.5])],
      [k(0, 1, 'disbukey'), k(0, 2, 'disbukey')]);
    assert.deepEqual(pah.map((x) => [x.tur, x.capMm, x.genislikMm, x.aciDerece]), [['pah', 20, 2.1213, 45]]);
    assert.deepEqual(ozellikleriTani([koni(10, -45, [0, 2], 'dis'), duzlem([0, 0, 1], [0, 0, 1.4])], [k(0, 1, 'disbukey')]), []);
  });

  test('GEO-OZ7 kademeli ve havşalı geçiş deliği: küçük çap delik, büyük çap kademe, koni havşa; giriş geniş uçtan', () => {
    const o = ozellikleriTani(
      [silindir(3, [0, 10], 'ic'), silindir(5, [10, 14], 'ic'), koni(5, 45, [0, Math.SQRT2], 'ic', 14), duzlem([0, 0, 1], [0, 0, 10])],
      [k(0, 3, 'disbukey'), k(1, 3, 'icbukey'), k(1, 2, 'disbukey')],
    );
    const delik = o.find((x) => x.tur === 'delik');
    assert.ok(delik);
    assert.deepEqual([delik.capMm, delik.gecis, delik.eksen], [6, true, [0, 0, -1]]);
    assert.deepEqual(o.filter((x) => x.ust === 0).map((x) => [x.tur, x.capMm, x.derinlikMm]), [['kademe', 10, 4], ['havsa', 12, 1]]);
    assert.deepEqual(delik.konum, [0, 0, 15]);
  });

  test('GEO-OZ8 dış tam tur silindir (mil) delik sayılmaz', () => {
    assert.deepEqual(ozellikleriTani([silindir(10, [0, 50], 'dis')], []), []);
  });
  test('GEO-OZ9 eğik eksenli tam tur iç silindir de deliktir; eksen yönü korunur', () => {
    const e: [number, number, number] = [Math.SQRT1_2, Math.SQRT1_2, 0];
    const o = ozellikleriTani([silindir(4, [0, 12], 'ic', 2 * Math.PI, e)], []);
    assert.deepEqual(o.map((x) => [x.tur, x.capMm, x.derinlikMm, x.gecis]), [['delik', 8, 12, true]]);
    assert.deepEqual(o[0]!.eksen?.map((x) => Math.abs(x)), [0.70710678, 0.70710678, 0]);
  });
});
