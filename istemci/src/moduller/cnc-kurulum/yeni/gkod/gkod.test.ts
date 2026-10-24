import { Quaternion } from 'three';
import { explainHeid, explainIso, gExplainAll, xyz } from './aciklama.ts';
import { HAM_ORIG, autoBox, boxTxt, gExport, gStockBox, gStockOpts, hamInfo } from './kaynak.ts';
import { degisimZamani, gLocate, gPosAt, gSpeed, izlenenSatirSirasi, satirHareketi, zamanCizelgesi } from './oynatma.ts';
import { gToolInfo, magazineUygula, secimDegistir, type TakimOrtami } from './takim.ts';
import { fmtT, tStation } from '../hesap/gkod.ts';
import { gDonelInit, haritaKur, haritaSifirla, karsilastir, rasterPart, stampMove } from './talas.ts';
import type { Hareket, Program, Takim, TakimBilgisi } from './tipler.ts';
import type { HamSonuc } from '../hesap/ham.ts';

const fmtN = (x: number, d?: number) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const tt = (T: string) => 'T' + T;

function hareket(t: 0 | 1, a: [number, number, number], b: [number, number, number], T: number, dur: number, ln: number): Hareket {
  return { t, a, b, pts: null, ln, T, S: 1000, F: t ? 500 : 0, len: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), dur };
}

function program(moves: Hareket[], ek: Partial<Program> = {}): Program {
  const cum = new Float64Array(moves.length + 1);
  moves.forEach((m, k) => { cum[k + 1] = cum[k]! + m.dur; });
  return {
    heid: false, lines: [], moves, warn: [], wc: {}, toolSet: {}, blk: null, tools: [...new Set(moves.map((m) => m.T))], lathe: false, cum, total: cum[moves.length]!,
    bounds: [0, 0, -5, 50, 50, 10], fbounds: [0, 0, -5, 40, 20, 0], stat: { rapidLen: 0, feedLen: 0, rapidT: 0, feedT: 1, perTool: {} }, ...ek,
  };
}

const freze: TakimBilgisi = { T: 1, src: 'mag', name: 'F10', d: 10, ball: false, lathe: false, id: 'a', z: 0, col: 0, t: null, magT: null };

describe('G-kod aciklamasi', () => {
  test('Heidenhain takim cagrisi, dongu ve yorum', () => {
    const e = explainHeid('5 TOOL CALL 3 Z S4450 F710', tt);
    expect(e).toEqual({ t: 'TAKIM DEĞİŞİMİ → T3 · eksen Z · devir 4450 dev/dk · F 710', k: 'tc', T: '3', simge: 'takim' });
    expect(explainHeid('CYCL DEF 200 DRILLING', tt)).toMatchObject({ t: 'Döngü tanımı 200: Delme', k: 'cy', simge: 'dongu' });
    expect(explainHeid('; --- yorum', tt)).toEqual({ t: '--- yorum', k: 'cm', simge: 'yorum' });
    expect(explainHeid('  Q201=-22 ;DEPTH', tt).t).toBe('Q201 = -22 · Derinlik');
    expect(explainHeid('L  X+10 Y+5 R0 FMAX M3', tt)).toEqual({ t: 'Hızlı hareket → X 10 Y 5 · telafisiz (R0) · M3: İş mili saat yönünde', k: 'rp' });
    expect(explainHeid('C  X+102  Y+40 DR+', tt).t).toBe('Dairesel kesme saat yönü tersine → X 102 Y 40');
  });

  test('ISO takim degisimi, modal hareket ve torna istasyonu', () => {
    const st = {};
    expect(explainIso('T2 M6', false, st, tt)).toMatchObject({ t: 'TAKIM DEĞİŞİMİ → T2', k: 'tc', T: '2', simge: 'takim' });
    expect(explainIso('G1 Z-5 F300', false, st, tt).k).toBe('ft');
    expect(explainIso('Y70', false, st, tt).t).toBe('Doğrusal kesme (önceki satırdan devam) · → Y 70');
    expect(explainIso('T0101', true, {}, tt).T).toBe('1');
    expect(explainIso('(T3 PARMAK FREZE)', false, {}, tt)).toEqual({ t: 'T3 PARMAK FREZE', k: 'cm', simge: 'yorum' });
    expect(explainIso('%', false, {}, tt).k).toBe('pg');
  });

  test('butun program: takim degisimi satirlari', () => {
    const a = gExplainAll(['%', 'T2 M6', 'G0 X0', 'T3 M6'], false, false, tt);
    expect(a.tcl).toEqual([1, 3]);
    expect(xyz('L IX+5.5 Y-2')).toBe('artışlı X 5,5 Y -2');
  });
});

