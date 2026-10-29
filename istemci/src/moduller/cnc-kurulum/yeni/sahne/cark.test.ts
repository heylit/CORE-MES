import { describe, expect, it, vi } from 'vitest';
import { Box3 } from 'three';
import { ALPHA, BETA, CH, CR, CW, FOV, GEO, gearGeo, pawlMat, plat, R, SP, spokeG, TAU } from './cark.ts';

// gl.ts tek çiziciyi ve CNC3D'yi kurar; burada yalnız rr ve WebGL'siz bağlam gerekir.
vi.mock('./gl.ts', () => ({ rr: () => undefined, glAl: () => null }));

describe('çark', () => {
  it('ölçüler prototiptekiyle aynı', () => {
    expect([R, CR, CW, CH, SP, FOV]).toEqual([8, 9, 2.4, 1.64, 2.72, 42]);
    expect(ALPHA).toBe(TAU / 18);
    expect(BETA).toBe(2.72 / 9);
  });

  it('paylaşılan parçalar prototipin ölçüsündedir', () => {
    expect(GEO.frame.parameters).toMatchObject({ width: CW, height: CH, depth: 0.08 });
    expect(spokeG.parameters.height).toBe(2 * (R - 1));
    expect(plat.rotation.x).toBe(-Math.PI / 2);
    expect(pawlMat.emissiveIntensity).toBe(0.35);
  });

  it('dişli X ekseni üzerinde döner (kalınlık X yönünde)', () => {
    const g = gearGeo(R + 0.25, 18, 0.3);
    g.computeBoundingBox();
    const k = g.boundingBox ?? new Box3();
    expect(k.max.x - k.min.x).toBeCloseTo(0.3 + 2 * 0.04, 6);
    expect(k.max.y).toBeGreaterThan(R);
    expect(k.max.y).toBeLessThanOrEqual(R + 0.25 + 0.04);
  });
});
