import { Box3, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { glbYaz } from './glb.ts';
import type { GlbAgi } from './glb.ts';
import { prototipYukle } from './prototip-html.ts';

// Prototipin kendi THREE sürümü ve model kütüphanesi (CNC3D) sayfadan alınıp çalıştırılır; üretilen GLB depodaki THREE'nin
// glTF okuyucusuyla geri okunur (atölye haritası ve Çizimler aynı okuyucuyu kullanır).
interface Kutu { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
interface EskiThree { Box3: new () => { setFromObject(o: unknown): Kutu } }
interface Kutuphane { initMats(): void; build(it: { kind: string }): GlbAgi }

const betik = (prototip: string, bas: string): string => {
  const i = prototip.indexOf(bas);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${bas}`);
  return prototip.slice(i, prototip.indexOf('</script>', i));
};
const kur = (prototip: string): { THREE: EskiThree; CNC3D: Kutuphane } => {
  const kapsam: Record<string, unknown> = {};
  const govde = `${betik(prototip, '!function(t,e){')}\n;var THREE = self.THREE;\n${betik(prototip, 'var CNC3D = (function')}\n;return { THREE: self.THREE, CNC3D: CNC3D };`;
  const sonuc = (new Function('self', 'globalThis', 'window', govde) as (...a: unknown[]) => { THREE: EskiThree; CNC3D: Kutuphane })(kapsam, kapsam, kapsam);
  sonuc.CNC3D.initMats();
  return sonuc;
};

const MAKINE_TURLERI = ['m_vmc', 'm_5ax', 'm_5axh', 'm_gk', 'm_lathe', 'm_tf', 'm_hmc', 'm_ulathe'];

describe('GLB yazıcı', () => {
  let THREE: EskiThree;
  let CNC3D: Kutuphane;
  beforeAll(async () => { ({ THREE, CNC3D } = kur(await prototipYukle())); });

  it.each(MAKINE_TURLERI)('GLB-01: %s modeli glTF okuyucusuyla aynı ağ sayısı ve sınır kutusuyla geri okunur', async (tur) => {
    const kok = CNC3D.build({ kind: tur });
    const glb = glbYaz(kok, tur);
    const g = new DataView(glb.buffer);
    expect(g.getUint32(0, true)).toBe(0x46546c67);
    expect(g.getUint32(8, true)).toBe(glb.length);
    expect(glb.length % 4).toBe(0);

    let agSayisi = 0;
    const say = (n: GlbAgi): void => { if (n.isMesh && n.visible) agSayisi += 1; n.children.forEach(say); };
    say(kok);
    const once = new THREE.Box3().setFromObject(kok);

    const okunan = await new GLTFLoader().parseAsync(glb.slice().buffer, '');
    let okunanAg = 0;
    okunan.scene.traverse((n) => { if (n instanceof Mesh) okunanAg += 1; });
    expect(okunanAg).toBe(agSayisi);
    const sonra = new Box3().setFromObject(okunan.scene);
    for (const e of ['x', 'y', 'z'] as const) {
      expect(sonra.min[e]).toBeCloseTo(once.min[e], 4);
      expect(sonra.max[e]).toBeCloseTo(once.max[e], 4);
    }
  });

  it('GLB-02: birim metre ve Y yukarı: makine zeminde durur ve boyu birkaç metredir', () => {
    const b = new THREE.Box3().setFromObject(CNC3D.build({ kind: 'm_5ax' }));
    expect(b.min.y).toBeGreaterThan(-0.5);
    expect(b.max.y - b.min.y).toBeGreaterThan(1.5);
    expect(b.max.y - b.min.y).toBeLessThan(5);
  });
});
