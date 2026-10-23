import { describe, expect, it } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { prototipYukle } from '../prototip.ts';
import { grades, openFindings, recoState, yelpaze } from './gorunum.ts';
import { finansMotoru } from './motor.ts';
import { genisDurum, ORNEK_BUGUN } from './ornek-veri.ts';

// ENGINE dışındaki görünüm hesapları prototiptekiyle aynı girdide aynı sonucu verir.
const html = await prototipYukle();
const kes = (bas: string, son: string): string => html.slice(html.indexOf(bas), html.indexOf(son, html.indexOf(bas)));
const blok = html.slice(html.indexOf('/*ENGINE-START*/'), html.indexOf('/*ENGINE-END*/'));
const ekler = [
  kes('function recoState(id)', 'const scoreColor'),
  kes('function grades(B)', 'const badge'),
].join('\n');

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

const baglam = createContext({});
runInContext(blok + '\n' + ekler, baglam);
runInContext(`setToday(${JSON.stringify(ORNEK_BUGUN)}); state = normalize(${JSON.stringify(motor.durum)});`, baglam);

describe('görünüm hesapları: prototip eşitliği', () => {
  it('örnek bulgu sayısı anlamlıdır', () => { expect(A0.findings.length).toBeGreaterThanOrEqual(3); });

  it('recoState ve openFindings', () => {
    const A = motor.runAnalysis();
    for (const f of A.findings) expect(recoState(motor, f.id)).toBe(runInContext(`recoState(${JSON.stringify(f.id)})`, baglam));
    const eski = runInContext('runAnalysis().findings.filter(f => recoState(f.id) === "acik").map(f => f.id)', baglam) as string[];
    expect(openFindings(motor, A).map((f) => f.id)).toEqual([...eski]);
    expect(openFindings(motor, A).length).toBe(A.findings.length - 2);
  });

  it('grades', () => {
    const B = motor.backtestAll();
    expect(grades(B)).toEqual({ ...(runInContext(`grades(${JSON.stringify(B)})`, baglam) as object) });
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
