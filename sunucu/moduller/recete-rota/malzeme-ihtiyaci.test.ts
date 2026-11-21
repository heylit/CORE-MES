import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { araStokHavuzuKur, emirMalzemeIhtiyaclari, type IhtiyacGirdisi } from './kurallar.ts';

// 2486-8 (461 b): emir malzeme ihtiyacının saf kuralı. Kimlikler sunucunun biçimindedir: adım `<ürün>-o<OP>`.
type Girdi = IhtiyacGirdisi['durum'];
type Kart = NonNullable<Girdi['items']>[number];
type Emir = NonNullable<Girdi['emirler']>['orders'][number];
type Adim = NonNullable<Girdi['routes']>[string]['steps'][number];

const kart = (no: number, type: Kart['type'], stock: number | null = null): Kart => ({
  id: String(no), kayitNo: no, code: `K-${String(no)}`, name: `Kart ${String(no)}`, type, unit: 'ad', cost: null, stock, min: null, aktif: true,
  kategori: null, kategoriAdi: null, girdiOlabilir: true,
});
const adim = (urun: number, op: number, ek: Partial<Adim> = {}): Adim => ({ id: `${String(urun)}-o${String(op)}`, seq: op, opNo: op, rejectPct: 0, ins: [], outs: [], ...ek } as Adim);
const emir = (no: number, urun: number, qty: number, ek: Partial<Emir> = {}): Emir => ({
  id: String(no), kayitNo: no, no: `E-${String(no)}`, itemId: String(urun), qty, start: null, due: null, priority: 3, note: null, rev: null, status: 'serbest',
  created: no, doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: 1, ...ek,
} as Emir);
const girdi = (g: { items: Kart[]; routes: Record<string, Adim[]>; orders: Emir[]; opProg?: Record<string, number> }, ek: Partial<IhtiyacGirdisi> = {}): IhtiyacGirdisi => ({
  durum: {
    items: g.items, routeRevs: [],
    routes: Object.fromEntries(Object.entries(g.routes).map(([k, steps]) => [k, { base: null, steps }])),
    emirler: { orders: g.orders, opStatus: {}, opProg: g.opProg ?? {} },
  },
  kopyalar: new Map(), sarflar: [], araStok: new Map(), ...ek,
});
const satir = (r: ReturnType<typeof emirMalzemeIhtiyaclari>, emirId: number, no: number) =>
  r.find((x) => x.emirId === emirId)?.hammadde.find((h) => h.malzemeNo === no);

