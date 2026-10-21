import { describe, expect, it } from 'vitest';
import { planlamaMotoru } from './planlama-derle.ts';

// 36 a: planın başlangıç günü kayınca (motor/girdi.betik baslangicKaydir) kayıtlı her saat aynı gerçek ana düşer; motor kayan çalışmadan
// aynı anlarla aynı planı kurar. Unutulan bir saat alanı sessizce gün kadar kayardı: kayan alanların listesi burada sabittir. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Op { id: string; m: string; S: number; C: number }
interface Motor {
  girdiKur: (calisma: Nesne, kayit: Nesne, kaynak: Nesne, bugun: string) => { S: Nesne } | null;
  stKur: (S: Nesne) => Nesne & { now: number };
  schedule: (st: Nesne, kip: string, taban: { ops: Record<string, Op> } | null) => { ops: Record<string, Op>; fail: string[] };
  baslangicKaydir: (S: Nesne, yeni: string) => number;
  baslangicTazele: (S: Nesne, an: number) => number;
}
const motor = new Function(`${planlamaMotoru()}\nreturn { girdiKur, stKur, schedule, baslangicKaydir, baslangicTazele };`)() as Motor;
const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const tezgah = (id: string, grup: string): Nesne => ({ id, ad: id, grup, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }, { id: '14', name: 'Taslama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10') }, { id: '101', code: 'S1', name: 'Taslama 1', stationId: '11', plan: tezgah('101', '11') }],
  routes: { 50: { base: null, steps: [
    { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
    { id: '50-o20', seq: 20, opNo: 20, opId: '14', stationId: '11', setup: 0, cycle: 20, alts: [], altTimes: {}, ins: [] },
  ] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 12, start: '2026-10-19', due: '2026-10-23', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 20, start: '2026-10-19', due: '2026-11-06', priority: 2, status: 'serbest' },
    { id: 'O3', no: 'E-3', itemId: '50', qty: 16, start: '2026-10-26', due: '2026-11-13', priority: 1, status: 'serbest' },
  ],
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [
      { id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true },
      { id: '11', code: 'TAS', name: 'Taslama', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true },
    ],
    machines: [
      { id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true },
      { id: '101', code: 'S1', name: 'Taslama 1', stationId: '11', status: 'aktif', aktif: true },
    ],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: ['2026-11-02'] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const CALISMA = {
  D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
};

// Pazartesi başlayan çalışma: taban plan kurulur, sonra gün 8'de (Salı) bir işlem başlamış, biri kilitli, Torna 1'de arıza ve fazla mesai var.
function calisma(): Nesne {
  const g = motor.girdiKur(kopya(CALISMA), kopya(KAYIT), kopya(KAYNAK), '2026-10-19');
  if (!g) throw new Error('çalışma kurulamadı');
  const S = g.S as Nesne & { simdi: number };
  const st = motor.stKur(S); st.now = 7;
  const p = motor.schedule(st, 'dagit', null);
  expect(p.fail).toEqual([]);
  const ops = kopya(p.ops);
  S['plan'] = { ops, J: { O1: { C: ops['O1.20']?.C, T: 0 } }, ozet: { Cmax: 200, wT: 3 }, lbC: { O1: 50 } };
  S['gercek'] = { 'O1.10': { m: '100', S: ops['O1.10']?.S, C: ops['O1.10']?.C } };
  S['locks'] = { 'O3.10': { m: '100', S: 15 * 24 + 8 } };
  S['down'] = [{ m: '100', from: 9 * 24 + 8, to: 9 * 24 + 12 }, { m: '101', from: 1 * 24 + 8, to: 1 * 24 + 10 }];
  S['ekMesai'] = [{ m: '100', gun: 12, vardiya: '3' }, { m: '101', gun: 2, vardiya: '3' }];
  S['simdi'] = 8 * 24 + 10;
  return S;
}
const planla = (S: Nesne): Record<string, Op> => {
  const st = motor.stKur(S); st.now = Math.max(st.now, Number(S['simdi']));
  return motor.schedule(st, 'dagit', S['plan'] as { ops: Record<string, Op> }).ops;
};

describe('başlangıç günü kaydırma (36 a)', () => {
  it('kayan çalışmadan motor aynı planı aynı gerçek anlarla kurar; tatil ve termin metinleri kaymaz', () => {
    const S0 = calisma();
    const S1 = kopya(S0);
    // Salı: kayma yedinin katı değil, haftanın günleri başlangıçtan yeniden hesaplanır
    expect(motor.baslangicKaydir(S1, '2026-10-28')).toBe(9);
    expect((S1['D'] as { meta: { baslangic: string } }).meta.baslangic).toBe('2026-10-28');
    expect((S1['D'] as { tatiller: string[] }).tatiller).toEqual((S0['D'] as { tatiller: string[] }).tatiller);
    expect((S1['D'] as { siparisler: unknown[] }).siparisler).toEqual((S0['D'] as { siparisler: unknown[] }).siparisler);
    const p0 = planla(S0), p1 = planla(S1);
    expect(Object.keys(p1).sort()).toEqual(Object.keys(p0).sort());
    for (const id in p0) {
      expect(p1[id]?.m, id).toBe(p0[id]?.m);
      expect((p1[id]?.S ?? NaN) + 9 * 24, id).toBeCloseTo(p0[id]?.S ?? NaN, 6);
      expect((p1[id]?.C ?? NaN) + 9 * 24, id).toBeCloseTo(p0[id]?.C ?? NaN, 6);
    }
  });

  it('kayan alanlar: plan, gerçekleşen, kilit, arıza, fazla mesai, olaylar, senaryo, nabız, sevk izi, geçmiş; yeni günden önce biten arıza ve mesai düşer', () => {
    const S: Nesne = {
      D: { meta: { baslangic: '2026-10-19' }, tatiller: ['2026-11-02'], siparisler: [{ id: 'O1', termin: '2026-10-30', serbest: 30 }, { id: 'O2', termin: 400, serbest: null }], satinalma: [{ kod: 'H1', gelis: 100 }, { kod: 'H2', gelis: '2026-10-25' }] },
      plan: { ops: { a: { S: 200, Su: 201, C: 210, lot1: 202, su: 1, run: 9, sl: 4 } }, J: { O1: { C: 210, T: 5 } }, ozet: { Cmax: 210, wT: 5 }, oncekiOzet: { Cmax: 190, wT: 7 }, lbC: { O1: 180 }, util: { 100: { busy: 10, open: 20, u: 0.5 } }, lb: 3, dataVer: 4 },
      gercek: { a: { m: '100', S: 200, C: null, sayim: 205, kalan: 30 } },
      locks: { a: { m: '100', S: 200 } },
      down: [{ m: '100', from: 100, to: 170 }, { m: '100', from: 300, to: 310 }],
      ekMesai: [{ m: '100', gun: 5, vardiya: '3' }, { m: '100', gun: 6, vardiya: '3' }, { m: '100', gun: 20, vardiya: '3' }],
      olaylar: [{ tip: 'ariza', m: '100', bas: 250, saat: 8 }, { tip: 'ariza', m: '100', bas: '2026-11-01 08:00', saat: 4 }, { tip: 'acil', urun: '50', adet: 2, termin: 500 },
        { tip: 'eksik', gun: 12, vardiya: '3', grup: '10', n: 1 }, { tip: 'mesai', m: '100', gun: 14, vardiya: '3' }, { tip: 'malzeme', kod: 'H1', gun: 3 }, { tip: 'fason', f: '7', gun: 2 }],
      senaryolar: [{ id: 's1', D: { meta: { baslangic: '2026-10-12' } }, down: [], ekMesai: [], locks: { a: { m: '100', S: 400 } }, plan: { ops: { a: { S: 400, Su: 401, C: 410, lot1: 402 } } }, J: { O1: { C: 410, T: 0 } }, ozet: { Cmax: 410 } }],
      nbSabit: { o: { cmax: 210, wT: 5 }, ops: { a: ['100', 200] }, J: { O1: [210, 5] } },
      nabiz: [{ t: 1, o: { cmax: 210 }, ops: { a: ['100', 200] }, J: { O1: [210, 5] } }, { t: 2, o: { cmax: 220 } }],
      sevkIz: { O1: [{ C: 210, due: 250, t: 1 }] },
      paGecmis: [{ ozet: { Cmax: 210, wT: 5 } }],
      devirler: [{ t: 1, ozet: { wT: 5, late: 1 } }],
      bedel: { dataVer: 4, temel: 5 }, hsSinir: { cp: 3, best: 3 },
      simdi: 175,
    };
    const once = kopya(S);
    expect(motor.baslangicKaydir(S, '2026-10-26')).toBe(7);
    const h = 7 * 24;
    // kayan her sayı yolu ve beklenen farkı; listede olmayan hiçbir değer değişmez
    const yaprak = (x: unknown, yol: string, l: Map<string, unknown>): Map<string, unknown> => {
      if (x !== null && typeof x === 'object') for (const [k, v] of Object.entries(x)) yaprak(v, `${yol}.${k}`, l); else l.set(yol, x);
      return l;
    };
    const a = yaprak(once, '', new Map()), b = yaprak(S, '', new Map());
    // fazla mesai dizisi kısalır, sırası kayar: ayrıca bakılır
    const degisen = [...b.keys()].filter((k) => !k.startsWith('.ekMesai.') && a.get(k) !== b.get(k)).map((k) => `${k} ${String(a.get(k))}->${String(b.get(k))}`);
    const dusen = [...a.keys()].filter((k) => !k.startsWith('.ekMesai.') && !b.has(k));
    const kay = (yol: string, x: number, f = h): string => `${yol} ${String(x)}->${String(x - f)}`;
    expect(degisen.sort()).toEqual([
      '.D.meta.baslangic 2026-10-19->2026-10-26',
      kay('.D.siparisler.0.serbest', 30), kay('.D.siparisler.1.termin', 400), kay('.D.satinalma.0.gelis', 100),
      kay('.plan.ops.a.S', 200), kay('.plan.ops.a.Su', 201), kay('.plan.ops.a.C', 210), kay('.plan.ops.a.lot1', 202),
      kay('.plan.J.O1.C', 210), kay('.plan.ozet.Cmax', 210), kay('.plan.oncekiOzet.Cmax', 190), kay('.plan.lbC.O1', 180),
      kay('.gercek.a.S', 200), kay('.gercek.a.sayim', 205), kay('.locks.a.S', 200),
      // ilk arıza yeni günün 02:00'sine kadar sürer, kalır
      kay('.down.0.from', 100), kay('.down.0.to', 170), kay('.down.1.from', 300), kay('.down.1.to', 310),
      kay('.olaylar.0.bas', 250), kay('.olaylar.2.termin', 500), kay('.olaylar.3.gun', 12, 7), kay('.olaylar.4.gun', 14, 7),
      // senaryo kendi başlangıcından kayar: 2026-10-12'den 14 gün
      '.senaryolar.0.D.meta.baslangic 2026-10-12->2026-10-26',
      kay('.senaryolar.0.locks.a.S', 400, 14 * 24), kay('.senaryolar.0.plan.ops.a.S', 400, 14 * 24), kay('.senaryolar.0.plan.ops.a.Su', 401, 14 * 24),
      kay('.senaryolar.0.plan.ops.a.C', 410, 14 * 24), kay('.senaryolar.0.plan.ops.a.lot1', 402, 14 * 24), kay('.senaryolar.0.J.O1.C', 410, 14 * 24), kay('.senaryolar.0.ozet.Cmax', 410, 14 * 24),
      kay('.nbSabit.o.cmax', 210), kay('.nbSabit.ops.a.1', 200), kay('.nbSabit.J.O1.0', 210),
      kay('.nabiz.0.o.cmax', 210), kay('.nabiz.0.ops.a.1', 200), kay('.nabiz.0.J.O1.0', 210), kay('.nabiz.1.o.cmax', 220),
      kay('.sevkIz.O1.0.C', 210), kay('.sevkIz.O1.0.due', 250), kay('.paGecmis.0.ozet.Cmax', 210),
      kay('.simdi', 175),
    ].sort());
    expect(dusen).toEqual([]);
    // gün 5 mesaisi (yeni gün -2) düşer; gün 6 (yeni gün -1) gece vardiyası yeni güne taşabileceği için kalır
    expect(S['ekMesai']).toEqual([{ m: '100', gun: -1, vardiya: '3' }, { m: '100', gun: 13, vardiya: '3' }]);
  });

  it('yeni gün ileride değilse hiçbir şey değişmez; tazeleme yalnız yedi gün ve sonrasında kaydırır', () => {
    const S = calisma(); const once = kopya(S);
    expect(motor.baslangicKaydir(S, '2026-10-19')).toBe(0);
    expect(motor.baslangicKaydir(S, '2026-10-12')).toBe(0);
    expect(S).toEqual(once);
    expect(motor.baslangicTazele(S, new Date(2026, 9, 25, 10).getTime())).toBe(0);
    expect(S).toEqual(once);
    expect(motor.baslangicTazele(S, new Date(2026, 9, 26, 6).getTime())).toBe(7);
    expect((S['D'] as { meta: { baslangic: string } }).meta.baslangic).toBe('2026-10-26');
  });
});
