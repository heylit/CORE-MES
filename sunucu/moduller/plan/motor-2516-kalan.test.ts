import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlanMotoruIstegi } from './disari.ts';
import { coz } from './plan-cozucusu.ts';

// 2516 (Test #1552): sağlam adedi emri karşılamış çalışan adım sıfır süreyle yerleşmez. Veriler uydurmadır (plan-cozucusu.test.ts kalıbı).
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
const istek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [], calisanlar: [], taslakId: 1, ...ek,
});
const yer = (r: Awaited<ReturnType<typeof coz>>, a: string) => r.yerlesimler.find((y) => y.anahtar === a);

test('kalanı 0 olan çalışan adım kuyruğa sıfır süreyle girmez, şimdi bitmiş sayılır; ardılı onu beklemez, öteki işler sürer', async () => {
  const k = { ...KAYNAK, kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum,
    calisanAdimlar: [{ anahtar: 'E-1|10', makineId: '100', baslangic: '2026-10-19T04:30:00.000Z', sayimAni: '2026-10-19T05:00:00.000Z', kalanVerimliDk: 30, saglam: 2, adet: 2 }] } } };
  const r = await coz(k, istek({
    kuyruklar: [{ makineId: 100, anahtarlar: ['E-2|10', 'E-1|10', 'E-1|20'] }],
    calisanlar: [{ anahtar: 'E-1|10', makineId: 100, baslangic: '2026-10-19T04:30:00.000Z', sayimAni: '2026-10-19T05:00:00.000Z', kalanDk: 30, kalanVerimliDk: 30 }],
  }));
  for (const y of r.yerlesimler) assert.ok(Date.parse(y.bitis) > Date.parse(y.baslangic), JSON.stringify(y));
  assert.equal(yer(r, 'E-1|10'), undefined);
  assert.ok(!r.yerlesmeyen.includes('E-1|10'));
  assert.equal(yer(r, 'E-2|10')!.baslangic, '2026-10-19T05:00:00.000Z');
  assert.equal(yer(r, 'E-1|20')!.baslangic, yer(r, 'E-2|10')!.bitis, 'ardıl tezgâh sırasıyla, kapanmamış öncülü beklemeden');
});
