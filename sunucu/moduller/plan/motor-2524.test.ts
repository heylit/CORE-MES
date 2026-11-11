import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { motorKodu } from './plan-motoru.ts';

// 2524-1: planlamada elle bölme ve payları birleştirme (2524 b), motor tarafı. Veriler uydurmadır: üç tezgâh, gündüz vardiyası.
type Kayit = Record<string, unknown>;
type Yer = Kayit & { m: string; S: number; C: number; adet?: number };
interface Plan { ops: Record<string, Yer>; fail: string[] }
interface Ic {
  W0: Kayit;
  stHazirla: (st: unknown) => Kayit;
  schedule: (st: unknown, kip: string, taban: unknown, opt?: unknown) => Plan;
  lnsDecode: (st: unknown, taban: unknown, hamle: unknown[], cx: unknown, serbest: boolean) => Plan;
  compile: (st: unknown) => { byId: Record<string, { adet: number; c: { m: string }[] }> };
  evaluate: (plan: Plan, st: unknown, ref: unknown, hizli?: boolean) => { warn: { t: string; id?: string; txt: string }[] };
}
function motor(): Ic {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return vm.runInContext('({ W0, stHazirla, schedule, lnsDecode, compile, evaluate })', b) as Ic;
}
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const TEZ = ['T1', 'T2', 'T3'];
function durum(m: Ic, ek: Kayit = {}, adimEk: Kayit = {}, w: Kayit = {}) {
  return m.stHazirla({
    D: {
      meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
      calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tezgahlar: TEZ.map((id) => ({ id, grup: 'G' })),
      personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], ayar: true }, { id: 'P2', vardiya: 'V1', gruplar: ['G'] }, { id: 'P3', vardiya: 'V1', gruplar: ['G'] }],
      malzemeler: [],
      urunler: [{ id: 'U', rota: [{ k: '10', ad: 'OP 10', tezgahlar: TEZ.map((id) => ({ id, cevrim: 6, ayar: 0 })), ...adimEk }, { k: '20', ad: 'OP 20', bag: [['10', 'b']], tezgahlar: [{ id: 'T1', cevrim: 6, ayar: 0 }] }] }],
      siparisler: [{ id: 'S1', urun: 'U', adet: 30, termin: '2026-01-09 16:00' }],
    },
    now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, ...ek,
    w: { ...m.W0, tampon: false, ...w },
  });
}
const adetler = (m: Ic, st: Kayit, id: string) => Object.fromEntries(Object.entries(m.compile(st).byId).filter(([k]) => k === id || k.startsWith(id + '~'))
  .map(([k, o]) => [k, [o.adet, o.c.map((c) => c.m).join(',')]]));

