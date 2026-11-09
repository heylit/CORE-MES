import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { motorKodu } from './plan-motoru.ts';

// 2516-2: bekleyen değişikliği uygula (B-2499-7, B-2483-72). Veriler uydurmadır: iki tezgâh, gündüz vardiyası, üç adımlı tek ürün.
type Kayit = Record<string, unknown>;
type Yer = Kayit & { m: string; S: number; C: number; pin?: number; done?: number; act?: number };
interface Plan { ops: Record<string, Yer>; fail: string[]; failNeden: Record<string, { kod: string; oncul?: string }> }
interface Ic {
  W0: Kayit;
  stHazirla: (st: unknown) => Kayit;
  schedule: (st: unknown, kip: string, taban: unknown) => Plan;
  lnsDecode: (st: unknown, taban: unknown, hamle: unknown[], cx: unknown, serbest: boolean) => Plan;
  compile: (st: unknown) => unknown;
  evaluate: (plan: Plan, st: unknown, ref: unknown, hizli?: boolean) => { warn: { t: string; id?: string; txt: string }[] };
  kisiTezgahIsleriOf: (plan: unknown) => string[];
}
function motor(): Ic {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return vm.runInContext('({ W0, stHazirla, schedule, lnsDecode, compile, evaluate, kisiTezgahIsleriOf })', b) as Ic;
}
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const adim = (k: string, tezgahlar: string[], bag?: string) => ({ k, ad: 'OP ' + k, ...(bag ? { bag: [[bag, 'b']] } : {}), tezgahlar: tezgahlar.map((id) => ({ id, cevrim: 60, ayar: 0 })) });
function durum(m: Ic, ek: Kayit = {}, rota = [adim('10', ['T1']), adim('20', ['T2'], '10'), adim('30', ['T1'], '20')]) {
  return m.stHazirla({
    D: {
      meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
      calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }],
      personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], ayar: true }, { id: 'P2', vardiya: 'V1', gruplar: ['G'] }], malzemeler: [],
      urunler: [{ id: 'U', rota }], siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: '2026-01-09 16:00' }],
    },
    now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, ...ek, w: { ...m.W0, tampon: false },
  });
}
const yerler = (p: Plan) => Object.fromEntries(Object.entries(p.ops).map(([k, r]) => [k, [r.m, r.S, r.C]]));

describe('2516-2: uygula başlamış emrin işini düşürmez (B-2499-7)', () => {
  test('ilk adım geç başlayınca ardılları eski saatlerinde bitti sayılmaz, sırayla yeniden dizilir', () => {
    const m = motor();
    const ilk = m.schedule(durum(m), 'yeni', null);
    assert.deepEqual(yerler(ilk), { 'S1.10': ['T1', 8, 10], 'S1.20': ['T2', 10, 12], 'S1.30': ['T1', 12, 14] });
    // saat 13: ilk adım plandaki 8 yerine 12'de başladı; ikinci adımın eski bitişi (12) şimdiden önce kalıyor
    const st = durum(m, { now: 13, gercek: { 'S1.10': { m: 'T1', S: 12 } } });
    const p = m.lnsDecode(st, { ops: ilk.ops, fail: [] }, [], m.compile(st), false);
    assert.equal(p.fail.length, 0);
    assert.equal(p.ops['S1.20']!.done, undefined);
    assert.ok(p.ops['S1.20']!.S >= p.ops['S1.10']!.C - 1e-6, 'ikinci adım ilk adım bitmeden başlamaz');
    assert.ok(p.ops['S1.30']!.S >= p.ops['S1.20']!.C - 1e-6, 'üçüncü adım ikinci adım bitmeden başlamaz');
    assert.ok(p.ops['S1.30']!.S >= p.ops['S1.10']!.C - 1e-6, 'üçüncü adım T1 üzerinde başlamış işle çakışmaz');
  });

  test('öncülü zamanında biten iş eski yerinde kalır (gereksiz yeniden dizme yok)', () => {
    const m = motor();
    const ilk = m.schedule(durum(m), 'yeni', null);
    const st = durum(m, { now: 13, gercek: { 'S1.10': { m: 'T1', S: 8, C: 10 } } });
    const p = m.lnsDecode(st, { ops: ilk.ops, fail: [] }, [], m.compile(st), false);
    assert.deepEqual([p.ops['S1.20']!.S, p.ops['S1.20']!.C, p.ops['S1.20']!.done], [10, 12, 1]);
  });
});

describe('2516-2: sabit kipte yer yoksa dağıta düşer, düşen işin nedeni yazılır (B-2483-72)', () => {
  test('tabandaki tezgâh artık aday değilse iş düşmez, diğer adaya yerleşir', () => {
    const m = motor();
    const ilk = m.schedule(durum(m, {}, [adim('10', ['T1'])]), 'yeni', null);
    assert.equal(ilk.ops['S1.10']!.m, 'T1');
    const st = durum(m, {}, [adim('10', ['T2'])]);
    (st['w'] as Kayit)['dondurma'] = 0;
    const p = m.schedule(st, 'sabit', ilk);
    assert.equal(p.fail.length, 0);
    assert.equal(p.ops['S1.10']!.m, 'T2');
  });

  test('kilit tezgâhı aday değilse neden aday, ardılı öncül nedeniyle düşer; uyarı nedeni söyler', () => {
    const m = motor();
    const st = durum(m, { locks: { 'S1.10': { m: 'T2', S: 8 } } });
    const p = m.schedule(st, 'yeni', null);
    assert.deepEqual({ ...p.failNeden['S1.10'] }, { kod: 'aday' });
    assert.deepEqual({ ...p.failNeden['S1.20'] }, { kod: 'oncul', oncul: 'S1.10' });
    const w = m.evaluate(p, st, null, false).warn.filter((x) => x.t === 'plan');
    assert.ok(w.some((x) => x.id === 'S1.10' && x.txt.includes('tezgâh ya da fasoncu yok')));
    assert.ok(w.some((x) => x.id === 'S1.20' && x.txt.includes('öncülü S1.10 yerleşmedi')));
  });
});

describe('2516-2: kişi tezgâhındaki iş özette ayrı (B-2500-2)', () => {
  test('kişi tezgâhına yerleşen iş sayılır, makine ve fason işi sayılmaz', () => {
    const m = motor();
    const l = m.kisiTezgahIsleriOf({ ops: { 'S1.20': { id: 'S1.20', m: 'kisi-4' }, 'S1.10': { id: 'S1.10', m: '100' }, 'S1.30': { id: 'S1.30', m: '@9', fas: 1 }, 'S2.10': { id: 'S2.10', m: 'kisi-5' } } });
    assert.deepEqual([...l], ['S1.20', 'S2.10']);
    assert.equal(m.kisiTezgahIsleriOf(null).length, 0);
  });
});
