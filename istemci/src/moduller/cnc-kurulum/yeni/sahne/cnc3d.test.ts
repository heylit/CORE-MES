import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { COOL, CONS, EMPTY, FIX, GAUGES, INSERTS, JAWS, LATHE, LHOLD, LIVE, MACHINES, MILL, WCS, ZERO } from '../veri/cncdata.ts';
import type { Kalem } from '../veri/tipler.ts';
import { assembly, build, dispose, fit, M } from './cnc3d.ts';

// Prototipin her kalemi ve tezgâhı çizilebilir bir model vermeli: hata atmaz, kutusu sonlu ve boş değildir.
const KALEMLER: Kalem[] = [
  ...FIX.mill, ...FIX.lathe, ...JAWS.mill, ...JAWS.lathe, ...ZERO.mill, ...ZERO.lathe, ...WCS.heid, ...WCS.iso,
  ...COOL, ...MILL, ...LATHE, ...INSERTS, ...LHOLD, ...LIVE, ...GAUGES, ...CONS,
];

function kutu(o: Object3D): Box3 { o.updateMatrixWorld(true); return new Box3().setFromObject(o); }
function sonlu(b: Box3): boolean { return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite); }
function agacta(o: Object3D, kosul: (n: Object3D) => boolean): boolean { let var_ = false; o.traverse((n) => { if (kosul(n)) var_ = true; }); return var_; }

describe('cnc3d', () => {
  it('her kalem model verir', () => {
    expect(KALEMLER.length).toBeGreaterThan(100);
    for (const k of KALEMLER) {
      const o = build(k), b = kutu(o);
      expect(b.isEmpty(), k.id).toBe(false);
      expect(sonlu(b), k.id).toBe(true);
      dispose(o);
    }
  });

  it('her tezgâh model verir', () => {
    for (const t of MACHINES) {
      const o = build({ id: t.id, name: t.name, kind: t.kind } as Kalem), b = kutu(o);
      expect(b.isEmpty(), t.id).toBe(false);
      expect(sonlu(b), t.id).toBe(true);
      dispose(o);
    }
  });

  it('takım montajı tezgâh türüne göre kurulur', () => {
    const freze = MACHINES.find((t) => t.type === 'mill'), torna = MACHINES.find((t) => t.type === 'lathe');
    expect(freze && torna).toBeTruthy();
    if (!freze || !torna) return;
    for (const k of [...MILL, ...LATHE]) {
      for (const t of [freze, torna]) {
        const o = assembly(k, t);
        expect(sonlu(kutu(o)), `${k.id}@${t.id}`).toBe(true);
        dispose(o);
      }
    }
  });

  it('boş cep ve sığdırma', () => {
    const o = fit(build(EMPTY), 3), s = kutu(o).getSize(new Vector3());
    expect(Math.max(s.x, s.y, s.z)).toBeCloseTo(3, 6);
  });

  it('ortak malzemeler bırakılmaz', () => {
    const o = build(MILL[0] ?? EMPTY);
    expect(agacta(o, (n) => n instanceof Mesh && Object.values(M).includes(n.material as never))).toBe(true);
    let atildi = false;
    M.steel.addEventListener('dispose', () => { atildi = true; });
    dispose(o);
    expect(atildi).toBe(false);
  });
});