describe('oynatma', () => {
  const p = program([hareket(0, [0, 0, 10], [10, 0, 10], 1, 1, 2), hareket(1, [10, 0, 10], [10, 0, 0], 1, 2, 3), hareket(1, [10, 0, 0], [20, 0, 0], 2, 1, 5)]);
  test('zamandan hareket ve konum', () => {
    expect(gLocate(p, 0.5)).toEqual({ i: 0, f: 0.5 });
    expect(gLocate(p, 2)).toEqual({ i: 1, f: 0.5 });
    expect(gLocate(p, 99)).toEqual({ i: 2, f: 1 });
    expect(gPosAt(p, 1, 0.5)).toEqual([10, 0, 5]);
  });
  test('cizelge takim basina, satirdan harekete', () => {
    expect(zamanCizelgesi(p)).toEqual([{ T: 1, s: 0, e: 3 }, { T: 2, s: 3, e: 4 }]);
    expect(satirHareketi(p, 4)).toBe(2);
    expect(degisimZamani(p, 4)).toBe(3);
    expect(degisimZamani(p, 9)).toBeNull();
    expect(izlenenSatirSirasi([1, 4, 8], 6)).toBe(1);
    expect(izlenenSatirSirasi(null, 6)).toBe(6);
  });
  test('sure bicimi ve hiz', () => {
    expect(fmtT(1.5)).toBe('1:30');
    expect(fmtT(61)).toBe('1:01:00');
    expect(fmtT(NaN)).toBe('0:00');
    expect(gSpeed(p, 'auto')).toBeCloseTo(4 / 45);
    expect(gSpeed(p, '20')).toBeCloseTo(20 / 60);
  });
});

describe('takim eslesmesi', () => {
  const lib: Record<string, Takim> = { m1: { id: 'm1', name: 'Matkap 8,5', kind: 'drill', d: 8.5 }, f1: { id: 'f1', name: 'Freze 16', kind: 'flat', d: 16 }, k1: { id: 'k1', name: 'Kılavuz M10', kind: 'tap', d: 10, cut: { pitch: 1.5 } } };
  const ortam = (ek: Partial<TakimOrtami> = {}): TakimOrtami => ({
    tezgah: { type: 'mill' }, magazin: ['m1', 'empty', 'k1'], heid: false, programTakimlari: [1, 2, 3, 9], secimler: {},
    takimBul: (id) => lib[id] || null, kutuphaneden: (id) => lib[id] || null, tornaTakimi: () => false, ...ek,
  });
  test('cep, bos cep, olmayan cep, isimle cagri', () => {
    const m = gToolInfo(1, ortam());
    expect(m).toMatchObject({ src: 'mag', name: 'Matkap 8,5', d: 8.5, cone: 0.6009, col: 0 });
    expect(gToolInfo(2, ortam()).src).toBe('empty');
    expect(gToolInfo(9, ortam())).toMatchObject({ src: 'nopocket', d: 10, name: 'T9', col: 3 });
    expect(gToolInfo('ALIN', ortam()).src).toBe('name');
    expect(gToolInfo(3, ortam()).cutD).toBeCloseTo(10 - 1.0825 * 1.5);
  });
  test('elle secim ve cap; magazine uygulama', () => {
    const secimler = {};
    secimDegistir(secimler, 2, 'id', 'f1', null);
    expect(gToolInfo(2, ortam({ secimler })).src).toBe('ov');
    secimDegistir(secimler, 2, 'd', '16', 16);
    expect(secimler).toEqual({ 2: { id: 'f1' } });
    secimDegistir(secimler, 2, 'd', '12', 16);
    expect(gToolInfo(2, ortam({ secimler }))).toMatchObject({ d: 12, dOv: true });
    const mag = ['m1', 'empty', 'k1'];
    expect(magazineUygula(secimler, mag, (T) => T)).toBe(1);
    expect(mag[1]).toBe('f1');
    expect(secimler).toEqual({ 2: { d: 12 } });
    secimDegistir(secimler, 2, 'id', '', null);
    expect(secimler).toEqual({});
  });
  test('torna istasyonu', () => {
    expect(tStation(101, { type: 'lathe' }, false)).toBe(1);
    expect(tStation(101, { type: 'mill' }, false)).toBe(101);
    expect(tStation(101, { type: 'lathe' }, true)).toBe(101);
  });
});

