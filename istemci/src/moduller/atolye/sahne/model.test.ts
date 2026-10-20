import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { modelDizisi, modelYerlestir, parcaOnizlemesi, raftaYatis } from './model.ts';

// Milimetre ve Z yukarı çizilmiş 2000 x 1000 x 500 mm kutu (CAD'deki gibi: yükseklik Z).
const kutu = () => new Mesh(new BoxGeometry(2000, 1000, 500), new MeshBasicMaterial());

const olcu = (o: Mesh | ReturnType<typeof modelYerlestir>['kok']) => {
  o.updateMatrixWorld(true);
  const k = new Box3().setFromObject(o);
  return { boy: k.getSize(new Vector3()), alt: k.min.y, merkez: k.getCenter(new Vector3()) };
};

describe('model yerleşimi', () => {
  it('birim ve yukarı eksen uygulanır; taban zeminde, merkez ortada', () => {
    const { kok, boyut } = modelYerlestir(kutu(), { birim: 'mm', yukari: 'z', donus: 0, sigdir: false }, null);
    const o = olcu(kok);
    expect(o.boy.x).toBeCloseTo(2);
    expect(o.boy.y).toBeCloseTo(0.5);
    expect(o.boy.z).toBeCloseTo(1);
    expect(o.alt).toBeCloseTo(0);
    expect(o.merkez.x).toBeCloseTo(0);
    expect(o.merkez.z).toBeCloseTo(0);
    expect(boyut.y).toBeCloseTo(0.5);
  });

  it('90 derece dönüş genişlik ve derinliği değiştirir; sığdırma ayak izini aşmaz, oranı korur', () => {
    const { kok } = modelYerlestir(kutu(), { birim: 'mm', yukari: 'z', donus: 90, sigdir: true }, { g: 0.5, d: 3 });
    const o = olcu(kok);
    expect(o.boy.x).toBeCloseTo(0.5);
    expect(o.boy.z).toBeCloseTo(1);
    expect(o.boy.y).toBeCloseTo(0.25);
    expect(o.alt).toBeCloseTo(0);
  });

  it('parça önizlemesi en uzun kenarı verilen boya getirir, merkezi kökün ortasında, gölge düşürmez', () => {
    const p = parcaOnizlemesi(kutu(), { birim: 'mm', yukari: 'z', donus: 0 }, 1.2);
    p.updateMatrixWorld(true);
    const k = new Box3().setFromObject(p);
    const b = k.getSize(new Vector3());
    const c = k.getCenter(new Vector3());
    expect(Math.max(b.x, b.y, b.z)).toBeCloseTo(1.2);
    expect(b.x).toBeCloseTo(1.2);
    expect(b.z).toBeCloseTo(0.6);
    expect(c.length()).toBeLessThan(1e-6);
    let golge = false;
    p.traverse((o) => { if (o instanceof Mesh && o.castShadow) golge = true; });
    expect(golge).toBe(false);
  });

  it('model dizisi gerçek ölçüyle bölgeye dizilir, bölgeden taşmaz; adet dolulukla ve sınırla', () => {
    const parca = () => new Mesh(new BoxGeometry(0.2, 0.1, 0.3), new MeshBasicMaterial());
    const b = { x: 2, y: 1, z: -1, g: 1, h: 0.5, d: 1 };
    const kapsar = (kok: ReturnType<typeof modelDizisi>['kok']) => {
      const toplam = new Box3();
      kok.traverse((o) => {
        if (!(o instanceof InstancedMesh)) return;
        o.geometry.computeBoundingBox();
        for (let i = 0; i < o.count; i++) {
          const m = new Matrix4();
          o.getMatrixAt(i, m);
          toplam.union((o.geometry.boundingBox as Box3).clone().applyMatrix4(m));
        }
      });
      return toplam;
    };
    const dolu = modelDizisi(parca(), { birim: 'm', yukari: 'y', donus: 0 }, b, 1);
    expect(dolu.adet).toBe(48);
    const k = kapsar(dolu.kok);
    expect(k.min.x).toBeGreaterThanOrEqual(b.x - b.g / 2 - 1e-6);
    expect(k.max.x).toBeLessThanOrEqual(b.x + b.g / 2 + 1e-6);
    expect(k.min.z).toBeGreaterThanOrEqual(b.z - b.d / 2 - 1e-6);
    expect(k.max.z).toBeLessThanOrEqual(b.z + b.d / 2 + 1e-6);
    expect(k.min.y).toBeCloseTo(b.y);
    expect(k.max.y).toBeLessThanOrEqual(b.y + b.h + 1e-6);
    expect(modelDizisi(parca(), { birim: 'm', yukari: 'y', donus: 0 }, b, 0.1).adet).toBe(6);
    // Bölgeden büyük parça küçültülür (en kısıtlı eksen: boy), küçülen ölçüyle derinliğe iki kopya sığar.
    const buyuk = modelDizisi(new Mesh(new BoxGeometry(3, 1, 1), new MeshBasicMaterial()), { birim: 'm', yukari: 'y', donus: 0 }, b, 1);
    const kb = kapsar(buyuk.kok).getSize(new Vector3());
    expect(buyuk.adet).toBe(2);
    // Vekil: her kopya modelin kutusu, kopyalar ayrıntıyla aynı yerde; ayrıntı başta gizli, üçgeni sayılır.
    expect(dolu.vekil.count).toBe(48);
    expect(dolu.ayrinti.visible).toBe(false);
    expect(dolu.ucgen).toBe(12 * 48);
    const v = new Box3();
    dolu.vekil.geometry.computeBoundingBox();
    for (let i = 0; i < dolu.vekil.count; i++) {
      const m = new Matrix4();
      dolu.vekil.getMatrixAt(i, m);
      v.union((dolu.vekil.geometry.boundingBox as Box3).clone().applyMatrix4(m));
    }
    const ayr = new Box3();
    dolu.ayrinti.traverse((o) => {
      if (!(o instanceof InstancedMesh)) return;
      o.geometry.computeBoundingBox();
      for (let i = 0; i < o.count; i++) { const m = new Matrix4(); o.getMatrixAt(i, m); ayr.union((o.geometry.boundingBox as Box3).clone().applyMatrix4(m)); }
    });
    expect(v.min.distanceTo(ayr.min)).toBeLessThan(1e-6);
    expect(v.max.distanceTo(ayr.max)).toBeLessThan(1e-6);
    expect(kb.x).toBeCloseTo(1);
    expect(kb.x).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('göze yatış: sığan model kendi duruşunda kalır; dik uzun parça göze yatırılır; hiç sığmayan en az küçülür', () => {
    const goz = { g: 1, h: 0.5, d: 1 };
    // Kendi duruşunda sığan (0,2 x 0,1 x 0,3): duruş değişmez.
    expect(raftaYatis({ x: 0.2, y: 0.1, z: 0.3 }, goz)).toEqual({ eksen: [0, 1, 2], k: 1, sigdi: true });
    // Dik mil (0,9 m boy): ayakta sığmaz, yatınca sığar; en alçak duruş seçilir (boy yatayda).
    const mil = raftaYatis({ x: 0.08, y: 0.9, z: 0.08 }, goz);
    expect(mil.sigdi).toBe(true);
    expect(mil.k).toBe(1);
    expect(mil.eksen[1]).not.toBe(1);
    // Gözden büyük (1,6 x 0,2 x 0,2): hiçbir duruşta sığmaz, küçültülür ve bildirilir.
    const buyuk = raftaYatis({ x: 1.6, y: 0.2, z: 0.2 }, goz);
    expect(buyuk.sigdi).toBe(false);
    expect(buyuk.k).toBeCloseTo(1 / 1.6);

    // Dizide: yatırılan mil gözün içinde, gerçek ölçüsünde, tabanı göz tabanında.
    const b = { x: 0, y: 1, z: 0, g: 1, h: 0.5, d: 1 };
    const dizi = modelDizisi(new Mesh(new BoxGeometry(0.08, 0.9, 0.08), new MeshBasicMaterial()), { birim: 'm', yukari: 'y', donus: 0 }, b, 0.05);
    const k = new Box3();
    dizi.vekil.geometry.computeBoundingBox();
    const m = new Matrix4();
    dizi.vekil.getMatrixAt(0, m);
    k.copy(dizi.vekil.geometry.boundingBox as Box3).applyMatrix4(m);
    const o = k.getSize(new Vector3());
    expect(Math.max(o.x, o.z)).toBeCloseTo(0.9);
    expect(o.y).toBeCloseTo(0.08);
    expect(k.min.y).toBeCloseTo(b.y);
    expect(dizi.yatis.sigdi).toBe(true);
  });
});
