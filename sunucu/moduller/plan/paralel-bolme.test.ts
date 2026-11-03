import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 1952 iş 2a (1955 a, 1956 a, 1958 a): rotada "paralel böl" adımı planlama atölyesinde motorca paylara bölünür; paylar ayrı kaynaklarda
// aynı anda çalışır, ardıl hepsini bekler. İnsanlı istasyonda önce ekip. Veriler uydurmadır.
const makine = (id: string, istasyon: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: istasyon, status: 'aktif', aktif: true });
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const kisi = (id: string) => ({
  id, name: `Kisi ${id}`, code: null, role: null, stationId: null, wcId: '1', shiftId: null, skills: ['40'], cost: null, active: true, machines: [], maxMachines: null,
});
const adim = (seq: number, stationId: string, ek: Record<string, unknown> = {}) => ({
  id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId, setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [], split: 'tek', minLot: 0, ...ek,
});
type Ayar = { istasyon: '40' | '10'; split?: 'bol' | 'tek'; minLot?: number; adet?: number; ekip?: Record<string, string[]>; bolmeKip?: string };
const girdi = (a: Ayar) => {
  const steps = [adim(10, a.istasyon, { split: a.split ?? 'bol', minLot: a.minLot ?? 0 }), adim(20, '30')];
  const ROTA = {
    items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 }],
    routes: { 50: { base: null, steps } },
    routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
  };
  const kayit = {
    version: 7, savedAt: 9, items: ROTA.items, opdefs: [{ id: '13', name: 'Montaj' }], machines: [], routes: ROTA.routes,
    orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: a.adet ?? 8, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' }],
  };
  const kaynak = {
    durum: {
      ...ROTA,
      wcs: [{ id: '1', code: 'IM-1', name: 'Montaj', week: null, aktif: true }],
      stations: [istasyon('10'), istasyon('30'), istasyon('40')],
      machines: [makine('100', '10'), makine('101', '10'), makine('102', '10'), makine('300', '30')],
      people: [kisi('7'), kisi('8'), kisi('9')],
      cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    },
    ek: {
      takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: { 7: '3', 8: '3', 9: '3' } },
      makineNotu: null, kisiGorevi: null, insanliIstasyonlar: ['40'], ekipUyeleri: a.ekip ?? {},
    },
  };
  const calisma = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'edd' },
    param: { tampon: false, tamponZ: 0, acilPay: 0, ...(a.bolmeKip ? { bolmeKip: a.bolmeKip } : {}) }, kapali: ['personel'], olaylar: [], plan: null,
  };
  const g = planGirdisi({ calisma: calismayaMotorAyari(calisma, MOTOR_AYARI_VARSAYILAN), kayit, kaynak, bugun: '2026-10-19' });
  assert.ok(g);
  return g;
};
type Yer = { m: string; S: number; C: number };
const planla = (a: Ayar) => {
  const m = motorYukle();
  const st = girdi(a).st;
  const cx = m.compile(m.stHazirla(st)) as { ops: { id: string; adet: number; c: { m: string }[]; pr: [string, string][] }[] };
  const p = m.schedule(st, 'yeni', null) as { ops: Record<string, Yer> };
  return { cx, p, paylar: Object.keys(p.ops).filter((id) => id.startsWith('O1.10')).sort() };
};

describe('plan: paralel bölme planlama atölyesinde (1952 iş 2a)', () => {
  test('insanlı istasyonda adım vardiyalı kişilere eşit paylarla bölünür, paylar aynı anda başlar, ardıl hepsini bekler', () => {
    const { cx, p, paylar } = planla({ istasyon: '40', adet: 7 });
    assert.deepEqual(paylar, ['O1.10', 'O1.10~2', 'O1.10~3']);
    assert.deepEqual([...cx.ops.filter((o) => o.id.startsWith('O1.10')).map((o) => o.adet)], [3, 2, 2], 'kalan ilk paya');
    assert.deepEqual(new Set(paylar.map((id) => p.ops[id]!.m)), new Set(['kisi-7', 'kisi-8', 'kisi-9']));
    assert.equal(new Set(paylar.map((id) => p.ops[id]!.S)).size, 1);
    assert.deepEqual([...(cx.ops.find((o) => o.id === 'O1.20')?.pr ?? [])].map(([q]) => q).sort(), paylar);
    assert.ok(p.ops['O1.20']!.S >= Math.max(...paylar.map((id) => p.ops[id]!.C)) - 1e-9);
  });

  test('makineli istasyonda da aynı kural: paylar boş makinelere (1956 a)', () => {
    const { p, paylar } = planla({ istasyon: '10', adet: 9 });
    assert.equal(paylar.length, 3);
    assert.deepEqual(new Set(paylar.map((id) => p.ops[id]!.m)), new Set(['100', '101', '102']));
  });

  test('pay sayısı en küçük parçayla ve bölme sınırıyla sınırlıdır; tek pay bölme değildir', () => {
    assert.equal(planla({ istasyon: '40', adet: 8, minLot: 4 }).paylar.length, 2);
    assert.deepEqual(planla({ istasyon: '40', adet: 8, minLot: 5 }).paylar, ['O1.10']);
    assert.deepEqual(planla({ istasyon: '40', adet: 1 }).paylar, ['O1.10']);
  });

  test('reddedilen: rotada paralel böl yoksa ya da çalışmada bölme kapalıysa bölünmez', () => {
    assert.deepEqual(planla({ istasyon: '40', split: 'tek' }).paylar, ['O1.10']);
    assert.deepEqual(planla({ istasyon: '40', bolmeKip: 'kapali' }).paylar, ['O1.10']);
  });

  test('önce ekip (1955 a): ekipte iki üye varsa paylar yalnız onlara; tek üyede istasyonun bütün kişileri', () => {
    const e = planla({ istasyon: '40', adet: 9, ekip: { 40: ['8', '9'] } });
    assert.deepEqual(new Set(e.paylar.map((id) => e.p.ops[id]!.m)), new Set(['kisi-8', 'kisi-9']));
    const t = planla({ istasyon: '40', adet: 9, ekip: { 40: ['8'] } });
    assert.deepEqual(new Set(t.paylar.map((id) => t.p.ops[id]!.m)), new Set(['kisi-7', 'kisi-8', 'kisi-9']));
  });

  test('bölünmeyen adımın adayları ekipten etkilenmez', () => {
    const g = girdi({ istasyon: '40', split: 'tek', ekip: { 40: ['8', '9'] } });
    const rota = (g.S as { D: { urunler: { rota: { tezgahlar: { id: string }[] }[] }[] } }).D.urunler[0]!.rota[0]!;
    assert.deepEqual(rota.tezgahlar.map((t) => t.id), ['kisi-7', 'kisi-8', 'kisi-9']);
  });
});
