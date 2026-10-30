import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanMotoruIstegi } from './disari.ts';
import { coz } from './plan-cozucusu.ts';

// 1310 a: rotada ayarı işaretsiz adımın hazırlık süresi sayılır ama ayarcı aranmaz; işaretli (ve alanı olmayan eski) adım ayarcı bekler.
// Tek ayarcı, iki tezgâh, aynı anda başlamak isteyen iki hazırlıklı iş. Veriler uydurmadır. Tesis Europe/Istanbul: 05:00Z tesiste 08:00.
const V = '3';
const adim = (ek: Record<string, unknown>) => ({
  id: '50-o10', opNo: 10, seq: 10, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 30, proc: 10, chg: null, cycle: 10, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
  ...ek,
});
const emir = (id: string, no: string) => ({ id, no, itemId: '50', qty: 1, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const kaynak = (ek: Record<string, unknown>) => ({
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
      routes: { 50: { base: null, steps: [adim(ek)] } },
      routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 2, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      people: [{ id: '7', name: 'Deneme ayarci', code: 'A7', wcId: '1', stationId: '10', skills: ['10'], active: true }],
      emirler: { orders: [emir('1', 'E-1'), emir('2', 'E-2')], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: { takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, [V]])) }, kisiVardiyasi: { 7: V } }, makineNotu: null, kisiGorevi: { 7: 'Ayarcı' } },
  },
});
const istek: PlanMotoruIstegi = {
  kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), sabitler: [], calisanlar: [], taslakId: 1,
  kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }, { makineId: 101, anahtarlar: ['E-2|10'] }],
};
const baslangiclar = async (ek: Record<string, unknown>) => {
  const r = await coz(kaynak(ek), istek);
  assert.deepEqual(r.yerlesmeyen, []);
  return ['E-1|10', 'E-2|10'].map((a) => r.yerlesimler.find((y) => y.anahtar === a)!.baslangic).sort();
};

describe('plan: rota adımının ayar seçeneği (1310 a)', () => {
  test('ayarlı adım tek ayarcıyı bekler: ikinci iş birincinin hazırlığından sonra başlar', async () => {
    for (const ek of [{}, { ayarli: true }]) {
      const [a, b] = await baslangiclar(ek);
      assert.equal(a, '2026-10-19T05:00:00.000Z');
      assert.ok(Date.parse(b!) - Date.parse(a!) >= 30 * 60_000, `${String(a)} ${String(b)}`);
    }
  });

  test('ayarsız adımda ayarcı aranmaz: iki iş aynı anda başlar, hazırlık süresi yine sayılır', async () => {
    const r = await coz(kaynak({ ayarli: false }), istek);
    assert.deepEqual(r.yerlesmeyen, []);
    for (const a of ['E-1|10', 'E-2|10']) {
      const y = r.yerlesimler.find((x) => x.anahtar === a)!;
      assert.equal(y.baslangic, '2026-10-19T05:00:00.000Z');
      assert.ok(Date.parse(y.bitis) - Date.parse(y.baslangic) >= 40 * 60_000, `${a} ${y.baslangic}-${y.bitis}`);
    }
  });
});
