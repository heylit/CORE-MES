import { describe, expect, it } from 'vitest';
import { grades, openFindings, yelpaze } from './gorunum.ts';
import { finansMotoru } from './motor.ts';
import { genisDurum, ORNEK_BUGUN } from './ornek-veri.ts';

const motor = finansMotoru(ORNEK_BUGUN);
const durum = genisDurum(motor);
motor.durum = motor.normalize(JSON.parse(JSON.stringify(durum)));
const A0 = motor.runAnalysis();
// Bulguların biri ertelenmiş (günü geçmiş: yeniden açık), biri ileri tarihe ertelenmiş, biri yapıldı.
const [b1, b2, b3] = A0.findings;
durum.reco = {
  ...(b1 ? { [b1.id]: { st: 'ertelendi', until: '2026-10-01' } } : {}),
  ...(b2 ? { [b2.id]: { st: 'ertelendi', until: '2026-12-01' } } : {}),
  ...(b3 ? { [b3.id]: { st: 'yapildi', until: null } } : {}),
};
motor.durum = motor.normalize(JSON.parse(JSON.stringify(durum)));

describe('görünüm hesapları', () => {
  it('örnek bulgu sayısı anlamlıdır', () => { expect(A0.findings.length).toBeGreaterThanOrEqual(3); });

  it('ertelenmiş ve yapılmış bulgu açık sayılmaz', () => {
    const A = motor.runAnalysis();
    expect(openFindings(motor, A).length).toBe(A.findings.length - 2);
  });

  it('karnesi olmayan alan na', () => {
    expect(grades({ cash: null, sales: null, ar: null, cust: null } as never)).toEqual({ cash: 'na', sales: 'na', ar: 'na', cust: 'na' });
  });

  it('yelpaze bantları sıralıdır ve eşik sabittir', () => {
    const mc = motor.runAnalysis().mc;
    expect(mc).not.toBeNull();
    const y = yelpaze(mc!);
    expect(y.p50).toHaveLength(13);
    y.p50.forEach((v, i) => {
      expect(y.p10[i]!).toBeLessThanOrEqual(y.p25[i]!);
      expect(y.p25[i]!).toBeLessThanOrEqual(v);
      expect(v).toBeLessThanOrEqual(y.p75[i]!);
      expect(y.p75[i]!).toBeLessThanOrEqual(y.p90[i]!);
    });
    expect(new Set(y.esik).size).toBe(1);
    expect(y.p50[y.dipHafta]).toBe(Math.min(...y.p50));
  });
});
