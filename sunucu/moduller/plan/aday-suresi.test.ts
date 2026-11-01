import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 1737 c: rotada işlem süresi boş aday tezgâh motora girmez (boş süre 0 okunup işi sıfır sürede bitiriyordu). Veriler uydurmadır.
const makine = (id: string, istasyon: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: istasyon, plan: { id, ad: id, grup: istasyon, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 } });
const kayit = (bosAday: { setup: number | null; cycle: number | null }) => ({
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [makine('100', '10'), makine('200', '20'), makine('300', '30')],
  routes: { 50: { base: null, steps: [{
    id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: ['20', '30'],
    altTimes: { 20: bosAday, 30: { setup: 5, cycle: 60 } }, ins: [],
  }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 20, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' }],
});
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [istasyon('10'), istasyon('20'), istasyon('30')],
    machines: ['100', '200', '300'].map((id) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: String(Number(id) / 10), status: 'aktif', aktif: true })),
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const calismaKur = (): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'kar' },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const girdi = (calisma: unknown, bosAday: { setup: number | null; cycle: number | null }) => {
  const g = planGirdisi({ calisma: calismayaMotorAyari(calisma, MOTOR_AYARI_VARSAYILAN), kayit: kayit(bosAday), kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  return g;
};
const tezgahlar = (S: unknown) => [...((S as { D: { urunler: { rota: { tezgahlar: { id: string; cevrim: number }[] }[] }[] } }).D.urunler[0]!.rota[0]!.tezgahlar)]
  .map((t) => [String(t.id), Number(t.cevrim)]);

describe('plan: süresi boş aday tezgâh (1737 c)', () => {
  test('işlem süresi boş aday motora girmez; süresi olan aday girer; ayar süresi boşsa 0', () => {
    const g = girdi(calismaKur(), { setup: null, cycle: null });
    assert.deepEqual(tezgahlar(g.S), [['100', 30], ['300', 60]]);
    const m = motorYukle();
    const cx = m.compile(m.stHazirla(g.st)) as { ops: { c: { m: string }[] }[] };
    assert.deepEqual([...cx.ops].map((o) => [...o.c].map((c) => c.m).sort()), [['100', '300']]);
    assert.deepEqual(tezgahlar(girdi(calismaKur(), { setup: null, cycle: 45 }).S), [['100', 30], ['200', 45], ['300', 60]]);
  });

  test('kayıtta önceden 0 süreyle duran aday, süre boşaldıysa düşer; süre girilince geri gelir', () => {
    const ilk = girdi(calismaKur(), { setup: 0, cycle: 45 });
    assert.deepEqual(tezgahlar(ilk.S), [['100', 30], ['200', 45], ['300', 60]]);
    const bosaldi = girdi(ilk.S, { setup: 0, cycle: null });
    assert.deepEqual(tezgahlar(bosaldi.S), [['100', 30], ['300', 60]]);
    assert.deepEqual(tezgahlar(girdi(bosaldi.S, { setup: 0, cycle: 50 }).S), [['100', 30], ['200', 50], ['300', 60]]);
  });
});
