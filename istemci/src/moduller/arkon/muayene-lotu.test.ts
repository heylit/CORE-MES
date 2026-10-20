import { describe, expect, it } from 'vitest';
import { muayeneNumunePlani } from '../../../../arkon/web/src/data/muayene-lotu.ts';

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
  it('diğer alanları (kusur listesi) korur', () => {
    expect(muayeneNumunePlani({ id: 'tmi-ie-1', target: 19 }, { ...st, defects: ['Çizik'] }).defects).toEqual(['Çizik']);
  });
});
