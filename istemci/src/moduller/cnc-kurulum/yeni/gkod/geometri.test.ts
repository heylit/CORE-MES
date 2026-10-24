import { haritaAgi, haritaYukle, yolTamponu, type TalasRenkleri } from './geometri.ts';
import { haritaKur } from './talas.ts';
import type { Hareket, Program } from './tipler.ts';

const hv = (t: 0 | 1, a: [number, number, number], b: [number, number, number], pts: number[] | null = null): Hareket =>
  ({ t, a, b, pts: pts ? new Float32Array(pts) : null, ln: 0, T: 1, S: 0, F: 0, len: 1, dur: 1 });

const R: TalasRenkleri = { ust: [1, 1, 1], derin: [0, 0, 1], orta: [0, 1, 1], tamam: [0, 1, 0], fazla: [1, 0.5, 0], dalma: [1, 0, 0], disari: [0.3, 0.3, 0.3], mor: [0.5, 0, 1] };

describe('G-kod sahne tamponlari', () => {
  test('hizli ve kesme cizgileri ayri; yay noktalari parca parca', () => {
    const p = { moves: [hv(0, [0, 0, 0], [1, 0, 0]), hv(1, [1, 0, 0], [3, 0, 0], [2, 0, 0, 3, 0, 0])] } as unknown as Program;
    const y = yolTamponu(p, () => [0.5, 0.5, 0.5]);
    expect(Array.from(y.hizli)).toEqual([0, 0, 0, 1, 0, 0]);
    expect(Array.from(y.kesme)).toEqual([1, 0, 0, 2, 0, 0, 2, 0, 0, 3, 0, 0]);
    expect(Array.from(y.rEnd)).toEqual([2, 2]);
    expect(Array.from(y.cEnd)).toEqual([0, 4]);
    expect(y.kesmeRengi[0]).toBe(0.5);
  });

  test('harita agi, halka ve renk: ust yuzey ve derin bolge', () => {
    const hm = haritaKur({ x0: 0, y0: 0, z0: -10, x1: 10, y1: 10, z1: 0, src: 'man' }, null);
    const ag = haritaAgi(hm);
    expect(ag.indis.length).toBe((hm.NX - 1) * (hm.NY - 1) * 6);
    expect(ag.halka.length).toBe(2 * hm.NX + 2 * hm.NY - 4);
    hm.H[0] = -10;
    expect(haritaYukle(hm, ag, true, R)).toBeNull();
    expect(Array.from(ag.renk.slice(3, 6))).toEqual([1, 1, 1]);
    expect(Array.from(ag.renk.slice(0, 3))).toEqual([0.5, 0, 1]);
    expect(ag.duvar[2]).toBe(-10);
    expect(hm.dirty).toBe(false);
  });
});
