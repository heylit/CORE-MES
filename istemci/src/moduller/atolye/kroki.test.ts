import { describe, expect, it } from 'vitest';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import {
  cizgileriCikar, dondur, eksenOturt, hizalamaYuvarla, ilkHizalama, kutuyaYapis, noktayaTasi, noktayaYapis, olcekAyarla, ters, uygula, uzaklik,
  yapismaVerisiKur,
} from './kroki.ts';
import type { Hizalama } from './kroki.ts';
import { eksenKutusu, istasyonCiz, ogeCiz, taslakKur } from './duzenleyici-durumu.ts';

const yakin = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

describe('kroki hizalaması', () => {
  const h: Hizalama = { olcek: 0.05, donus: 30, x: 4, z: -2 };

  it('dönüşüm ve tersi birbirini götürür; SVG sırasıyla aynı (önce ölçek, sonra dönüş, sonra öteleme)', () => {
    const p = { u: 120, v: -35 };
    const n = uygula(h, p);
    const q = ters(h, n);
    expect(q.u).toBeCloseTo(p.u, 6);
    expect(q.v).toBeCloseTo(p.v, 6);
    yakin(uygula({ olcek: 2, donus: 90, x: 1, z: 1 }, { u: 1, v: 0 }), { x: 1, z: 3 });
  });

  it('hizalanmamış kroki salona sığar ve ortalanır', () => {
    const i = ilkHizalama({ g: 1190, y: 842 }, { g: 52, d: 24 });
    const sol = uygula(i, { u: 0, v: 0 });
    const sag = uygula(i, { u: 1190, v: 842 });
    expect(sag.x - sol.x).toBeLessThanOrEqual(52 + 1e-9);
    expect(sag.z - sol.z).toBeCloseTo(24, 6);
    expect(sol.x + sag.x).toBeCloseTo(52, 6);
  });

  it('ölçek: iki nokta arası bilinen uzunluğa getirilir, ilk nokta yerinde kalır', () => {
    const pa = { u: 10, v: 10 };
    const pb = { u: 210, v: 10 };
    const a = uygula(h, pa);
    const b = uygula(h, pb);
    const y = olcekAyarla(h, a, b, 12);
    yakin(uygula(y, pa), a);
    expect(uzaklik(uygula(y, pa), uygula(y, pb))).toBeCloseTo(12, 6);
  });

  it('yön: duvar en yakın eksene en küçük açıyla oturur; konum: nokta salonun köşesine taşınır', () => {
    const pa = { u: 0, v: 0 };
    const pb = { u: 100, v: 3 };
    const y = eksenOturt(h, uygula(h, pa), uygula(h, pb));
    const a = uygula(y, pa);
    const b = uygula(y, pb);
    expect(b.z - a.z).toBeCloseTo(0, 6);
    expect(b.x).toBeGreaterThan(a.x);
    // Dikeye yakın duvar dikey olur (yatay yapılmaz).
    const d = { ...h, donus: 0 };
    const yd = eksenOturt(d, uygula(d, { u: 0, v: 0 }), uygula(d, { u: 2, v: 100 }));
    expect(uygula(yd, { u: 2, v: 100 }).x - uygula(yd, { u: 0, v: 0 }).x).toBeCloseTo(0, 6);
    const k = uygula(h, { u: 50, v: 50 });
    yakin(uygula(noktayaTasi(h, k), { u: 50, v: 50 }), { x: 0, z: 0 });
    yakin(uygula(dondur(h, k, 90), { u: 50, v: 50 }), k);
  });

  it('kayıt duyarlığı: dönüş [0, 360), konum milimetre', () => {
    expect(hizalamaYuvarla({ olcek: 0.035277777777, donus: -0.004, x: 1.23456, z: 2 })).toEqual({ olcek: 0.0352777778, donus: 0, x: 1.235, z: 2 });
  });
});

describe('PDF çizgileri', () => {
  const K = { save: 10, restore: 11, transform: 12, constructPath: 91, endPath: 28, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
  const Y = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };
  const STROKE = 20;
  // pdf.js görünümü: y yukarı PDF'ten y aşağı sayfaya (sayfa boyu 100).
  const TABAN = [1, 0, 0, -1, 0, 100];

  it('dikdörtgen, dönüşüm yığını ve form; eğri ve kırpma yolu alınmaz', () => {
    const yol = (...d: number[]) => [STROKE, [new Float32Array(d)], null];
    const fn = [K.constructPath, K.save, K.transform, K.constructPath, K.restore, K.constructPath, K.paintFormXObjectBegin, K.constructPath, K.paintFormXObjectEnd, K.constructPath];
    const args = [
      yol(Y.moveTo, 0, 0, Y.lineTo, 10, 0, Y.lineTo, 10, 10, Y.closePath),
      null,
      [2, 0, 0, 2, 5, 5],
      yol(Y.moveTo, 0, 0, Y.lineTo, 1, 0, Y.curveTo, 1, 1, 2, 2, 3, 3, Y.lineTo, 3, 4),
      null,
      [K.endPath, [new Float32Array([Y.moveTo, 0, 0, Y.lineTo, 50, 50])], null],
      [[1, 0, 0, 1, 20, 0], null],
      yol(Y.moveTo, 0, 0, Y.lineTo, 0, 5),
      null,
      [STROKE, [null], null],
    ];
    const c = Array.from(cizgileriCikar(fn, args, K, Y, TABAN));
    expect(c).toEqual([
      0, 100, 10, 100, 10, 100, 10, 90, 10, 90, 0, 100,
      5, 95, 7, 95, 11, 89, 11, 87,
      20, 100, 20, 95,
    ]);
  });
});

