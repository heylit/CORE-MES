import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { acilacakUrunler, mrpSatirlari, type MrpGirdisi } from './mrp-kurallar.ts';

// 1472 M1: malzeme ihtiyacı (brüt, net) kuralı. Veriler uydurmadır.

const GUN = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 9);
const HAM = 10;
const HAM2 = 11;
const YARI = 20;

const temel: MrpGirdisi = {
  emirler: [{ id: 1, no: 'E-1', baslama: null }, { id: 2, no: 'E-2', baslama: T0 - GUN }, { id: 3, no: 'E-3', baslama: null }],
  ihtiyaclar: new Map([
    [1, [{ malzemeNo: HAM, opNo: 10, brut: '6' }, { malzemeNo: HAM, opNo: 20, brut: '2' }, { malzemeNo: YARI, opNo: 20, brut: '4' }]],
    [2, [{ malzemeNo: HAM, opNo: 10, brut: '5' }]],
    [3, null],
  ]),
  sarflar: [],
  baslangiclar: new Map([['1:10', T0 + 2 * GUN], ['1:20', T0 + 3 * GUN], ['2:10', T0]]),
  kartlar: new Map([[HAM, { tur: 'hammadde' }], [HAM2, { tur: 'hammadde' }], [YARI, { tur: 'yarimamul' }]]),
  serbest: new Map([[HAM, '4']]),
  kritik: new Map(),
  gelisler: new Map(),
  agaclar: new Map(),
};
const satir = (l: ReturnType<typeof mrpSatirlari>, no: number) => l.find((x) => x.malzemeNo === no);

