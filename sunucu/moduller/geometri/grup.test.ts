import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { desenBul, disAdayi, disTablosuOku, ozellikGruplari, YERLESIK_DIS_TABLOSU } from './kurallar.ts';
import type { GrupOzelligi } from './kurallar.ts';

// Saf kural testleri (kart 3281-1): özellik listesi elle kurulur. Ölçüler mm.
let no = 0;
const delik = (konum: [number, number, number], y: Partial<GrupOzelligi> = {}): GrupOzelligi => ({
  sira: ++no, tur: 'delik', ust: null, capMm: 5, yaricapMm: null, derinlikMm: 12, aciDerece: 118, genislikMm: null, boyMm: null,
  gecis: false, dip: 'matkap', ic: null, eksen: [0, 0, -1], konum, ...y,
});
const bagliOzellik = (ust: number, y: Partial<GrupOzelligi>): GrupOzelligi => ({ ...delik([0, 0, 0]), ust, tur: 'kademe', konum: null, eksen: null, ...y });
const daire = (n: number, r: number, aci0 = 0): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => { const a = ((aci0 + (360 / n) * i) * Math.PI) / 180; return [60 + r * Math.cos(a), 40 + r * Math.sin(a), 20]; });

describe('geometri: özellik grupları, desen ve diş adayı (3281-1)', () => {
  test('GEO-GR1 aynı ölçü ve yöndeki delikler tek grup; yön ya da derinlik farkı ayrı grup; adet çok olan önce', () => {
    no = 0;
    const g = ozellikGruplari([
      delik([0, 0, 20]), delik([10, 0, 20]), delik([20, 0, 20]),
      delik([0, 0, 0], { eksen: [0, 0, 1] }),
      delik([0, 10, 20], { derinlikMm: 15 }),
    ], YERLESIK_DIS_TABLOSU);
    assert.deepEqual(g.map((x) => [x.tur, x.adet, x.siralar]), [['delik', 3, [1, 2, 3]], ['delik', 1, [4]], ['delik', 1, [5]]]);
  });

  test('GEO-GR2 bağlı kademe ya da havşası farklı olan aynı çaplı delikler ayrı grup; kademe kendisi grup değildir', () => {
    no = 0;
    const a = delik([0, 0, 20], { gecis: true, dip: null }), b = delik([30, 0, 20], { gecis: true, dip: null }), c = delik([60, 0, 20], { gecis: true, dip: null });
    const g = ozellikGruplari([a, b, c,
      bagliOzellik(a.sira, { capMm: 11, derinlikMm: 5 }), bagliOzellik(b.sira, { capMm: 11, derinlikMm: 5 }), bagliOzellik(c.sira, { capMm: 11, derinlikMm: 6 })],
    YERLESIK_DIS_TABLOSU);
    assert.deepEqual(g.map((x) => x.siralar), [[1, 2], [3]]);
  });

  test('GEO-GR3 pah ve radyüs ölçüye göre gruplanır; desen ve diş yoktur', () => {
    no = 0;
    const pah = (g: number): GrupOzelligi => ({ ...delik([0, 0, 0]), tur: 'pah', genislikMm: g, aciDerece: 45, capMm: null, konum: null, eksen: null });
    const r = (y: number, ic: boolean): GrupOzelligi => ({ ...delik([0, 0, 0]), tur: 'radyus', yaricapMm: y, ic, capMm: null, konum: null, eksen: null });
    const g = ozellikGruplari([pah(1.41), pah(1.41), r(2, false), r(2, false), r(2, true)], YERLESIK_DIS_TABLOSU);
    assert.deepEqual(g.map((x) => [x.tur, x.adet, x.desen, x.disAdayi, x.ldOrani]),
      [['radyus', 2, null, null, null], ['pah', 2, null, null, null], ['radyus', 1, null, null, null]]);
  });

  test('GEO-GR4 dikdörtgen köşeleri ızgara (adımlar ve satır/sütun); kare de ızgaradır, daire değil', () => {
    assert.deepEqual(desenBul([[10, 10, 20], [110, 10, 20], [10, 70, 20], [110, 70, 20]], [0, 0, -1]),
      { tur: 'izgara', capMm: null, adimMm: 60, adim2Mm: 100, adimDerece: null, satir: 2, sutun: 2 });
    assert.equal(desenBul([[0, 0, 0], [10, 0, 0], [0, 10, 0], [10, 10, 0]], [0, 0, 1]).tur, 'izgara');
    const iz = desenBul([0, 1, 2].flatMap((i) => [0, 1].map((j) => [i * 20, j * 15, 5] as [number, number, number])), [0, 0, 1]);
    assert.deepEqual([iz.tur, iz.satir! * iz.sutun!], ['izgara', 6]);
  });

  test('GEO-GR5 eşit aralıklı daire: flanş dairesi çapı ve açı adımı; başlangıç açısından bağımsız', () => {
    assert.deepEqual(desenBul(daire(6, 25), [0, 0, -1]), { tur: 'daire', capMm: 50, adimMm: null, adim2Mm: null, adimDerece: 60, satir: null, sutun: null });
    assert.deepEqual([desenBul(daire(5, 30, 17), [0, 0, 1]).tur, desenBul(daire(5, 30, 17), [0, 0, 1]).capMm], ['daire', 60]);
  });

  test('GEO-GR6 doğrusal sıra eşit adımla; eşit olmayan aralık, kısmi yay, iki delik ve farklı düzlem dağınıktır', () => {
    assert.deepEqual(desenBul([[30, 80, 10], [60, 80, 10], [90, 80, 10]], [0, -1, 0]),
      { tur: 'dogrusal', capMm: null, adimMm: 30, adim2Mm: null, adimDerece: null, satir: null, sutun: 3 });
    assert.equal(desenBul([[0, 0, 0], [10, 0, 0], [25, 0, 0]], [0, 0, 1]).tur, 'daginik');
    assert.equal(desenBul(daire(6, 25).slice(0, 3), [0, 0, 1]).tur, 'daginik', 'yarım yay');
    assert.equal(desenBul([[0, 0, 0], [10, 0, 0]], [0, 0, 1]).tur, 'daginik');
    assert.equal(desenBul([[0, 0, 0], [10, 0, 0], [20, 0, 3]], [0, 0, 1]).tur, 'daginik', 'girişler aynı düzlemde değil');
  });

  test('GEO-GR10 daire: merkeze eşit uzak ama açıları eşit aralıklı olmayan delikler daire değildir; iki çaptaki dört delik dikdörtgendir (ızgara)', () => {
    const cember = (acilar: number[]): [number, number, number][] => acilar.map((a) => [25 * Math.cos((a * Math.PI) / 180), 25 * Math.sin((a * Math.PI) / 180), 0]);
    assert.equal(desenBul(cember([0, 40, 120, 180, 220, 300]), [0, 0, 1]).tur, 'daginik', 'eşit uzak, açı adımı 40/80/60');
    assert.equal(desenBul(cember([0, 100, 230]), [0, 0, 1]).tur, 'daginik', 'üç delik, eşit olmayan açı');
    // 0, 30, 180, 210: iki çapın uçları dikdörtgenin köşeleridir (köşegenler eşit ve birbirini ortalar); dik kenarlı 2 x 2 ızgara doğru sonuçtur.
    const d = desenBul(cember([0, 30, 180, 210]), [0, 0, 1]);
    assert.deepEqual([d.tur, d.satir, d.sutun, d.adimMm, d.adim2Mm], ['izgara', 2, 2, 12.941, 48.2963]);
    assert.equal(desenBul(cember([0, 30, 170, 210]), [0, 0, 1]).tur, 'daginik', 'çaplardan biri kayınca dikdörtgen değil');
  });

  test('GEO-GR11 bağlı (ust dolu) özellik, türü ne olursa olsun kendi grubuna girmez', () => {
    no = 0;
    const a = delik([0, 0, 20]);
    const g = ozellikGruplari([a, { ...delik([0, 0, 0]), tur: 'pah', ust: a.sira, genislikMm: 1, aciDerece: 45, konum: null, eksen: null }], YERLESIK_DIS_TABLOSU);
    assert.deepEqual(g.map((x) => [x.tur, x.siralar]), [['delik', [1]]]);
  });

  test('GEO-GR7 eğik eksenli düzlemde de desen bulunur', () => {
    const s = Math.SQRT1_2;
    const p = [0, 1, 2, 3].map((i) => [i * 10 * s, -i * 10 * s, 7] as [number, number, number]);
    assert.deepEqual([desenBul(p, [s, s, 0]).tur, desenBul(p, [s, s, 0]).adimMm], ['dogrusal', 10]);
  });

  test('GEO-GR8 diş adayı 0,05 mm içinde en yakın matkap çapı; ayar okunamazsa yerleşik tablo', () => {
    assert.equal(disAdayi(5, YERLESIK_DIS_TABLOSU), 'M6');
    assert.equal(disAdayi(5.04, YERLESIK_DIS_TABLOSU), 'M6');
    assert.equal(disAdayi(5.1, YERLESIK_DIS_TABLOSU), null);
    assert.equal(disAdayi(null, YERLESIK_DIS_TABLOSU), null);
    assert.deepEqual(disTablosuOku('M6=5,1; ince M8 = 7 ;bozuk\nM3x0,35=2.65'), [{ ad: 'M6', capMm: 5.1 }, { ad: 'ince M8', capMm: 7 }, { ad: 'M3x0,35', capMm: 2.65 }]);
    assert.deepEqual(disTablosuOku(''), [...YERLESIK_DIS_TABLOSU]);
    assert.deepEqual(disTablosuOku('bozuk; M6=0'), [...YERLESIK_DIS_TABLOSU]);
  });

  test('GEO-GR9 delik grubunda desen, diş adayı ve L/D birlikte gelir; konumu olmayan delikte desen dağınık', () => {
    no = 0;
    const g = ozellikGruplari(daire(6, 25).map((p) => delik(p)), YERLESIK_DIS_TABLOSU)[0]!;
    assert.deepEqual([g.adet, g.desen?.tur, g.desen?.capMm, g.disAdayi, g.ldOrani], [6, 'daire', 50, 'M6', 2.4]);
    const k = ozellikGruplari([delik([0, 0, 0], { konum: null }), delik([1, 0, 0]), delik([2, 0, 0])], YERLESIK_DIS_TABLOSU)[0]!;
    assert.equal(k.desen?.tur, 'daginik');
  });
});
