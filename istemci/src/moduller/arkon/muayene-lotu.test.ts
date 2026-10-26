import { describe, expect, it } from 'vitest';
import { aqlPlani, muayeneNumunePlani } from '../../../../arkon/web/src/data/muayene-lotu.ts';

// Muayene paketinin numune planında lot büyüklüğü TMI emrinin adedinden gelir (Akış A provası O4).
describe('Muayene numune planı lotu', () => {
  const st = { lot: 200, n: 8, ac: 0 };
  it('TMI iş emri paketinde lot hedef adettir, numune ve Ac planlamacınındır', () => {
    expect(muayeneNumunePlani({ id: 'tmi-ie-5', target: 19 }, st)).toEqual({ lot: 19, n: 8, ac: 0 });
    expect(muayeneNumunePlani({ id: 'tmi-ue-9', target: 19 }, st)).toEqual({ lot: 19, n: 8, ac: 0 });
  });
  it('numune lottan büyükse lota indirilir', () => {
    expect(muayeneNumunePlani({ id: 'tmi-ie-5', target: 5 }, st)).toEqual({ lot: 5, n: 5, ac: 0 });
  });
  it('yerel pakette ya da adet yokken kayıtlı plan aynen kalır', () => {
    expect(muayeneNumunePlani({ id: 'seed-kal', target: 8 }, st)).toEqual(st);
    expect(muayeneNumunePlani({ id: 'tmi-ie-5' }, st)).toEqual(st);
    expect(muayeneNumunePlani({ id: 'tmi-ie-5', target: 0 }, st)).toEqual(st);
    expect(muayeneNumunePlani(null, st)).toEqual(st);
  });
  it('564 2 a: Kalite Merkezi lot planı varsa numune ve Ac ondandır; durdurulmuş ya da bozuk planda planlamacınınki kalır', () => {
    const tmi = (aql: unknown) => ({ id: 'tmi-ie-5', target: 50, tmi: { aql } });
    expect(muayeneNumunePlani(tmi({ n: 13, ac: 1, re: 2 }), st)).toEqual({ lot: 50, n: 13, ac: 1 });
    expect(muayeneNumunePlani({ ...tmi({ n: 80, ac: 2, re: 3 }), target: 20 }, st)).toEqual({ lot: 20, n: 20, ac: 2 });
    expect(muayeneNumunePlani(tmi({ durduruldu: true }), st)).toEqual({ lot: 50, n: 8, ac: 0 });
    expect(muayeneNumunePlani(tmi({ n: '13', ac: 1 }), st)).toEqual({ lot: 50, n: 8, ac: 0 });
    expect(aqlPlani(tmi({ durduruldu: true }))).toEqual({ durduruldu: true });
    expect(aqlPlani(tmi({ n: 13, ac: 1 }))).toEqual({ n: 13, ac: 1, re: null });
    expect(aqlPlani({ id: 'x' })).toBeNull();
  });
  it('diğer alanları (kusur listesi) korur', () => {
    expect(muayeneNumunePlani({ id: 'tmi-ie-1', target: 19 }, { ...st, defects: ['Çizik'] }).defects).toEqual(['Çizik']);
  });
});