describe('ham kaynaklari', () => {
  const blok = { ok: true, dim: [100, 50, 20], ctr: [0, 0, 0], type: 'block', tube: false, S: [110, 60, 30], Vs: 0, label: '110 × 60 × 30 mm', rho: 7.85, Vp: 0, ms: 0, mp: 0, mc: 0, ratio: 0, qty: 1, price: 0 } as HamSonuc;
  test('program sifiri secenekleri', () => {
    expect(hamInfo(blok, 'tlf', null)).toMatchObject({ x0: 0, y0: 0, z0: -30, x1: 110, y1: 60, z1: 0, src: 'ham' });
    expect(hamInfo(blok, 'tc', 'a.step')).toMatchObject({ x0: -55, y1: 30, z1: 0, file: 'a.step' });
    expect(hamInfo(blok, 'bc', null)).toMatchObject({ z0: 0, z1: 30 });
    expect(hamInfo(null, 'tlf', null)).toBeNull();
    expect(Object.keys(HAM_ORIG)).toEqual(['tlf', 'tc', 'blf', 'bc', 'cad']);
  });
  test('otomatik kutu, secim ve geri dusme', () => {
    const p = program([hareket(1, [0, 0, 0], [40, 20, -5], 1, 1, 0)]);
    const oto = autoBox(p, () => freze)!;
    expect(oto).toEqual({ x0: -5, y0: -5, z0: -10, x1: 45, y1: 25, z1: 0, src: 'auto' });
    const o = gStockOpts(p, null, oto, null);
    expect(o.man).toMatchObject({ x0: -5, src: 'man' });
    expect(gStockBox(o, 'ham').kullanilan).toBe('auto');
    expect(gStockBox(gStockOpts({ ...p, blk: { min: { x: 0, y: 0, z: -30 }, max: { x: 120, y: 80, z: 0 } } }, null, oto, null), 'ham').kullanilan).toBe('blk');
    expect(boxTxt(oto, fmtN)).toBe('50 × 30 × 10 mm');
    expect(boxTxt(null, fmtN)).toBe('—');
  });
  test('gsim ozeti istasyona gore toplanir', () => {
    const p = program([], { stat: { rapidLen: 0, feedLen: 0, rapidT: 0, feedT: 3, perTool: { 101: { len: 100, t: 1, n: 1, S: 900 }, 102: { len: 300, t: 2, n: 1, S: 900 } } } });
    const oz = gExport(p, 't1', () => freze, (T) => Math.floor((T as number) / 100));
    expect(Object.keys(oz.perTool)).toEqual(['1']);
    expect(oz.perTool['1']).toMatchObject({ t: 3, F: (100 + 300) / 3 });
  });
});

describe('talas haritasi', () => {
  const sb = { x0: 0, y0: 0, z0: -10, x1: 24, y1: 24, z1: 0, src: 'man' as const };
  test('duz freze ham yuzeyden talas kaldirir, hizli hareket temas kaydeder', () => {
    const hm = haritaKur(sb, null);
    expect(hm.NX).toBe(241);
    stampMove(hm, hareket(1, [0, 12, -2], [24, 12, -2], 1, 1, 7), freze);
    expect(hm.H[120 * hm.NX + 120]).toBeCloseTo(-2);
    expect(hm.H[0]).toBe(0);
    stampMove(hm, hareket(0, [0, 2, -1], [24, 2, -1], 1, 1, 9), freze);
    expect(hm.coll).toEqual([{ ln: 9, z: -1 }]);
    haritaSifirla(hm);
    expect(hm.H[120 * hm.NX + 120]).toBe(0);
    expect(hm.coll).toEqual([]);
  });
  test('yarim hareket yalniz kesilen kismi damgalar', () => {
    const hm = haritaKur(sb, null);
    stampMove(hm, { ...hareket(1, [0, 12, -2], [24, 12, -2], 1, 1, 0), pts: new Float32Array([12, 12, -2, 24, 12, -2]) }, freze, 0.5);
    expect(hm.H[120 * hm.NX + 60]).toBeCloseTo(-2);
    expect(hm.H[120 * hm.NX + 230]).toBe(0);
  });
  test('parca karsilastirmasi: dalma ve fazla malzeme', () => {
    const hm = haritaKur(sb, null);
    // ustu z=-3'te duz parca
    const P = new Float32Array([0, 0, -3, 24, 0, -3, 24, 24, -3, 0, 24, -3]), I = new Uint32Array([0, 1, 2, 0, 2, 3]);
    rasterPart(hm, P, I, new Quaternion(), [0, 0, 0]);
    expect(karsilastir(hm)).toMatchObject({ gouge: 0, left: hm.H.length });
    stampMove(hm, hareket(1, [0, 12, -5], [24, 12, -5], 1, 1, 0), freze);
    const c = karsilastir(hm);
    expect(c.gouge).toBeGreaterThan(0);
    expect(c.gmax).toBeCloseTo(2);
  });
  test('donel ham baslangic yuzeyi', () => {
    const hm = { sb: { ...sb, z0: -20, z1: 0 }, NX: 3, NY: 3, cx: 12, cy: 12 };
    const out = gDonelInit({ mode: 'A', c: [12, 12], prof: [[0, 5], [10, 20]] }, hm);
    expect(out[4]).toBe(-0);
    expect(out[0]).toBe(-10);
  });
});
