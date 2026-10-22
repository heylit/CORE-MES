import { describe, expect, it } from 'vitest';
import { planlamaMotoru } from './planlama-derle.ts';

// 35 b: bölünen siparişin parçaları (zz2, zz4, zz11, t-tekyer) siparişin adet payını taşır; motor gecikmeyi ve cezayı o payla sayar, aynı
// yerde biten iki parça siparişi bir kez sayar. Gecikme bedelinde (motor/durum.betik agBedel) siparişe ait bileşenler de payla sayılır.
// Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Op { id: string; job: string; m: string; S: number; C: number }
interface Ev { wT: number; J: Record<string, { T: number | null; p: number | null }> }
interface Motor {
  girdiKur: (calisma: Nesne, kayit: Nesne, kaynak: Nesne, bugun: string) => { S: Nesne } | null;
  stKur: (S: Nesne) => Nesne & { D: { siparisler: Array<Nesne & { id: string }> }; now: number };
  schedule: (st: Nesne, kip: string, taban: null) => { ops: Record<string, Op>; fail: string[] };
  evaluate: (p: { ops: Record<string, Op> }, st: Nesne, ref: null, fast: boolean) => Ev;
  lowerBound: (st: Nesne) => { C: Record<string, number>; wT: number };
  siparisParcasi: (s: Nesne, id: string, n: number) => Nesne & { id: string; pay: number; adet: number; gelir: number | null };
  isAgirligi: (j: Nesne) => number;
  PW: Record<string, number>;
}
const motor = new Function(`${planlamaMotoru()}\nreturn { girdiKur, stKur, schedule, evaluate, lowerBound, siparisParcasi, isAgirligi, PW };`)() as Motor;
const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const tezgah = (id: string, grup: string): Nesne => ({ id, ad: id, grup, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10') }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
  // O2 termini başlangıç günü 09:00: geç kalır
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 40, start: '2026-10-19', due: '2026-10-19', priority: 1, status: 'serbest' },
  ],
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const CALISMA = {
  D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
};

// O2 (40 adet) 10 + 30 bölünür; parçaların işlemleri bölünmemiş planın yerinde kalır (bolmeHamle'nin ilk adımı gibi)
function kur(cezaGun: number | null): { st0: Nesne; p0: { ops: Record<string, Op> }; st1: Nesne; p1: { ops: Record<string, Op> } } {
  const g = motor.girdiKur(kopya(CALISMA), kopya(KAYIT), kopya(KAYNAK), '2026-10-19');
  if (!g) throw new Error('çalışma kurulamadı');
  const st0 = motor.stKur(g.S); st0.now = 7;
  const o2 = st0.D.siparisler.find((s) => s.id === 'O2')!; o2['cezaGun'] = cezaGun; o2['gelir'] = 2000;
  const p0 = motor.schedule(st0, 'dagit', null);
  expect(p0.fail).toEqual([]);
  const st1 = kopya(st0);
  st1.D.siparisler = st1.D.siparisler.flatMap((s) => s.id === 'O2' ? [motor.siparisParcasi(s, 'O2/1', 10), motor.siparisParcasi(s, 'O2/2', 30)] : [s]);
  const ops: Record<string, Op> = {};
  for (const [id, r] of Object.entries(p0.ops)) {
    if (r.job !== 'O2') { ops[id] = r; continue; }
    for (const k of ['1', '2']) ops[`O2/${k}.10`] = { ...r, id: `O2/${k}.10`, job: `O2/${k}` };
  }
  return { st0, p0, st1, p1: { ops } };
}

