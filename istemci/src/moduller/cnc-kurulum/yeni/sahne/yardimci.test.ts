import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, BoxGeometry, Vector3 } from 'three';
import { disposeObj, drawChart, Orbit, sizeSprite, textSprite, visibleRect } from './yardimci.ts';

// gl.ts tek çiziciyi ve CNC3D'yi kurar; burada yalnız rr ve WebGL'siz bağlam gerekir.
vi.mock('./gl.ts', () => ({ rr: () => undefined, glAl: () => null }));

function ogeKur(w: number, h: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: w });
  Object.defineProperty(el, 'clientHeight', { value: h });
  return el;
}

describe('Orbit', () => {
  it('fit hedefi ve uzaklığı prototipin formülüyle kurar; snap ve update kamerayı yerleştirir', () => {
    const cam = new PerspectiveCamera(40, 1, 0.1, 1000);
    const o = new Orbit(ogeKur(400, 200), cam);
    const kutu = new Box3(new Vector3(-10, -20, -30), new Vector3(10, 20, 30));
    o.fit(kutu, 'iso');
    const r = Math.max(1, kutu.getSize(new Vector3()).length() / 2);
    const beklenen = r / Math.sin(40 * Math.PI / 360) * 1.08 * Math.max(1, 1 / 2);
    expect(o.tDist).toBeCloseTo(beklenen, 9);
    expect([o.tTh, o.tPh]).toEqual([-0.75, 0.95]);
    o.snap();
    o.update(1, 2);
    const sp = Math.sin(0.95);
    expect(cam.position.x).toBeCloseTo(beklenen * sp * Math.sin(-0.75), 6);
    expect(cam.position.y).toBeCloseTo(beklenen * Math.cos(0.95), 6);
    expect(cam.position.z).toBeCloseTo(beklenen * sp * Math.cos(-0.75), 6);
    expect(cam.aspect).toBe(2);
    expect(cam.near).toBeCloseTo(Math.max(0.01, beklenen / 200), 9);
    expect(cam.far).toBeCloseTo(beklenen * 60, 9);
  });

  it('görünüş adları prototipteki açıları verir; boş kutu değiştirmez', () => {
    const o = new Orbit(ogeKur(100, 100), new PerspectiveCamera(40, 1, 0.1, 100));
    const kutu = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    o.fit(kutu, 'top'); expect([o.tTh, o.tPh]).toEqual([0, 0.06]);
    o.fit(kutu, 'front'); expect([o.tTh, o.tPh]).toEqual([0, Math.PI / 2 - 0.02]);
    o.fit(kutu, 'side'); expect([o.tTh, o.tPh]).toEqual([Math.PI / 2, Math.PI / 2 - 0.02]);
    const once = o.tDist;
    o.fit(new Box3(), 'iso');
    expect(o.tDist).toBe(once);
  });

  it('update yumuşak geçer: k kadar yaklaşır', () => {
    const o = new Orbit(ogeKur(100, 100), new PerspectiveCamera(40, 1, 0.1, 100));
    o.tDist = 100; o.dist = 300;
    o.update(0.25, 1);
    expect(o.dist).toBe(250);
  });

  it('teker uzaklığı değiştirir; birak sonrası dinlemez', () => {
    const el = ogeKur(100, 100);
    const o = new Orbit(el, new PerspectiveCamera(40, 1, 0.1, 100));
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(o.tDist).toBeCloseTo(300 * Math.pow(1.0015, 100), 9);
    o.birak();
    const once = o.tDist;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(o.tDist).toBe(once);
  });
});

describe('tuval yardımcıları', () => {
  it('textSprite tuval bağlamı olmadan da sprite verir; sizeSprite orana göre ölçekler', () => {
    const s = textSprite('T1');
    expect(s.renderOrder).toBe(10);
    expect(s.material.depthTest).toBe(false);
    sizeSprite(s, 2);
    const oran = s.userData['aspect'] as number;
    expect(s.scale.x).toBeCloseTo(2 * oran, 9);
    expect(s.scale.y).toBe(2);
  });

  it('drawChart ölçüsüz ya da bağlamsız tuvalde sessiz kalır', () => {
    // jsdom'da 2B bağlam yoktur; bağlamsız dal açıkça kurulur.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const cv = document.createElement('canvas');
    expect(() => { drawChart(cv, { xmin: 0, xmax: 1, ymax: 1 }); }).not.toThrow();
    Object.defineProperty(cv, 'clientWidth', { value: 200 });
    Object.defineProperty(cv, 'clientHeight', { value: 100 });
    expect(() => { drawChart(cv, { xmin: 0, xmax: 10, ymax: 5, series: [{ pts: [[0, 1], [10, 4]], color: '#000', fill: '#111' }] }); }).not.toThrow();
  });

  it('visibleRect küçük ya da ekran dışı öğede null verir', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 50);
    expect(visibleRect(el, 600)).not.toBeNull();
    el.getBoundingClientRect = () => new DOMRect(0, 700, 100, 50);
    expect(visibleRect(el, 600)).toBeNull();
    el.getBoundingClientRect = () => new DOMRect(0, 0, 5, 50);
    expect(visibleRect(el, 600)).toBeNull();
  });

  it('disposeObj korunan malzemeye dokunmaz', () => {
    const g = new Group();
    const korunan = new MeshBasicMaterial(); korunan.userData['keep'] = true;
    const atilan = new MeshBasicMaterial();
    let korunanAtildi = false, atilanAtildi = false;
    korunan.addEventListener('dispose', () => { korunanAtildi = true; });
    atilan.addEventListener('dispose', () => { atilanAtildi = true; });
    g.add(new Mesh(new BoxGeometry(), korunan), new Mesh(new BoxGeometry(), atilan));
    disposeObj(g);
    expect([korunanAtildi, atilanAtildi]).toEqual([false, true]);
  });
});