describe('krokiye yapışma', () => {
  // Salonda 10 x 6 m'lik bir oda çizgisi ve ortada kısa bir tarama çizgisi (yapışmaya girmez).
  const h: Hizalama = { olcek: 0.1, donus: 0, x: 0, z: 0 };
  const parcalar = new Float32Array([0, 0, 100, 0, 100, 0, 100, 60, 100, 60, 0, 60, 0, 60, 0, 0, 50, 30, 50.2, 30.2]);
  const v = yapismaVerisiKur(parcalar, h);

  it('nokta önce çizgi ucuna, yoksa eksenlere ayrı ayrı yapışır; tolerans dışında yapışmaz', () => {
    expect(noktayaYapis(v, { x: 9.8, z: 0.15 }, 0.3)).toMatchObject({ tur: 'nokta', nokta: { x: 10, z: 0 } });
    const e = noktayaYapis(v, { x: 9.85, z: 3 }, 0.3);
    expect(e.tur).toBe('eksen');
    expect(e.nokta.x).toBeCloseTo(10);
    expect(e.nokta.z).toBe(3);
    expect(noktayaYapis(v, { x: 5, z: 3 }, 0.3).tur).toBeNull();
    expect(v.dikey).toHaveLength(2);
    expect(v.yatay).toHaveLength(2);
  });

  it('öğenin kenarı yakındaki paralel duvara kayar; uzaktaki duvara kaymaz', () => {
    const y = kutuyaYapis(v, { x0: 0.12, x1: 2.12, z0: 2, z1: 3 }, 0.25);
    expect(y.dx).toBeCloseTo(-0.12);
    expect(y.kilavuzX).toBeCloseTo(0);
    expect(y.dz).toBe(0);
    // Çizgi kutunun yanında değilse (z aralığı dışı) yapışmaz.
    expect(kutuyaYapis(v, { x0: 9.9, x1: 11, z0: 8, z1: 9 }, 0.25).dx).toBe(0);
  });
});

describe('çizerek ekleme', () => {
  const y = {
    salon: { id: 1, kod: 'S1', ad: 'Deneme', genislik: '40.00', derinlik: '24.00', hucreBoyu: '4.00', surum: 1, giris: null, fabrika: { x: '0.00', z: '0.00', donus: '0.0' }, kaydeden: { id: 1, ad: null }, kaydedildi: '', sutunlar: [], satirlar: [] },
    istasyonYerleri: [], makineYerleri: [], raflar: [], alanlar: [], duvarlar: [], gecisler: [],
  } as YerlesimCevabi;

  it('raf uzun kenarı boyunca yatar; bölme sayısı olağan bölme genişliğinden; dikey çizim 90°', () => {
    const t = taslakKur(y);
    const r = ogeCiz(t, 'raf_palet', { x: 2, z: 5 }, { x: 10.2, z: 6.1 });
    const raf = r?.taslak.raflar[0];
    expect(raf).toMatchObject({ x: 6.1, z: 5.55, donus: 0, bolmeSayisi: 3, bolmeGenisligi: 2.73, derinlik: 1.1 });
    const d = ogeCiz(t, 'raf_palet', { x: 2, z: 2 }, { x: 3.1, z: 10.2 })?.taslak.raflar[0];
    expect(d).toMatchObject({ donus: 90, bolmeSayisi: 3, derinlik: 1.1 });
    // Bölme genişliği santimetreye yuvarlanır: raf boyu çizimden en çok bölme sayısı x 0,5 cm sapar.
    const k = r ? eksenKutusu(r.taslak, r.anahtar) : null;
    expect(k?.x0).toBeCloseTo(2, 1);
    expect(k?.x1).toBeCloseTo(10.2, 1);
    expect(k?.z0).toBeCloseTo(5, 6);
    const dr = ogeCiz(t, 'raf_palet', { x: 2, z: 2 }, { x: 3.1, z: 10.2 });
    const dk = dr ? eksenKutusu(dr.taslak, dr.anahtar) : null;
    expect(dk?.x0).toBeCloseTo(2, 6);
    expect(dk?.x1).toBeCloseTo(3.1, 6);
  });

  it('alan ve istasyon çizilen ölçüyle; duvar çizgiyle; çok küçük çizim öğe olmaz', () => {
    const t = taslakKur(y);
    expect(ogeCiz(t, 'bolge', { x: 1, z: 1 }, { x: 5, z: 4 })?.taslak.alanlar[0]).toMatchObject({ x: 3, z: 2.5, genislik: 4, derinlik: 3 });
    expect(ogeCiz(t, 'duvar', { x: 1, z: 1 }, { x: 6, z: 1 })?.taslak.duvarlar[0]).toMatchObject({ basX: 1, basZ: 1, sonX: 6, sonZ: 1 });
    expect(ogeCiz(t, 'bolge', { x: 1, z: 1 }, { x: 1.1, z: 4 })).toBeNull();
    const i = istasyonCiz(t, { id: 9, kod: 'CNC-09', ad: 'Deneme', tip: 'talasli', aktif: true, isMerkeziId: 1 }, { x: 4, z: 4 }, { x: 7.5, z: 6.6 });
    expect(i?.taslak.istasyonlar[0]).toMatchObject({ x: 5.75, z: 5.3, genislik: 3.5, derinlik: 2.6 });
  });
});
