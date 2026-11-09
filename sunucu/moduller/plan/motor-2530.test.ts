import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cozumGirdisi } from './plan-girdisi.ts';
import { planCoz } from './plan-motoru.ts';
import { coz as sunucuCoz } from './plan-cozucusu.ts';

// B-2482-11 (2530): kuyrukta olmayan ek adım sunucunun verdiği aday tezgâhlarından birine yerleşir; aday yoksa motor onu tanımaz.
// Veriler uydurmadır (plan-cozucusu.test.ts kalıbı).
const V = '3';
const adim = (opNo: number, dk: number) => ({
  id: `50-o${String(opNo)}`, opNo, seq: opNo, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: dk, chg: null, cycle: dk, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
});
const emir = (id: string, no: string) => ({ id, no, itemId: '50', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const KAYNAK = {
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  // Kayıtta bağlanmadan önceki yerel emir kalır (kart #1185); çözücü onu değil sunucunun emirlerini planlar.
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [{ id: 'O1', no: 'YEREL-1', itemId: '50', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
      routes: { 50: { base: null, steps: [adim(10, 30), adim(20, 15)] } },
      routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 2, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      emirler: { orders: [emir('1', 'E-1'), emir('2', 'E-2')], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: null,
  },
};
type Plan = { ops: Record<string, { m: string; S: number; C: number }> };
async function coz(ek: Record<string, unknown>, kip: 'yeni' | 'sabit' = 'yeni'): Promise<Plan> {
  const g = cozumGirdisi({
    calisma: KAYNAK.calisma, kayit: KAYNAK.kayit, kaynak: KAYNAK.kaynak,
    istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|20'] }], sabitler: [], calisanlar: [], ekAdimlar: [ek] } as never,
  });
  assert.ok(g);
  return (await planCoz({ durum: g.st, kip, taban: g.taban })) as unknown as Plan;
}
const EK = { anahtar: 'E-1|11', ad: 'Rework', oncul: 'E-1|10', ardil: 'E-1|20', ayarDk: 0, birimDk: 5, adet: 2 };

test('kuyruksuz ek adım aday tezgâhların birine yerleşir, öncülünü bekler, ardılı onu bekler (sunucunun tabanıyla, iki kipte)', async () => {
  for (const kip of ['yeni', 'sabit'] as const) {
    const p = await coz({ ...EK, adaylar: [{ makineId: '101', ayarDk: 0, birimDk: 5 }] }, kip);
    const on = p.ops['1.10']!, e = p.ops['1.e11']!, ar = p.ops['1.20']!;
    assert.ok(e, JSON.stringify(Object.keys(p.ops)));
    assert.equal(e.m, '101');
    assert.ok(Math.abs(e.C - e.S - 10 / 60) < 1e-6, 'ayar 0 + 2 adet x 5 dk');
    assert.ok(e.S >= on.C - 1e-6 && ar.S >= e.C - 1e-6);
  }
});

test('sunucu çözücüsü aday tezgâhlı ek adımın yerini yazar', async () => {
  const r = await sunucuCoz(KAYNAK, { kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|20'] }],
    sabitler: [], calisanlar: [], taslakId: 1, ekAdimlar: [{ ...EK, adaylar: [{ makineId: '101', ayarDk: 0, birimDk: 5 }] }] } as never);
  const y = r.yerlesimler.find((x) => x.anahtar === 'E-1|11');
  assert.ok(y, JSON.stringify(r));
  assert.equal(y.makineId, 101);
  assert.equal((Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000, 10);
  assert.deepEqual(r.yerlesmeyen, []);
});

test('aday yoksa (ya da boş liste) ek adım eklenmez; ardılı rotadaki öncülüyle kalır', async () => {
  for (const ek of [EK, { ...EK, adaylar: [] }]) {
    const p = await coz(ek);
    assert.equal(p.ops['1.e11'], undefined);
    assert.ok(p.ops['1.20']!.S >= p.ops['1.10']!.C - 1e-6);
  }
});

test('motorda olmayan aday atlanır: [pasif, T2] ise T2; yalnız pasifse yerleşmez ve ardılı bekler (bitmiş sayılmaz)', async () => {
  const p = await coz({ ...EK, adaylar: [{ makineId: '999', ayarDk: 0, birimDk: 5 }, { makineId: '101', ayarDk: 0, birimDk: 5 }] }, 'sabit');
  assert.equal(p.ops['1.e11']?.m, '101');
  const istekPasif = { kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|20'] }],
    sabitler: [], calisanlar: [], taslakId: 1, ekAdimlar: [{ ...EK, adaylar: [{ makineId: '999', ayarDk: 0, birimDk: 5 }] }] };
  const r = await sunucuCoz(KAYNAK, istekPasif as never);
  assert.ok(r.yerlesmeyen.includes('E-1|11'), JSON.stringify(r.yerlesmeyen));
  assert.equal(r.yerlesimler.find((x) => x.anahtar === 'E-1|11'), undefined);
  assert.equal(r.yerlesimler.find((x) => x.anahtar === 'E-1|20'), undefined, 'ardıl ek adımı bekler');
});