describe('emir malzeme ihtiyacı (2486-8, 461 b)', () => {
  test('kökte brüt emrin kopyasındandır: verilen sarf düşülür, kalan serbest stoktan, eksik alınacak', () => {
    const r = emirMalzemeIhtiyaclari(girdi(
      { items: [kart(1, 'mamul'), kart(2, 'ham', 4)], routes: { 1: [adim(1, 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }] })] }, orders: [emir(100, 1, 10)] },
      { kopyalar: new Map([[100, [{ malzemeNo: 2, opNo: 10, brut: '10.0000' }]]]), sarflar: [{ emirId: 100, malzemeId: 2, miktar: '3' }] },
    ));
    assert.deepEqual(satir(r, 100, 2), { malzemeNo: 2, brut: 10, verilen: 3, stoktan: 4, alinacak: 3 });
  });

  test('B-2502-2: dallı fireli rotada brüt kopyadan gelir (105); rotanın sıra çarpanı (210) kullanılmaz', () => {
    const r = emirMalzemeIhtiyaclari(girdi(
      { items: [kart(1, 'mamul'), kart(2, 'ham')], routes: { 1: [adim(1, 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), adim(1, 20, { rejectPct: 50 }), adim(1, 30)] }, orders: [emir(100, 1, 100)] },
      { kopyalar: new Map([[100, [{ malzemeNo: 2, opNo: 10, brut: '105.0000' }]]]) },
    ));
    assert.equal(satir(r, 100, 2)?.brut, 105);
  });

  test('serbest stok plan sırasıyla paylaşılır: önce başlamış, sonra öncelik; sonraki emir kalanla hesaplanır', () => {
    const kopya = (no: number) => [no, [{ malzemeNo: 2, opNo: 10, brut: '6' }]] as const;
    const r = emirMalzemeIhtiyaclari(girdi(
      { items: [kart(1, 'mamul'), kart(2, 'ham', 8)], routes: { 1: [adim(1, 10)] }, orders: [emir(100, 1, 6, { priority: 1 }), emir(101, 1, 6, { priority: 4 }), emir(102, 1, 6, { priority: 4 })], opProg: { '102|root|1': 2 } },
      { kopyalar: new Map([kopya(100), kopya(101), kopya(102)]) },
    ));
    assert.deepEqual(r.map((x) => x.emirId), [102, 100, 101], 'başlamış önce, sonra öncelik');
    assert.deepEqual([satir(r, 102, 2)?.stoktan, satir(r, 100, 2)?.stoktan, satir(r, 101, 2)?.stoktan], [6, 2, 0]);
    assert.equal(satir(r, 101, 2)?.alinacak, 6);
  });

  test('ara adım stoğu (461 b): OP 10 çıktısı olarak bekleyen 4 adet OP 10 ve öncesini azaltır; artan sonraki emre kalır', () => {
    const g = (ara: number) => girdi(
      { items: [kart(1, 'mamul'), kart(2, 'ham')], routes: { 1: [adim(1, 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), adim(1, 20)] }, orders: [emir(100, 1, 10, { priority: 1 }), emir(101, 1, 10)] },
      { kopyalar: new Map([[100, [{ malzemeNo: 2, opNo: 10, brut: '10' }]], [101, [{ malzemeNo: 2, opNo: 10, brut: '10' }]]]), araStok: new Map([['1|1-o10', ara]]) },
    );
    const r = emirMalzemeIhtiyaclari(g(4));
    assert.equal(satir(r, 100, 2)?.brut, 6);
    assert.equal(satir(r, 101, 2)?.brut, 10, 'ara stok ilk emirde bitti');
    const fazla = emirMalzemeIhtiyaclari(g(14));
    assert.equal(satir(fazla, 100, 2), undefined, 'OP 10 hiç yapılmaz');
    assert.equal(satir(fazla, 101, 2)?.brut, 6, 'artan 4 sonraki emre');
  });

  test('3320 a (T10, K4): çıktısı YM kartı olan adımda kartın serbest stoğu ara stok gibi düşülür; stok yoksa, azsa, çoksa', () => {
    const g = (ymStok: number | null) => girdi(
      { items: [kart(1, 'mamul'), kart(2, 'ham'), kart(3, 'yari', ymStok)], routes: { 1: [adim(1, 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }], ciktiId: '3' }), adim(1, 20, { ciktiId: null })] },
        orders: [emir(100, 1, 10, { priority: 1 }), emir(101, 1, 10)] },
      { kopyalar: new Map([[100, [{ malzemeNo: 2, opNo: 10, brut: '10' }]], [101, [{ malzemeNo: 2, opNo: 10, brut: '10' }]]]) },
    );
    const yok = emirMalzemeIhtiyaclari(g(null));
    assert.deepEqual([satir(yok, 100, 2)?.brut, satir(yok, 101, 2)?.brut], [10, 10], 'stok yok: ihtiyaç değişmez');
    const az = emirMalzemeIhtiyaclari(g(4));
    assert.deepEqual([satir(az, 100, 2)?.brut, satir(az, 101, 2)?.brut], [6, 10], 'iki emir, 4 adet YM ilk emirde biter');
    const cok = emirMalzemeIhtiyaclari(g(14));
    assert.deepEqual([satir(cok, 100, 2), satir(cok, 101, 2)?.brut], [undefined, 6], 'artan YM sonraki emre');
  });

  test('kol emri ve kolu olan emir ara stok kullanmaz; çok katmanlı emrin düğüm ürünü yeniden açılmaz', () => {
    const r = emirMalzemeIhtiyaclari(girdi(
      {
        items: [kart(1, 'mamul'), kart(2, 'ham'), kart(3, 'yari')],
        routes: { 1: [adim(1, 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), adim(1, 20), adim(1, 30), adim(1, 40)], 3: [adim(3, 10, { ins: [{ itemId: '2', qty: 5, scrap: 0 }] })] },
        orders: [emir(100, 1, 10, { dugumler: [{ dugum: '0.1', itemId: '3', carpan: 1, birim: 1, ust: '0', ustOpNo: 10, adimlar: [] }] }), emir(101, 1, 4, { parentId: '100', kol: { n: 1, m: 4 } })],
      },
      { kopyalar: new Map([[100, [{ malzemeNo: 2, opNo: 10, brut: '10' }, { malzemeNo: 3, opNo: 10, brut: '10' }]], [101, []]]), araStok: new Map([['1|1-o10', 4]]) },
    ));
    assert.equal(satir(r, 100, 2)?.brut, 10, 'kolu olan emirde ara stok düşülmez; düğüm ürünü (3) açılmadı');
    assert.equal(r.find((x) => x.emirId === 100)?.hammadde.length, 1);
  });

  test('3515: bölünmüş emrin yan ürünü bölmeden sonraki adetlerledir; emir kolun yapmadığı adımları kol adedi kadar fazla yapar', () => {
    const yanli = (op: number) => adim(1, op, { outs: [{ itemId: String(100 + op), qty: 1, kind: 'yan' }] } as Partial<Adim>);
    const kartlar = [kart(1, 'mamul'), ...[10, 20, 30, 40].map((op) => kart(100 + op, 'ham'))];
    const kos = (ust: number, kol: number, araligi: { n: number; m: number }) => {
      const r = emirMalzemeIhtiyaclari(girdi(
        { items: kartlar, routes: { 1: [yanli(10), yanli(20), yanli(30), yanli(40)] }, orders: [emir(100, 1, ust), emir(101, 1, kol, { parentId: '100', kol: araligi })] },
        { kopyalar: new Map([[100, []], [101, []]]) },
      ));
      const yan = (id: number) => Object.fromEntries((r.find((x) => x.emirId === id)?.yanUrun ?? []).map((y) => [y.malzemeNo - 100, y.miktar]));
      return [yan(100), yan(101)];
    };
    // 9 adetlik emir OP 20'den 3 adet bölündü, kol OP 40'ta katılır: OP 10 ve OP 40'ı emir 9 adetle, OP 20-30'u emir 6, kol 3 adetle yapar.
    assert.deepEqual(kos(6, 3, { n: 1, m: 4 }), [{ 10: 9, 20: 6, 30: 6, 40: 9 }, { 20: 3, 30: 3 }]);
    // Ayrı ilerleyen kol (m = adım sayısı + 1) sona kadar kendi adedini yapar.
    assert.deepEqual(kos(6, 3, { n: 1, m: 5 }), [{ 10: 9, 20: 6, 30: 6, 40: 6 }, { 20: 3, 30: 3, 40: 3 }]);
    // Kol üst emirden büyük olabilir: 9'dan 6 bölünür.
    assert.deepEqual(kos(3, 6, { n: 1, m: 5 }), [{ 10: 9, 20: 3, 30: 3, 40: 3 }, { 20: 6, 30: 6, 40: 6 }]);
    // İlk adımdan bölünüp OP 30'da katılan kol (n = 0).
    assert.deepEqual(kos(6, 3, { n: 0, m: 3 }), [{ 10: 6, 20: 6, 30: 9, 40: 9 }, { 10: 3, 20: 3 }]);
  });

  test('3515 (Test T1): iç içe bölmede emir kolun yapmadığı adımda kolun alt ağacını sayar (9 = 6 + 2 + 1)', () => {
    const yanli = (op: number) => adim(1, op, { outs: [{ itemId: String(100 + op), qty: 1, kind: 'yan' }] } as Partial<Adim>);
    const r = emirMalzemeIhtiyaclari(girdi(
      {
        items: [kart(1, 'mamul'), ...[10, 20, 30, 40].map((op) => kart(100 + op, 'ham'))], routes: { 1: [yanli(10), yanli(20), yanli(30), yanli(40)] },
        orders: [emir(100, 1, 6), emir(101, 1, 2, { parentId: '100', kol: { n: 1, m: 5 } }), emir(102, 1, 1, { parentId: '101', kol: { n: 2, m: 5 } })],
      },
      { kopyalar: new Map([[100, []], [101, []], [102, []]]) },
    ));
    const yan = (id: number) => Object.fromEntries((r.find((x) => x.emirId === id)?.yanUrun ?? []).map((y) => [y.malzemeNo - 100, y.miktar]));
    assert.deepEqual([yan(100), yan(101), yan(102)], [{ 10: 9, 20: 6, 30: 6, 40: 6 }, { 20: 3, 30: 2, 40: 2 }, { 30: 1, 40: 1 }]);
  });

  test('kök altı yarı mamul stoktan netleşir, kalanı rotasından açılır; rotasız yarı mamul uyarıyla satın alınan gibi', () => {
    const r = emirMalzemeIhtiyaclari(girdi(
      { items: [kart(1, 'mamul'), kart(2, 'ham'), kart(3, 'yari', 3), kart(4, 'yari')], routes: { 1: [adim(1, 10)], 3: [adim(3, 10, { ins: [{ itemId: '2', qty: 2, scrap: 0 }] })] }, orders: [emir(100, 1, 10)] },
      { kopyalar: new Map([[100, [{ malzemeNo: 3, opNo: 10, brut: '10' }, { malzemeNo: 4, opNo: 10, brut: '1' }]]]) },
    ));
    assert.equal(satir(r, 100, 2)?.brut, 14);
    assert.equal(satir(r, 100, 4)?.alinacak, 1);
    assert.deepEqual(r[0]?.uyarilar, ['K-4 Kart 4: rotası yok, satın alınan parça gibi hesaplandı.']);
  });

  test('taslak emir hesaba girmez; kopyası olmayan emir uyarı verir', () => {
    const r = emirMalzemeIhtiyaclari(girdi({ items: [kart(1, 'mamul')], routes: { 1: [adim(1, 10)] }, orders: [emir(100, 1, 1, { status: 'taslak' }), emir(101, 1, 1)] }));
    assert.deepEqual(r.map((x) => [x.emirId, x.uyarilar]), [[101, ['Emrin iş emri kopyası okunamadı; malzeme ihtiyacı hesaplanmadı.']]]);
  });

  test('ara stok havuzu: statünün kaynak adımı ürün ve adım kimliğine eşlenir; ürünsüz eski biçim sayılmaz', () => {
    const h = araStokHavuzuKur([{ id: 7, kaynakAdim: '1-o20' }, { id: 8, kaynakAdim: 'o20' }], [{ statuId: 7, miktar: '4' }, { statuId: 7, miktar: '1.5' }, { statuId: 8, miktar: '9' }]);
    assert.deepEqual([...h], [['1|1-o20', 5.5]]);
  });
  test('2526: kök altı dallı yarı mamulde adım miktarı rotanın ardıl yolundandır (2486-1): B dalının %50 firesi A dalını büyütmez', () => {
    const d = (op: number, dal: string | null, ek: Partial<Adim> = {}) => adim(3, op, { dep: 'bagimli', dal, ...ek } as Partial<Adim>);
    const r = emirMalzemeIhtiyaclari(girdi(
      {
        items: [kart(1, 'mamul'), kart(2, 'ham'), kart(3, 'yari'), kart(5, 'ham')],
        routes: {
          1: [adim(1, 10)],
          3: [d(10, 'A', { ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), d(20, 'B', { rejectPct: 50, ins: [{ itemId: '5', qty: 1, scrap: 0 }] }), d(30, null, { birlesen: ['A', 'B'] } as Partial<Adim>)],
        },
        orders: [emir(100, 1, 10)],
      },
      { kopyalar: new Map([[100, [{ malzemeNo: 3, opNo: 10, brut: '10' }]]]) },
    ));
    assert.deepEqual([satir(r, 100, 2)?.brut, satir(r, 100, 5)?.brut], [10, 20]);
  });
});