describe('2524-1: elle bölme', () => {
  test('bölme ayarı kapalı ve rota tek makinedeyken de adım elle verilen pay, adet ve tezgâhla bölünür', () => {
    const m = motor();
    const st = durum(m, { elleBol: { 'S1.10': [{ adet: 20, m: 'T2' }, { adet: 10, m: 'T3' }] } }, {}, { bol: false });
    assert.deepEqual(adetler(m, st, 'S1.10'), { 'S1.10': [20, 'T2'], 'S1.10~2': [10, 'T3'] });
    const p = m.schedule(st, 'yeni', null);
    assert.equal(p.fail.length, 0);
    assert.deepEqual([p.ops['S1.10']!.m, p.ops['S1.10~2']!.m], ['T2', 'T3']);
    assert.ok(p.ops['S1.20']!.S >= Math.max(p.ops['S1.10']!.C, p.ops['S1.10~2']!.C) - 1e-6, 'ardıl iki payı da bekler');
  });

  test('uygula (sabit kip, başvuru planı bölmesizken) elle bölmeyi korur', () => {
    const m = motor();
    const ilk = m.schedule(durum(m), 'yeni', null);
    assert.equal(ilk.ops['S1.10~2'], undefined);
    const st = durum(m, { elleBol: { 'S1.10': [{ adet: 15, m: 'T1' }, { adet: 15, m: 'T3' }] } }, {}, { dondurma: 0 });
    const p = m.lnsDecode(st, { ops: ilk.ops, fail: [] }, [], m.compile(st), false);
    assert.equal(p.fail.length, 0);
    assert.deepEqual([p.ops['S1.10']!.m, p.ops['S1.10~2']!.m], ['T1', 'T3']);
  });

  test('tek eleman elle birleştirmedir: rota paralel bölse de tek iş, seçilen tezgâhta', () => {
    const m = motor();
    const bolen = durum(m, {}, { bol: true }, { bol: true, bolMaks: 3 });
    assert.ok(Object.keys(adetler(m, bolen, 'S1.10')).length > 1, 'motor kendisi bölüyor');
    const st = durum(m, { elleBol: { 'S1.10': [{ adet: 30, m: 'T3' }] } }, { bol: true }, { bol: true, bolMaks: 3 });
    assert.deepEqual(adetler(m, st, 'S1.10'), { 'S1.10': [30, 'T3'] });
  });

  test('kilitli adım elle bölünmez, uyarılır; aday olmayan tezgâh ve aynı tezgâhta iki pay da reddedilir', () => {
    const m = motor();
    for (const [ek, parca] of [
      [{ locks: { 'S1.10': { m: 'T1', S: 8 } }, elleBol: { 'S1.10': [{ adet: 15, m: 'T1' }, { adet: 15, m: 'T2' }] } }, 'kilitli'],
      [{ elleBol: { 'S1.10': [{ adet: 15, m: 'T1' }, { adet: 15, m: 'T9' }] } }, 'adayı değil'],
      [{ elleBol: { 'S1.10': [{ adet: 15, m: 'T1' }, { adet: 15, m: 'T1' }] } }, 'aynı tezgâhta'],
    ] as const) {
      const st = durum(m, ek);
      assert.deepEqual(Object.keys(adetler(m, st, 'S1.10')), ['S1.10']);
      const p = m.schedule(st, 'yeni', null);
      const w = m.evaluate(p, st, null, false).warn.filter((x) => x.t === 'bol');
      assert.ok(w.some((x) => x.id === 'S1.10' && x.txt.includes(parca)), JSON.stringify(w));
    }
  });

  test('adım adedi değiştiyse paylar orana göre yeniden dağıtılır ve uyarılır', () => {
    const m = motor();
    const st = durum(m, { elleBol: { 'S1.10': [{ adet: 20, m: 'T1' }, { adet: 10, m: 'T2' }] } });
    (st['D'] as { opAdet?: Kayit }).opAdet = { 'S1.10': 27 };
    assert.deepEqual(adetler(m, st, 'S1.10'), { 'S1.10': [18, 'T1'], 'S1.10~2': [9, 'T2'] });
    const p = m.schedule(st, 'yeni', null);
    assert.ok(m.evaluate(p, st, null, false).warn.some((x) => x.t === 'bol' && x.txt.includes('18 + 9')));
  });
});

describe('2524-1: motorun kendi bölmesi (B-2482-7)', () => {
  test('hızlı tezgâh iki payı da alırsa ikinci pay ayar almaz (aynı bağlamanın devamı)', () => {
    const m = motor();
    const st = durum(m, {}, { bol: true, tezgahlar: [{ id: 'T1', cevrim: 1, ayar: 60 }, { id: 'T2', cevrim: 60, ayar: 60 }] }, { bol: true, bolMaks: 2 });
    const p = m.schedule(st, 'yeni', null);
    const a = p.ops['S1.10']!, b = p.ops['S1.10~2']!;
    assert.deepEqual([a.m, b.m], ['T1', 'T1']);
    assert.equal(b['su'], 0);
    assert.ok(Math.abs(b.C - a.C - 15 / 60) < 1e-6, JSON.stringify([a, b]));
  });

  test('farklı tezgâha düşen pay ayarını alır', () => {
    const m = motor();
    const st = durum(m, {}, { bol: true, tezgahlar: [{ id: 'T1', cevrim: 6, ayar: 60 }, { id: 'T2', cevrim: 6, ayar: 60 }] }, { bol: true, bolMaks: 2 });
    const p = m.schedule(st, 'yeni', null);
    assert.notEqual(p.ops['S1.10']!.m, p.ops['S1.10~2']!.m);
    assert.ok(Number(p.ops['S1.10~2']!['su']) > 0);
  });
});
