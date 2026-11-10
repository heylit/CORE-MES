import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanMotoruIstegi } from './disari.ts';
import { coz } from './plan-cozucusu.ts';

// 2701 (1737 c): ana istasyonunda işlem süresi girilmemiş adım o istasyonun tezgâhına aday olmaz; sıfır sürede yerleşmez. Süreli alternatif
// istasyon aday kalır; emirde süre varsa emir süresiyle yerleşir. Veriler uydurmadır. Tesis Europe/Istanbul: 05:00Z tesiste 08:00.
const V = '3';
const adim = (opNo: number, dk: number | null, ek: Record<string, unknown> = {}) => ({
  id: `50-o${String(opNo)}`, opNo, seq: opNo, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: dk, chg: null, cycle: dk, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
  ...ek,
});
const istasyon = (id: string, ad: string) => ({ id, code: ad.slice(0, 3).toUpperCase(), name: ad, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const makine = (id: string, stationId: string) => ({ id, code: `M${id}`, name: `Makine ${id}`, stationId, status: 'aktif', aktif: true });
function kaynakKur(adimlar: unknown[], opYer: Record<string, unknown> = {}) {
  return {
    calisma: {
      surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
      w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
      D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
        tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    },
    kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
    kaynak: {
      durum: {
        items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }],
        opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
        routes: { 50: { base: null, steps: adimlar } },
        routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
        wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
        stations: [istasyon('10', 'Torna'), istasyon('11', 'Freze')],
        machines: [makine('100', '10'), makine('110', '11')],
        people: [],
        cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
        emirler: { orders: [{ id: '1', no: 'E-1', itemId: '50', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }], opStatus: {}, opProg: {}, opYer },
        calisanAdimlar: [],
      },
      ek: { takvim: { hafta: { 1: { 1: [V], 2: [V], 3: [V], 4: [V], 5: [V] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, insanliIstasyonlar: [] },
    },
  };
}
const istek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'yeni', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [], calisanlar: [], taslakId: 1, ...ek,
});
const sureDk = (y: { baslangic: string; bitis: string }) => (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000;

describe('süresiz ana istasyon adayı (2701, 1737 c)', () => {
  test('SB-01: süresiz adım kuyruğun makinesinde sıfır sürede yerleşmez; nedeni işlem süresinin boşluğudur', async () => {
    for (const kip of ['yeni', 'sabit'] as const) {
      const r = await coz(kaynakKur([adim(10, null)]), istek({ kip, kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
      assert.equal(r.yerlesimler.some((y) => y.anahtar === 'E-1|10'), false, `${kip}: ${JSON.stringify(r.yerlesimler)}`);
      assert.deepEqual(r.yerlesmeyen, ['E-1|10'], kip);
      assert.equal(r.nedenler['E-1|10'], 'Sunucu motoru yerleştiremedi: adımın işlem süresi boş (rotada çevrim süresi girilmemiş).', kip);
    }
  });
  test('SB-02: süreli alternatif istasyon aday kalır; iş alternatifte kendi süresiyle yerleşir', async () => {
    const r = await coz(kaynakKur([adim(10, null, { alts: ['11'], altTimes: { 11: { setup: 0, cycle: 15 } } })]), istek({ kuyruklar: [{ makineId: 110, anahtarlar: ['E-1|10'] }] }));
    const y = r.yerlesimler.find((x) => x.anahtar === 'E-1|10');
    assert.ok(y, JSON.stringify(r));
    assert.deepEqual([y.makineId, sureDk(y)], [110, 30], 'iki adet x 15 dk, alternatif istasyonda');
  });
  test('SB-04: rotada süresiz adımın emirde süresi varsa emrin süresiyle yerleşir (1567 a)', async () => {
    const r = await coz(kaynakKur([adim(10, null)], { '1|root|1': { stationId: '10', setup: 0, cycle: 20 } }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    const y = r.yerlesimler.find((x) => x.anahtar === 'E-1|10');
    assert.deepEqual([y?.makineId, y && sureDk(y)], [100, 40], JSON.stringify(r));
  });
  test('SB-03: süreli adım bugünkü gibi yerleşir (eşdeğerlik)', async () => {
    const r = await coz(kaynakKur([adim(10, 20)]), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    const y = r.yerlesimler.find((x) => x.anahtar === 'E-1|10');
    assert.deepEqual([y?.makineId, y && sureDk(y)], [100, 40]);
  });
});
