import { BoxGeometry, LatheGeometry, Quaternion, Vector2, Vector3, type BufferGeometry } from 'three';
import {
  STOCK_DEF, aabb, agOlcu, enBuyukGovde, govdeAgi, hamCsv, hamCsvAdi, meshVol, minBox, parseSTL,
  roundUp, sCompute, stdUp, BAR_STD, PLATE_STD, type HamAyar, type HamParca,
} from './ham.ts';

const fmtN = (x: number, d?: number) => (x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }));
const fmt = (x: number) => String(x).replace('.', ',');

function ayar(degis: Partial<HamAyar>): HamAyar { return Object.assign({}, STOCK_DEF, degis) as HamAyar; }

function parca(g: BufferGeometry, ad = 'p'): HamParca {
  const P = new Float32Array(g.getAttribute('position').array), I = new Uint32Array(g.index!.array);
  return { P, I, q: new Quaternion(), name: ad, tris: I.length / 3 };
}

// Ic delikli ya da dolu mil (three LatheGeometry Y ekseni etrafinda doner).
function mil(dis: number, ic: number, boy: number) {
  const pr = ic > 0 ? [[ic, 0], [dis, 0], [dis, boy], [ic, boy], [ic, 0]] : [[0, 0], [dis, 0], [dis, boy], [0, boy]];
  return new LatheGeometry(pr.map((p) => new Vector2(p[0], p[1])), 72);
}

describe('ham hesap yardimcilari', () => {
  test('yuvarlama ve standart olcu', () => {
    expect(roundUp(107, 5)).toBe(110);
    expect(roundUp(12.34, 0)).toBe(12.3);
    expect(stdUp(44, BAR_STD)).toBe(45);
    expect(stdUp(26, PLATE_STD)).toBe(30);
    expect(stdUp(401, BAR_STD)).toBe(410);
  });

  test('ASCII ve ikili STL okunur, bos dosya reddedilir', () => {
    const asc = 'solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid';
    const a = parseSTL(new TextEncoder().encode(asc));
    expect(Array.from(a.P)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(a.I)).toEqual([0, 1, 2]);
    const buf = new ArrayBuffer(84 + 50), dv = new DataView(buf);
    dv.setUint32(80, 1, true);
    [0, 0, 0, 2, 0, 0, 0, 2, 0].forEach((v, k) => dv.setFloat32(84 + 12 + k * 4, v, true));
    expect(Array.from(parseSTL(new Uint8Array(buf)).P)).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    expect(() => parseSTL(new TextEncoder().encode('bos'))).toThrow('STL dosyası okunamadı');
  });

  test('kutunun hacmi ve alani', () => {
    const p = parca(new BoxGeometry(10, 20, 30));
    expect(meshVol(p.P, p.I)).toBeCloseTo(6000, 3);
    expect(agOlcu(p.P, p.I).area).toBeCloseTo(2 * (200 + 300 + 600), 3);
  });

  test('govde secimi: varsayilan en buyuk, -1 hepsi', () => {
    const a = parca(new BoxGeometry(1, 1, 1)), b = parca(new BoxGeometry(2, 2, 2));
    const govdeler = [{ P: a.P, I: a.I, vol: 1, name: 'A' }, { P: b.P, I: b.I, vol: 8, name: 'B' }];
    expect(enBuyukGovde(govdeler)).toBe(1);
    const hepsi = govdeAgi(govdeler, -1);
    expect(hepsi.solids).toBe(2);
    expect(hepsi.P.length).toBe(a.P.length + b.P.length);
    expect(hepsi.I[a.I.length]).toBe(b.I[0]! + a.P.length / 3);
  });

  test('minimum kutu dondurulmus kutuyu hizalar', () => {
    const p = parca(new BoxGeometry(100, 20, 10));
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 5);
    const P2 = new Float32Array(p.P.length), v = new Vector3();
    for (let i = 0; i < p.P.length; i += 3) { v.set(p.P[i]!, p.P[i + 1]!, p.P[i + 2]!).applyQuaternion(q); P2[i] = v.x; P2[i + 1] = v.y; P2[i + 2] = v.z; }
    const s = minBox(P2, new Quaternion(), fmtN), b = aabb(P2, s.q);
    const d = [0, 1, 2].map((i) => b.max[i]! - b.min[i]!).sort((x, y) => x - y);
    expect(d[0]).toBeCloseTo(10, 1); expect(d[1]).toBeCloseTo(20, 1); expect(d[2]).toBeCloseTo(100, 1);
    expect(s.mesaj).toMatch(/^Minimum kutu yönü bulundu/);
    expect(minBox(p.P, new Quaternion(), fmtN).mesaj).toBe('Mevcut yön zaten en küçük kutuyu veriyor.');
  });
});

