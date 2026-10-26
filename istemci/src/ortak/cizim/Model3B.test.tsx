import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// three yerine sayan sahte: her oluşturulan nesnenin bırakılıp bırakılmadığı izlenir.
const izler = vi.hoisted(() => ({ birakilan: [] as string[], olusan: [] as string[], baglamKaybi: 0 }));
vi.mock('./kitaplik.ts', () => {
  const vektor = () => ({ x: 0, y: 0, z: 1, set() {}, normalize() { return this; }, multiplyScalar() { return this; } });
  const atilir = (ad: string) => { izler.olusan.push(ad); return { dispose: () => { izler.birakilan.push(ad); } }; };
  const nesne = (ad: string, ek: object = {}) => ({ position: vektor(), rotation: vektor(), add() {}, ...ek, ...(ad ? atilir(ad) : {}) });
  class WebGLRenderer {
    domElement = document.createElement('canvas'); localClippingEnabled = false; outputEncoding = null;
    setPixelRatio() {} setSize() {} render() {} dispose() { izler.birakilan.push('cizici'); } forceContextLoss() { izler.baglamKaybi += 1; }
  }
  const T = {
    WebGLRenderer,
    Scene: function Scene() { return nesne(''); },
    PerspectiveCamera: function PerspectiveCamera() { return { ...nesne(''), up: vektor(), aspect: 1, updateProjectionMatrix() {} }; },
    OrbitControls: function OrbitControls() { return { target: vektor(), enableDamping: false, dampingFactor: 0, autoRotate: false, autoRotateSpeed: 0, enabled: true, update() {}, ...atilir('denetim') }; },
    Plane: function Plane() { return { constant: 0 }; },
    Vector3: function Vector3() { return vektor(); },
    MeshStandardMaterial: function MeshStandardMaterial() { return { color: { set() {} }, visible: true, ...atilir('malzeme') }; },
    LineBasicMaterial: function LineBasicMaterial() { return { color: { set() {} }, visible: true, ...atilir('cizgi-malzemesi') }; },
    Group: function Group() { return nesne(''); },
    BufferGeometry: function BufferGeometry() { return { setAttribute() {}, setIndex() {}, computeVertexNormals() {}, ...atilir('geometri') }; },
    BufferAttribute: function BufferAttribute() { return {}; },
    Mesh: function Mesh() { return nesne(''); },
    LineSegments: function LineSegments() { return nesne(''); },
    HemisphereLight: function HemisphereLight() { return nesne(''); },
    DirectionalLight: function DirectionalLight() { return nesne(''); },
    GridHelper: function GridHelper() {
      return nesne('', { geometry: atilir('izgara-geometrisi'), material: { color: { set() {} }, ...atilir('izgara-malzemesi') } });
    },
    sRGBEncoding: 1, DoubleSide: 2,
  };
  return { three: async () => T };
});
vi.mock('../veri/tema.ts', () => ({ useTema: () => ({ tema: 'dark', degistir: () => {} }) }));

class SahteGozlemci { observe() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', SahteGozlemci);

const { Model3B } = await import('./Model3B.tsx');

const veri = {
  bbox: { mn: [0, 0, 0], mx: [1, 1, 1] }, diag: 1.7, ep: new Float32Array(6),
  meshes: [{ p: new Float32Array(9), i: new Uint32Array(3) }, { p: new Float32Array(9), i: new Uint32Array(3) }],
} as unknown as Parameters<typeof Model3B>[0]['data'];

afterEach(() => { izler.birakilan.length = 0; izler.olusan.length = 0; izler.baglamKaybi = 0; });

describe('Model3B kapanınca GPU belleğini bırakır (731)', () => {
  it.each([[false], [true]])('sade=%s: her geometri, malzeme ve denetim bırakılır; çizici ve bağlamı kapanır', async (sade) => {
    const g = render(<Model3B data={veri} fa={2} sade={sade} />);
    await act(async () => { await new Promise((coz) => { setTimeout(coz, 0); }); });
    expect(izler.olusan.length).toBeGreaterThan(0);
    expect(izler.birakilan).toEqual([]);
    g.unmount();
    expect([...izler.birakilan].sort()).toEqual([...izler.olusan, 'cizici'].sort());
    expect(izler.baglamKaybi).toBe(1);
    expect(izler.olusan.includes('izgara-geometrisi')).toBe(!sade);
  });
});
