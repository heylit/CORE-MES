import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cozumGirdisi } from './plan-girdisi.ts';

// 1567 a: kök adımın emirdeki istasyonu ve süresi (durum.emirler.opYer) rotadakinden ayrıysa sunucu motoru emrinkini kullanır. Ürün 50:
// OP10 Torna (istasyon 10, makine 100), OP20 Torna ya da aday Freze (istasyon 20, makine 200 ve 201), OP30 rotada fason, OP40 kişi adımı.
// Veriler uydurmadır.

const KAYIT = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] };
const calisma = (D: Record<string, unknown>): Record<string, unknown> => ({
  D, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const adim = (op: number, a: Record<string, unknown>) => ({
  id: `50-o${String(op)}`, seq: op, opNo: op, opId: '13', stationId: '10', fasonId: null, kisiId: null, terminGun: null, setup: 10, cycle: 2, alts: [], altTimes: {}, ins: [], ...a,
});
const ROTA = [
  adim(10, {}),
  adim(20, { alts: ['20'], altTimes: { 20: { setup: 5, cycle: 3 } } }),
  adim(30, { stationId: null, fasonId: '5', terminGun: 3, setup: null, cycle: null }),
  adim(40, { stationId: null, kisiId: '9' }),
];
type Yer = { fasonId: string | null; terminGun: number | null; stationId: string | null; setup: number | null; cycle: number | null };
const rotadaki: Record<number, Yer> = {
  1: { fasonId: null, terminGun: null, stationId: '10', setup: 10, cycle: 2 },
  2: { fasonId: null, terminGun: null, stationId: '10', setup: 10, cycle: 2 },
  4: { fasonId: null, terminGun: null, stationId: '10', setup: 10, cycle: 2 },
};
const durum = (opYer: Record<number, Yer>) => ({
  stations: ['10', '20'].map((id) => ({ id, code: `I${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true })),
  machines: [['100', '10'], ['200', '20'], ['201', '20']].map(([id, st]) => ({ id, code: `M${id!}`, name: `Makine ${id!}`, stationId: st, status: 'aktif', aktif: true })),
  items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'adet', stock: 0 }],
  opdefs: [{ id: '13', code: 'OP', name: 'Isleme' }],
  routes: { 50: { steps: ROTA } },
  routeRevs: [{ id: '1', itemId: '50', status: 'yururlukte' }],
  emirler: {
    orders: [{ id: '7', no: 'UE-7', itemId: '50', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 2, note: '', status: 'serbest', rev: '1' }],
    opStatus: {}, opProg: {}, opYer: Object.fromEntries(Object.entries(opYer).map(([s, y]) => [`7|root|${s}`, y])),
  },
});
type Tezgah = { id: string; ayar: number; cevrim: number };
type Urun = { id: string; rota: { k: string; fason?: string; tezgahlar?: Tezgah[] }[] };
const coz = (opYer: Record<number, Yer>) => {
  const g = cozumGirdisi({
    calisma: calisma(D0), kayit: KAYIT, kaynak: { durum: durum(opYer), ek: null },
    istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['UE-7|10', 'UE-7|20'] }], sabitler: [], calisanlar: [] },
  }) as unknown as { st: { D: { siparisler: { id: string; urun: string }[]; urunler: Urun[] } } } | null;
  assert.ok(g);
  const D = g.st.D;
  const urunId = D.siparisler.find((s) => s.id === '7')!.urun;
  return { urunId, rota: D.urunler.find((u) => u.id === urunId)!.rota, ortak: D.urunler.find((u) => u.id === '50')!.rota };
};
const sure = (t: Tezgah[] | undefined) => (t ?? []).map((x) => [x.id, x.ayar, x.cevrim]);

describe('plan sunucu motoru: emre özel istasyon ve süre (1567 a)', () => {
  test('emirdeki değerler rotadakiyle aynıysa ürün kopyalanmaz', () => {
    assert.equal(coz(rotadaki).urunId, '50');
  });

  test('aynı istasyonda emrin süresi: adım emre özel kopyada emrin ayar ve birim süresini alır, ortak ürün değişmez', () => {
    const r = coz({ ...rotadaki, 1: { ...rotadaki[1]!, setup: 15, cycle: 4 } });
    assert.equal(r.urunId, '50#7');
    assert.deepEqual(sure(r.rota[0]!.tezgahlar), [['100', 15, 4]]);
    assert.deepEqual(sure(r.rota[1]!.tezgahlar), [['100', 10, 2], ['200', 5, 3], ['201', 5, 3]], 'öteki adım rotadaki gibi');
    assert.deepEqual(sure(r.ortak[0]!.tezgahlar), [['100', 10, 2]]);
  });

  test('emirdeki istasyon ilk aday olur ve emrin süresini alır; rotadaki öteki istasyon kendi süresiyle aday kalır', () => {
    const r = coz({ ...rotadaki, 2: { fasonId: null, terminGun: null, stationId: '20', setup: 8, cycle: 1 } });
    assert.deepEqual(sure(r.rota[1]!.tezgahlar), [['200', 8, 1], ['201', 8, 1], ['100', 10, 2]]);
  });

  test('rotada fason olup emirde içeri alınan adım emrin istasyonunda iç adımdır', () => {
    const fasonlu = coz(rotadaki);
    assert.ok(fasonlu.rota[2]!.fason, 'emirde de fasonsa fason kalır');
    const r = coz({ ...rotadaki, 3: { fasonId: null, terminGun: null, stationId: '20', setup: 6, cycle: 1 } });
    assert.equal(r.rota[2]!.fason, undefined);
    assert.deepEqual(sure(r.rota[2]!.tezgahlar), [['200', 6, 1], ['201', 6, 1]]);
    assert.ok(r.ortak[2]!.fason, 'ortak ürünün rotası fason kalır');
  });

  test('boş süre alanı rotadakidir; sıfır uydurulmaz', () => {
    const r = coz({ ...rotadaki, 1: { fasonId: null, terminGun: null, stationId: '10', setup: null, cycle: 5 } });
    assert.deepEqual(sure(r.rota[0]!.tezgahlar), [['100', 10, 5]]);
  });

  test('reddedilen: kişi adımı, makinesiz istasyon, emirde fason adım ve istasyonsuz içeri alınan adım değişmez', () => {
    assert.equal(coz({ ...rotadaki, 4: { fasonId: null, terminGun: null, stationId: '20', setup: 1, cycle: 1 } }).urunId, '50', 'kişi adımı');
    assert.equal(coz({ ...rotadaki, 1: { fasonId: null, terminGun: null, stationId: '99', setup: 1, cycle: 1 } }).urunId, '50', 'makinesiz istasyon');
    const fasona = coz({ ...rotadaki, 1: { fasonId: '5', terminGun: 2, stationId: '10', setup: 1, cycle: 1 } });
    assert.ok(fasona.rota[0]!.fason, 'emirde fasona alınan adım 988 a ile fason');
    assert.ok(coz({ ...rotadaki, 3: { fasonId: null, terminGun: null, stationId: null, setup: 6, cycle: 1 } }).rota[2]!.fason, 'istasyonsuz içeri alınan adım');
  });
});