describe('sCompute', () => {
  test('model yok, olcu yok: sonuc yok', () => {
    expect(sCompute({ st: ayar({}), parca: null, rho: 7.85, fmtN }, 0).res).toBeNull();
  });

  test('elle zarf olcusu, blok: pay, 5 mm yuvarlama, standart plaka', () => {
    const { res, alt } = sCompute({ st: ayar({ mx: 100, my: 50, mz: 20, mvol: 50 }), parca: null, rho: 7.85, fmtN }, 0);
    expect(res!.S).toEqual([110, 60, 30]);
    expect(res!.label).toBe('110 × 60 × 30 mm');
    expect(res!.ms).toBeCloseTo(198000 / 1000 * 7.85 / 1000, 6);
    expect(res!.mp).toBeCloseTo(50 * 7.85 / 1000, 6);
    expect(alt!.bar.type).toBe('bar');
  });

  test('elle zarf olcusu, cubuk: standart cap ve boy', () => {
    const { res } = sCompute({ st: ayar({ type: 'bar', mx: 40, my: 40, mz: 100 }), parca: null, rho: 7.85, fmtN }, 0);
    expect(res!.D).toBe(45);
    expect(res!.L).toBe(110);
    expect(res!.label).toBe('Ø45 × 110 mm');
  });

  test('mil modelinde donme ekseni bulunur, yontem torna', () => {
    const p = parca(mil(20, 0, 100));
    const st = ayar({ type: 'bar' }), h = sCompute({ st, parca: p, rho: 7.85, fmtN }, meshVol(p.P, p.I));
    expect(p.autoAi).toBe(1);
    expect(h.geo!.rot).toBe(true);
    expect(h.geo!.method).toBe('turn');
    expect(h.res!.D).toBe(45);
    expect(h.res!.L).toBe(110);
  });

  test('borulu milde ic cap delikten pay dusulerek bulunur', () => {
    const p = parca(mil(20, 8, 100));
    const h = sCompute({ st: ayar({ type: 'tube' }), parca: p, rho: 7.85, fmtN }, meshVol(p.P, p.I));
    expect(h.geo!.thr).toBeGreaterThan(7.5);
    expect(h.res!.ID).toBe(12);
    expect(h.res!.label).toBe('Ø45 × Ø12 × 110 mm');
    expect(h.res!.idBad).toBe(false);
  });

  test('kutu modeli donel degil: freze', () => {
    const p = parca(new BoxGeometry(80, 40, 20));
    const h = sCompute({ st: ayar({}), parca: p, rho: 2.7, fmtN }, meshVol(p.P, p.I));
    expect(h.geo!.method).toBe('mill');
    expect(h.res!.S).toEqual([90, 50, 30]);
  });

  test('CSV: BOM, noktali virgul, fiyat satiri yalniz fiyat varsa', () => {
    const { res } = sCompute({ st: ayar({ mx: 100, my: 50, mz: 20, price: 10 }), parca: null, rho: 7.85, fmtN }, 0);
    const csv = hamCsv(res!, '', 'C45', fmt);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Parça / dosya;Elle\r\n');
    expect(csv).toContain('Hammadde maliyeti (TL/adet);');
    expect(hamCsvAdi('mil ö.step')).toBe('Hammadde_mil_step.csv');
  });
});