describe('plan: MRP ihtiyaç kuralı (1472 M1)', () => {
  test('stok en erken tüketime düşer; net eksik, ihtiyaç ve eksik günü; emirler tüketim sırasıyla', () => {
    const h = satir(mrpSatirlari(temel), HAM)!;
    assert.deepEqual(
      [h.brut, h.serbest, h.net, h.ihtiyacTarihi, h.eksikTarihi, h.emirler, h.acildi],
      [13, 4, 9, '2026-11-02', '2026-11-02', ['E-2', 'E-1'], false],
    );
  });

  test('stok kaydı yoksa serbest ve net boş; brüt yine görünür', () => {
    const y = satir(mrpSatirlari(temel), YARI)!;
    assert.deepEqual([y.brut, y.serbest, y.net, y.acildi], [4, null, null, false], 'ağacı verilmeyen yarı mamul açılmaz');
  });

  test('verilmiş sarf düşülür; tamamı verilmiş malzeme satır vermez', () => {
    const l = mrpSatirlari({ ...temel, sarflar: [{ emirId: 2, malzemeId: HAM, miktar: '5' }, { emirId: 1, malzemeId: YARI, miktar: '4' }] });
    assert.deepEqual([satir(l, HAM)!.brut, satir(l, HAM)!.net, satir(l, HAM)!.emirler], [8, 4, ['E-1']]);
    assert.equal(satir(l, YARI), undefined);
  });

  test('açık sipariş yalnız geliş günü tüketim gününden sonra değilse düşer; tarihsiz geliş günü bilinen tüketime düşmez', () => {
    // Stok 4: E-2 (T0) 5 ister, 1 eksik. E-1 (T0+2) 8 ister. T0+1 gelen 6 E-1'e düşer, T0+5 gelen 10 ve tarihsiz 3 düşmez.
    const gelisler = new Map([[HAM, [{ tarih: '2026-11-03', miktar: '6' }, { tarih: '2026-11-07', miktar: '10' }, { tarih: null, miktar: '3' }]]]);
    const h = satir(mrpSatirlari({ ...temel, gelisler }), HAM)!;
    assert.deepEqual([h.acikSiparis, h.net, h.eksikTarihi], [19, 3, '2026-11-02']);
  });

  test('günü bilinmeyen tüketim en sona kalır; her geliş ona düşer, eksik günü boştur', () => {
    const g: MrpGirdisi = { ...temel, emirler: [{ id: 1, no: 'E-1', baslama: null }], baslangiclar: new Map(), serbest: new Map([[HAM, '0']]),
      gelisler: new Map([[HAM, [{ tarih: null, miktar: '3' }, { tarih: '2030-01-01', miktar: '2' }]]]) };
    const h = satir(mrpSatirlari(g), HAM)!;
    assert.deepEqual([h.brut, h.net, h.ihtiyacTarihi, h.eksikTarihi], [8, 3, null, null]);
  });

  test('rotası olan yarı mamul önce kendi stoğuyla netlenir, karşılanamayan miktar ağacıyla hammaddeye açılır', () => {
    // YARI 4 ister, stok 1: 3 açılır. 1 adet YARI = 2.5 HAM2 + 0.5 HAM.
    const g = { ...temel, serbest: new Map([[HAM, '4'], [YARI, '1']]) };
    assert.deepEqual([...acilacakUrunler(g)], [[YARI, 3]]);
    const l = mrpSatirlari({ ...g, agaclar: new Map([[YARI, new Map([[HAM2, 2.5], [HAM, 0.5]])]]) });
    const y = satir(l, YARI)!;
    assert.deepEqual([y.brut, y.serbest, y.net, y.acildi], [4, 1, 3, true]);
    const h2 = satir(l, HAM2)!;
    assert.deepEqual([h2.brut, h2.net, h2.acilanlar, h2.emirler, h2.ihtiyacTarihi], [7.5, null, [YARI], ['E-1'], '2026-11-05']);
    const h = satir(l, HAM)!;
    assert.deepEqual([h.brut, h.net, h.acilanlar], [14.5, 10.5, [YARI]], 'doğrudan ve açılımdan gelen ihtiyaç aynı satırda');
  });

  test('stoğu yeten yarı mamul açılmaz; hammadde türü ağaç verilse de açılmaz', () => {
    assert.deepEqual([...acilacakUrunler({ ...temel, serbest: new Map([[YARI, '9']]) })], []);
    const l = mrpSatirlari({ ...temel, agaclar: new Map([[HAM, new Map([[HAM2, 1]])]]) });
    assert.equal(satir(l, HAM2), undefined);
    assert.equal(satir(l, HAM)!.acildi, false);
  });

  test('ürünsüz emir ihtiyaç vermez; boş girdi boş rapor', () => {
    assert.deepEqual(mrpSatirlari({ ...temel, emirler: [{ id: 3, no: 'E-3', baslama: null }] }), []);
  });

  test('1543 a: tüketimden sonra kalan stok ve kullanılmayan sipariş kritik seviyenin altındaysa fark nete eklenir', () => {
    // HAM: brüt 13, stok 20 -> 7 kalır; kritik 10 -> emniyet 3. Kullanılmayan sipariş 2 -> emniyet 1.
    const g = { ...temel, serbest: new Map([[HAM, '20']]), kritik: new Map([[HAM, '10']]) };
    assert.deepEqual([satir(mrpSatirlari(g), HAM)!.net, satir(mrpSatirlari(g), HAM)!.emniyetPayi], [3, 3]);
    const s = satir(mrpSatirlari({ ...g, gelisler: new Map([[HAM, [{ tarih: '2030-01-01', miktar: '2' }]]]) }), HAM)!;
    assert.deepEqual([s.net, s.emniyetPayi], [1, 1]);
    // Eksik varken: stok 4, brüt 13 -> eksik 9, kalan stok 0, emniyet 10.
    const e = satir(mrpSatirlari({ ...temel, kritik: new Map([[HAM, '10']]) }), HAM)!;
    assert.deepEqual([e.net, e.emniyetPayi], [19, 10]);
    assert.equal(satir(mrpSatirlari(temel), HAM)!.emniyetPayi, null, 'kritik seviye tanımsız');
  });

  test('1545 a: satın alma görünmüyorsa açık sipariş ve net boş; stok görünmüyorsa serbest ve net boş', () => {
    const h = satir(mrpSatirlari({ ...temel, gelisler: null }), HAM)!;
    assert.deepEqual([h.brut, h.serbest, h.acikSiparis, h.net, h.emniyetPayi], [13, 4, null, null, null]);
    const s = satir(mrpSatirlari({ ...temel, serbest: new Map() }), HAM)!;
    assert.deepEqual([s.serbest, s.net, s.acikSiparis], [null, null, 0]);
  });

  test('sıra: eksik günü, sonra ihtiyaç günü, sonra malzeme', () => {
    const l = mrpSatirlari({ ...temel, serbest: new Map([[HAM, '100'], [YARI, '0']]) });
    assert.deepEqual(l.map((x) => [x.malzemeNo, x.eksikTarihi]), [[YARI, '2026-11-05'], [HAM, null]]);
  });
});
