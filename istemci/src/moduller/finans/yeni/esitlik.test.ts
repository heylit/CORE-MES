import { describe, expect, it } from 'vitest';
import { createContext, runInContext, type Context } from 'node:vm';
import { prototipYukle } from '../prototip.ts';
import { finansMotoru, gross, type FinansMotoru, type MotorDurumu, type SiparisKalemi } from './motor.ts';
import { genisDurum, ornekDurum, ORNEK_BUGUN } from './ornek-veri.ts';

// Yeni motor prototipin motoruyla aynı girdide aynı sonucu vermeli (F0 kabulü). Prototip bloğu ayrı bağlamda koşar,
// aynı durum iki tarafa JSON olarak verilir; saate bağlı `at` ve `ms` alanları karşılaştırmadan çıkarılır.
const html = await prototipYukle();
const blok = html.slice(html.indexOf('/*ENGINE-START*/'), html.indexOf('/*ENGINE-END*/'));

function eskiMotor(durum: MotorDurumu, bugun: string): Context {
  const baglam = createContext({});
  runInContext(blok, baglam);
  runInContext(`setToday(${JSON.stringify(bugun)}); state = normalize(${JSON.stringify(durum)});`, baglam);
  return baglam;
}

function yeniMotor(durum: MotorDurumu, bugun: string): FinansMotoru {
  const m = finansMotoru(bugun);
  m.durum = m.normalize(JSON.parse(JSON.stringify(durum)) as MotorDurumu);
  return m;
}

const SAATSIZ = (k: string, v: unknown): unknown => (k === 'at' || k === 'ms' ? undefined : v);
const duz = (x: unknown): unknown => JSON.parse(JSON.stringify(x, SAATSIZ) ?? 'null');
const eski = (b: Context, kod: string): unknown => duz(runInContext(kod, b));

const SIPARISLER: SiparisKalemi[] = [
  { siparisNo: 'SA-1', firmaAdi: 'Deneme Tedarik', vade: '2026-10-20', tutarTl: '1000.00', tahminTl: '600.00' },
  { siparisNo: 'SA-2', firmaAdi: 'Deneme Tedarik', vade: '2026-11-03', tutarTl: null },
  { siparisNo: 'SA-3', firmaAdi: 'Deneme Tedarik', vade: '2026-12-20', tutarTl: '2500.00' },
];

describe.each([
  ['örnek veri', (m: FinansMotoru) => ornekDurum(m)],
  ['geniş veri (bütün modeller)', (m: FinansMotoru) => genisDurum(m)],
  ['boş durum', (m: FinansMotoru) => { m.setToday(ORNEK_BUGUN); return m.emptyState(); }],
])('motor eşitliği: %s', (_ad, kur) => {
  const durum = kur(finansMotoru(ORNEK_BUGUN));
  const e = eskiMotor(durum, ORNEK_BUGUN);
  const y = yeniMotor(durum, ORNEK_BUGUN);

  it('nakit, aylık seri, yaşlandırma ve çalışma sermayesi aynı', () => {
    expect(duz(y.cashToday())).toEqual(eski(e, 'cashToday()'));
    expect(duz(y.monthly(12))).toEqual(eski(e, 'monthly(12)'));
    expect(duz(y.completeMonths(24))).toEqual(eski(e, 'completeMonths(24)'));
    expect(duz([y.aging('gelir'), y.aging('gider')])).toEqual(eski(e, '[aging("gelir"), aging("gider")]'));
    expect(duz(y.workingDays())).toEqual(eski(e, 'workingDays()'));
    expect(duz(y.taxCalendar())).toEqual(eski(e, 'taxCalendar()'));
    expect(duz(y.alerts())).toEqual(eski(e, 'alerts()'));
  });

  it('senaryo tahmini ve sipariş planı aynı', () => {
    expect(duz(y.forecast())).toEqual(eski(e, 'forecast()'));
    const sc = { delay: 7, growth: 10, collect: 40, chequeRisk: 10, newBiz: true };
    expect(duz(y.forecast(sc))).toEqual(eski(e, `forecast(${JSON.stringify(sc)})`));
    expect(duz(y.siparisPlani(SIPARISLER))).toEqual(eski(e, `siparisPlani(${JSON.stringify(SIPARISLER)})`));
    expect(duz(y.siparisBuHafta(SIPARISLER))).toEqual(eski(e, `siparisBuHafta(${JSON.stringify(SIPARISLER)})`));
  });

  it('analiz (skor, Monte Carlo, Markov, Holt, Altman, anomali, bulgular) aynı', () => {
    expect(duz(y.runAnalysis(true))).toEqual(eski(e, 'runAnalysis(true)'));
  });

  it('tahmin karnesi (geriye dönük sınama) aynı', () => {
    expect(duz(y.backtestAll())).toEqual(eski(e, 'backtestAll()'));
  });

  it('özet rapor ve skor geçmişi aynı', () => {
    expect(duz(y.compactReport(y.runAnalysis()))).toEqual(eski(e, 'compactReport(runAnalysis())'));
    expect(y.recordHistory(y.runAnalysis(), 'tarayici')).toBe(runInContext('recordHistory(runAnalysis(), "tarayici")', e));
    expect(duz(y.durum.history)).toEqual(eski(e, 'state.history'));
  });
});

describe('motor eşitliği: geniş verinin anlamlı olduğu', () => {
  it('geniş veride bulgu, anomali ve karne gerçekten üretilir (eşitlik boş sonuçla geçmesin)', () => {
    const m = finansMotoru(ORNEK_BUGUN);
    m.durum = genisDurum(m);
    const a = m.runAnalysis(true);
    const k = m.backtestAll();
    expect(a.findings.length).toBeGreaterThan(3);
    expect(a.mc).not.toBeNull();
    expect(a.mk).not.toBeNull();
    expect(k.cash).not.toBeNull();
    expect(k.sales).not.toBeNull();
  });
});

it('düzenli ödemenin ay içinde ödenmiş sayılması (recPaidIn) aynı', () => {
  const m = finansMotoru(ORNEK_BUGUN);
  const durum = genisDurum(m);
  const gider = durum.tx.filter((t) => t.type === 'gider');
  const t = gider[gider.length - 1]!;
  const ym = t.date.slice(0, 7);
  // Biri aynı kategoride yakın tutarlı ödemeyle, biri bağlı kayıtla eşleşir; üçüncüsü hiçbirine uymaz.
  durum.recurring = [
    { id: 'r1', name: 'Eşleşen', cat: t.cat, amount: Math.round(gross(t)), day: 5 },
    { id: 'r2', name: 'Uzak', cat: t.cat, amount: Math.round(gross(t) * 3), day: 5 },
    { id: 'r3', name: 'Başka', cat: 'Başka kategori', amount: 100, day: 5 },
  ] as typeof durum.recurring;
  const e = eskiMotor(durum, ORNEK_BUGUN), y = yeniMotor(durum, ORNEK_BUGUN);
  const aylar = [ym, ORNEK_BUGUN.slice(0, 7)];
  const yeni = y.durum.recurring.flatMap((r) => aylar.map((a) => y.recPaidIn(r, a)));
  expect(yeni[0]).toBe(true);
  expect(yeni).toEqual(eski(e, `state.recurring.flatMap((r) => ${JSON.stringify(aylar)}.map((a) => recPaidIn(r, a)))`));
});