describe('bölünen siparişin gecikmesi adet oranlı (35 b)', () => {
  it('parça adet payını, gelirini ve siparişin termin, öncelik ve cezasını taşır; parçanın parçası payı çarpar', () => {
    const s = { id: 'O2', adet: 20, gelir: 2000, termin: '2026-10-19 17:00', oncelik: 1, cezaGun: 300, malzeme: [{ kod: 'H1', miktar: 2 }] };
    const a = motor.siparisParcasi(s, 'O2/1', 5);
    expect(a).toEqual({ ...s, id: 'O2/1', adet: 5, gelir: 500, pay: 0.25, malzeme: [{ kod: 'H1', miktar: 2 }] });
    expect(motor.siparisParcasi(a, 'O2/1/2', 4).pay).toBeCloseTo(0.2, 9);
    expect(motor.isAgirligi(a)).toBe(motor.PW[1]! * 0.25);
    expect(motor.isAgirligi({ oncelik: 1 })).toBe(motor.PW[1]);
  });

  it('aynı yerde biten iki parça ağırlıklı gecikmeyi ve cezayı bir kez sayar (girilen ceza ve motorun cezası)', () => {
    for (const ceza of [300, null]) {
      const { st0, p0, st1, p1 } = kur(ceza);
      const e0 = motor.evaluate(p0, st0, null, false), e1 = motor.evaluate(p1, st1, null, false);
      expect(e0.J['O2']?.T).toBeGreaterThan(0);
      expect(e1.J['O2/1']?.T).toBeCloseTo(e0.J['O2']?.T ?? NaN, 9);
      expect(e1.wT).toBeCloseTo(e0.wT, 9);
      expect((e1.J['O2/1']?.p ?? NaN) + (e1.J['O2/2']?.p ?? NaN)).toBeCloseTo(e0.J['O2']?.p ?? NaN, 9);
      expect(e1.J['O2/2']?.p).toBeCloseTo((e0.J['O2']?.p ?? NaN) * 0.75, 9);
    }
  });

  it('alt sınır da parçanın gecikmesini payla sayar', () => {
    const { st1 } = kur(null);
    const lb = motor.lowerBound(st1);
    const D = (st1 as { D: { siparisler: Array<{ id: string; termin: string; oncelik: number; pay?: number }> } }).D;
    const due = (s: string): number => (Date.parse(`${s.slice(0, 10)}T${s.slice(11, 16)}:00Z`) - Date.parse('2026-10-19T00:00:00Z')) / 3_600_000;
    const bek = D.siparisler.reduce((t, s) => t + Math.max(0, (lb.C[s.id] ?? 0) - due(s.termin)) * motor.isAgirligi(s), 0);
    expect(lb.wT).toBeCloseTo(bek, 9);
    expect(lb.C['O2/2']! - due('2026-10-19 17:00')).toBeGreaterThan(0);
  });

  it('çerçevenin gecikme bedeli: girilen ceza ve taban bedel parçada payla, tutardan gelen bileşenler parçanın tutarıyla', () => {
    const A = { kip: 'bedel', taban: 10, fin: 0.13, tavan: 10, kar: 0.3, sinif: { A: 1.5, B: 1 }, bil: { ceza: 1, fin: 1, kar: 0, sinif: 0, elle: 0 }, esik: { y: 1.5, d: 0.6 } };
    const agBedel = new Function(`${planlamaMotoru()}\nreturn agBedel;`)() as (D: Nesne, s: Nesne, a: Nesne) => { b: number };
    const D = { musteriler: [{ id: 'MU-1', sinif: 'A', cezaOran: 0.3, cezaTavan: 10 }] };
    const butun = { id: 'O2', adet: 20, gelir: 2000, musteri: 'MU-1', cezaGun: 240 };
    const parca = motor.siparisParcasi(butun, 'O2/1', 5);
    expect(agBedel(D, parca, A).b).toBeCloseTo(agBedel(D, butun, A).b * 0.25, 9);
    const tabanli = { id: 'O3', adet: 20, gelir: null, musteri: 'MU-1', cezaGun: null };
    expect(agBedel(D, motor.siparisParcasi(tabanli, 'O3/1', 5), A).b).toBeCloseTo(agBedel(D, tabanli, A).b * 0.25, 9);
    const oranli = { ...butun, cezaGun: null };
    expect(agBedel(D, motor.siparisParcasi(oranli, 'O2/1', 5), A).b).toBeCloseTo(agBedel(D, oranli, A).b * 0.25, 9);
  });
});
