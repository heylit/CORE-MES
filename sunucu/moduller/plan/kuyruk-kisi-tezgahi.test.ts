import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanMotoruIstegi } from './disari.ts';
import { coz } from './plan-cozucusu.ts';

// 2215: rotada makineye bağlı adımın makinesi insanlı istasyondaysa motor girdisi istasyonun kişilerini de aday görür. Plan modülü işi
// makine kuyruğuna koyar (adayı yalnız makinedir); motor kişinin el tezgâhını seçerse sunucu yeri reddeder (409). Makine kuyruğundaki iş
// kişi tezgâhına aday olmaz. Veriler uydurmadır. Tesis Europe/Istanbul: 05:00Z tesiste 08:00, vardiya 08:00-16:00.
const V = '3';
const adim = { id: 'x-o10', opNo: 10, seq: 10, opId: '13', name: 'Olcum', stationId: '10', machineId: '100', kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: 60, chg: null, cycle: 60, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [], ayarli: false };
const emir = (id: string, no: string) => ({ id, no, itemId: '50', qty: 1, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const kaynak = () => ({
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'OLC', name: 'Olcum' }],
      routes: { 50: { base: null, steps: [adim] } },
      routeRevs: [{ id: '750', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'KON', name: 'Kontrol', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
      machines: [{ id: '100', code: 'CMM', name: 'Olcum 1', stationId: '10', status: 'aktif', aktif: true }],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      people: [{ id: '7', name: 'Kisi 7', code: 'K7', wcId: '1', stationId: null, skills: ['10'], active: true, machines: [] }],
      emirler: { orders: [emir('1', 'E-1'), emir('2', 'E-2')], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: {
      takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, [V]])) }, kisiVardiyasi: { 7: V } }, makineNotu: null, kisiGorevi: { 7: 'Operatör' },
      insanliIstasyonlar: ['10'],
    },
  },
});
// Makine ilk iki gün doludur: kişinin el tezgâhı boştur, motor serbest kalsa işi kişiye verirdi.
const dolu = { anahtar: 'E-9|10', makineId: 100, baslangic: '2026-10-19T05:00:00.000Z', bitis: '2026-10-20T13:00:00.000Z' };
const istek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'yeni', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [dolu], calisanlar: [], taslakId: 1, ...ek,
});

describe('plan motoru: makine kuyruğundaki iş kişi tezgâhına aday olmaz (2215)', () => {
  test('insanlı istasyondaki makineye bağlı adım makine kuyruğundaysa makinede kalır; kişi kuyruğundaki öteki emir kişiye yerleşir', async () => {
    const r = await coz(kaynak(), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }], kisiKuyruklari: [{ kisiId: 7, anahtarlar: ['E-2|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, [], JSON.stringify(r.nedenler));
    const m = r.yerlesimler.find((x) => x.anahtar === 'E-1|10');
    assert.equal(m?.makineId, 100, `makine kuyruğundaki iş: ${JSON.stringify(r.kisiYerlesimleri)}`);
    assert.ok(Date.parse(m.baslangic) >= Date.parse(dolu.bitis), 'makinenin dolu aralığından sonra');
    assert.equal((r.kisiYerlesimleri ?? []).some((x) => x.anahtar === 'E-1|10'), false);
    assert.equal((r.kisiYerlesimleri ?? []).find((x) => x.anahtar === 'E-2|10')?.kisiId, 7, 'aynı ürünün kişi kuyruğundaki adımı kişide kalır');
  });

  test('yalnız makine kuyruğu varken de iş kişiye kaymaz', async () => {
    const r = await coz(kaynak(), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-2|10'] }] }));
    assert.equal(r.kisiYerlesimleri, undefined, JSON.stringify(r.kisiYerlesimleri));
    assert.deepEqual(r.yerlesimler.map((x) => x.makineId), [100, 100]);
  });
});
