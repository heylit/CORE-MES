import { describe, expect, it } from 'vitest';
import { canliPlani, degisenler, farkOzeti } from './fark.ts';
import { planOku, type OkunanPlan } from './kurallar.ts';
import { ornekCalisma } from './ornek.ts';

const plan = () => { const p = planOku(ornekCalisma()); if (!p) throw new Error('plan yok'); return p; };
const yerlesen = (p: OkunanPlan) => Object.values(p.ops).filter((r) => Number.isFinite(r.S));
const ayni = (p: OkunanPlan) => Object.fromEntries(yerlesen(p).map((r) => [r.id, { m: r.m, S: r.S, C: r.C, job: r.job }]));

describe('Önceki planla fark hesapları', () => {
  it('aynı plan fark vermez; çeyrek saatten az kayma sayılmaz, çoğu ve tezgâh değişimi sayılır; canlıda olmayan iş değişmiş sayılır', () => {
    const p = plan();
    const [a, b, d] = yerlesen(p);
    if (!a || !b || !d) throw new Error('üç iş gerek');
    expect(farkOzeti(p, ayni(p))).toEqual({ is: 0, tez: 0, sip: 0 });
    const c = ayni(p);
    c[a.id] = { ...a, S: a.S + 0.2 };
    expect(degisenler(p, c).size).toBe(0);
    c[a.id] = { ...a, S: a.S + 0.5 };
    c[b.id] = { ...b, m: `${b.m}-baska` };
    delete c[d.id];
    expect([...degisenler(p, c)].sort()).toEqual([a.id, b.id, d.id].sort());
    const f = farkOzeti(p, c);
    expect(f.is).toBe(3);
    expect(f.tez).toBe(new Set([a.m, b.m, d.m]).size);
    expect(f.sip).toBe(new Set([a.job, b.job, d.job]).size);
  });

  it('karşılaştırma planı canlıdaki yerleri alır, canlıda olmayan iş yerleşmemiş olur; tahtadaki plan değişmez', () => {
    const p = plan();
    const [a, b] = yerlesen(p);
    if (!a || !b) throw new Error('iki iş gerek');
    const q = canliPlani(p, { [a.id]: { m: 'T9', S: 1, C: 2, job: a.job } });
    expect(q.ops[a.id]).toMatchObject({ m: 'T9', S: 1, C: 2 });
    expect(Number.isNaN(q.ops[b.id]?.S)).toBe(true);
    expect(p.ops[a.id]?.m).toBe(a.m);
  });
});
