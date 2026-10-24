import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bitAc, bitPaketle, capIsaretiMi, duzyaziMi, glifDuzelt, kelimeAyikla, kelimeKutusu, murekkep, ocrDuzelt, olcuBirlestir, olcuOnerileri, tabloBul,
  yaziMaskele, type MetinOgesi, type OlcuListesi,
} from './okuma.ts';

// Eski okuma modülleri (pdf-okuma.ts, ocr.ts, pdf.ts) gerçek haliyle yüklenir; kitaplık yükleyicisi ve tema okuyucusu sahtedir. Girdiler
// uydurma ölçü yazıları ve sentetik mürekkep haritasıdır (gerçek çizim yok); aynı tohumla üretilen yüzlerce sayfada çıktı birebir aynı olmalı.
vi.mock('../../../../../../arkon/web/src/app/temel.ts', () => ({ perf: () => {} }));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({
  FILES: null, LS: { get: () => null, set: () => {} }, loadModule: () => Promise.reject(new Error('yok')), libBin: () => Promise.reject(new Error('yok')),
  loadLib: () => Promise.reject(new Error('yok')), tick: () => Promise.resolve(),
}));
vi.mock('../../../../../../arkon/web/src/app/ortak-ayarlar.ts', () => ({ cssv: () => '', rgbOf: () => [0, 0, 0] }));

type Eski = Record<string, (...a: never[]) => unknown>;
let okuma: Eski, ocr: Eski, pdf: Eski;
beforeAll(async () => {
  const kok = '../../../../../../arkon/web/src/app/';
  okuma = (await import(/* @vite-ignore */ `${kok}pdf-okuma.ts`)) as Eski;
  ocr = (await import(/* @vite-ignore */ `${kok}ocr.ts`)) as Eski;
  pdf = (await import(/* @vite-ignore */ `${kok}pdf.ts`)) as Eski;
});
const cagir = <T>(m: Eski, ad: string, ...a: unknown[]): T => (m[ad] as unknown as (...x: unknown[]) => T)(...a);

// Tohumlu rastgele (mulberry32): her koşuda aynı sayfalar.
function rastgele(tohum: number) {
  let t = tohum >>> 0;
  const r = () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  return { r, sec: <T>(l: readonly T[]): T => l[Math.floor(r() * l.length)]!, arasi: (a: number, b: number) => a + r() * (b - a) };
}
const OLCULER = ['Ø40 H7', '18 ±0.05', 'M8x1.25', 'R5', '45°', '1x45°', 'C1', '(150)', '12 MAX', 'Ø25 H7/g6', '6x Ø16 THRU', 'Ra 1.6', '⌖ Ø0.05 A B',
  '30°30\'', '120', '7', 'Ø60', 'SR12', '3 PLCS', '25', '⏥ 0.02'];
const ANTET = ['MALZEME', 'ÖLÇEK', 'TARİH', 'REV.', 'ÇİZEN', 'KONTROL', 'PAFTA', 'AĞIRLIK', 'PARÇA NO'];
const DUZYAZI = ['Keskin kenarlar kırılacak', 'Yüzeyler temizlenecek ve yağlanacak', '1. Çapaklar alınacak sonra boyanacak'];

function sayfa(tohum: number, ocrKip: boolean) {
  const { r, sec, arasi } = rastgele(tohum);
  const W = 900 + Math.floor(r() * 300), H = 640 + Math.floor(r() * 200), ink = new Uint8Array(W * H);
  const items: MetinOgesi[] = [];
  const ekle = (s: string, x: number, y: number, h: number, a = 0, font?: string) => {
    const o: MetinOgesi = { s, x, y, h, a, w: r() < 0.2 ? 0 : h * 0.55 * s.length, ...(font ? { font } : {}) };
    if (ocrKip) o.conf = Math.round(arasi(40, 99));
    items.push(o);
  };
  for (let i = 0; i < 6 + Math.floor(r() * 14); i++) {
    const s = sec(OLCULER), x = arasi(60, W - 200), y = arasi(60, H - 120), h = sec([10, 11, 12, 14]), a = r() < 0.25 ? -Math.PI / 2 : 0;
    // Ölçü çizgisi: yazının altında düz çizgi (bazen).
    if (r() < 0.6 && a === 0) for (let k = Math.floor(x - 4); k < x + h * 0.55 * s.length + 6 && k < W; k++) ink[Math.round(y + h * 0.3) * W + k] = 1;
    // Bazen parçalı yazılır (iki öğe yan yana).
    if (r() < 0.3 && s.includes(' ')) { const [b, ...son] = s.split(' '); ekle(b!, x, y, h, a); ekle(son.join(' '), x + h * 0.55 * (b!.length + 0.6), y, h, a); } else ekle(s, x, y, h, a);
    // İstifli tolerans.
    if (r() < 0.2 && a === 0) { const u = x + h * 0.55 * s.length + 2; ekle('+0.02', u, y - h * 0.45, h * 0.6); ekle('-0.01', u, y + h * 0.2, h * 0.6); }
  }
  // Antet: tablo çizgileri ve anahtar kelimeler.
  if (r() < 0.7) {
    const x0 = W - 320, y0 = H - 150;
    for (let j = 0; j < 4; j++) for (let k = x0; k < W - 30; k++) ink[(y0 + j * 30) * W + k] = 1;
    for (let j = 0; j < 4; j++) { ekle(sec(ANTET), x0 + 8, y0 + j * 30 + 18, 9); ekle(String(Math.floor(arasi(1, 99))), x0 + 150, y0 + j * 30 + 18, 9); }
  }
  if (r() < 0.5) { const y0 = arasi(60, H / 2); ekle('NOTLAR:', 40, y0, 11); DUZYAZI.forEach((s, i) => ekle(s, 40, y0 + 16 * (i + 1), 10)); }
  if (r() < 0.5) ['A', 'B', 'C', '1', '2'].forEach((s, i) => ekle(s, i % 2 ? 8 : W - 8, 100 + i * 90, 10));
  if (r() < 0.3) ekle('n40', arasi(80, W - 200), arasi(80, H - 200), 12, 0, 'GDT-symbol');
  if (r() < 0.2) ekle('' + '12', arasi(80, W - 200), arasi(80, H - 200), 12);
  return { items, W, H, ink, cls: sec(['f', 'm', 'c']), ex: r() < 0.3 ? { prose: false, notes: r() < 0.5 } : {}, auto: sec(['high', 'mid', 'low'] as const) };
}
const duz = (l: OlcuListesi | unknown[] & { stats?: unknown; diag?: unknown }) => JSON.parse(JSON.stringify({ l: [...l], st: l.stats, d: l.diag })) as unknown;

describe('PDF ölçü okuma (eskisiyle aynı)', () => {
  it('yüzlerce sentetik sayfada öneriler, istatistik ve tanı aynı', () => {
    let toplam = 0;
    for (let tohum = 1; tohum <= 240; tohum++) {
      const ocrKip = tohum % 3 === 0, s = sayfa(tohum, ocrKip);
      const opt = { w: s.W, h: s.H, ink: tohum % 5 === 0 ? null : s.ink, ocr: ocrKip, ex: s.ex, auto: s.auto, diag: tohum % 2 === 0 };
      const yeni = olcuOnerileri(structuredClone(s.items), s.cls, opt);
      const eski = cagir<OlcuListesi>(okuma, 'pdfDims', structuredClone(s.items), s.cls, opt);
      expect(duz(yeni), `tohum ${tohum}`).toEqual(duz(eski));
      toplam += yeni.length;
    }
    expect(toplam).toBeGreaterThan(500);
  });
  it('seçeneksiz çağrı ve boş girdi', () => {
    const s = sayfa(7, false);
    expect(duz(olcuOnerileri(s.items, 'm'))).toEqual(duz(cagir(okuma, 'pdfDims', s.items, 'm')));
    expect(duz(olcuOnerileri([], 'm', { diag: true }))).toEqual(duz(cagir(okuma, 'pdfDims', [], 'm', { diag: true })));
  });
  it('glif, düz yazı, tablo ve mürekkep', () => {
    for (const [s, f] of [['n40', 'GDT'], ['12', ''], ['abc\u0003', 'Arial'], ['j0.05', 'amgdt']] as const) {
      expect(glifDuzelt(s, f)).toBe(cagir(okuma, 'fixGlyphs', s, f));
    }
    for (const s of [...DUZYAZI, ...OLCULER, 'THRU BOYDAN', 'Derinlik 12 delik']) expect(duzyaziMi(s)).toBe(cagir(okuma, 'isProse', s));
    for (let t = 1; t <= 20; t++) { const s = sayfa(t, false); expect(tabloBul(s.ink, s.W, s.H)).toEqual(cagir(okuma, 'findTables', s.ink, s.W, s.H)); }
    expect(tabloBul(null, 10, 10)).toEqual([]);
    const { r } = rastgele(3), w = 61, h = 47, data = new Uint8ClampedArray(w * h * 4).map(() => Math.floor(r() * 256));
    expect(murekkep({ data, width: w, height: h })).toEqual(cagir(okuma, 'inkOf', { data, width: w, height: h }));
  });
});

describe('OCR düzeltmeleri (eskisiyle aynı)', () => {
  it('yazı düzeltme', () => {
    for (const s of ['O40', '@25', 'RS', 'RO.4', 'MB', '1O5', '£0.1', '+05', '"Ø12"', '45o', '1l2', 'C1', 'ABC', 'Ølz', '0S', 'R12345678']) {
      expect(ocrDuzelt(s), s).toBe(cagir(ocr, 'ocrFix', s));
    }
  });
  it('çap işareti, kelime kutusu, ayıklama ve maske', () => {
    const { r, arasi } = rastgele(11);
    for (let t = 0; t < 40; t++) {
      const W = 40, H = 30, bin = new Uint8Array(W * H).map(() => (r() < 0.35 ? 1 : 0));
      const k = [Math.floor(arasi(0, 20)), Math.floor(arasi(0, 15)), Math.floor(arasi(10, 39)), Math.floor(arasi(8, 29))] as const;
      expect(capIsaretiMi(bin, W, H, ...k)).toBe(cagir(ocr, 'looksDia', bin, W, H, ...k));
    }
    // Halka ve çapraz çizgi: iki çapraz delik.
    const W = 20, H = 20, ring = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 10, y - 10); if ((d > 6 && d < 8.5) || Math.abs(x - (20 - y)) < 1.2) ring[y * W + x] = 1; }
    expect(capIsaretiMi(ring, W, H, 1, 1, 18, 18)).toBe(cagir(ocr, 'looksDia', ring, W, H, 1, 1, 18, 18));
    const kelimeler = Array.from({ length: 60 }, () => ({ s: r() < 0.5 ? 'Ø' + Math.floor(arasi(1, 99)) : 'abc', x: arasi(0, 200), y: arasi(0, 200), h: arasi(8, 20), a: r() < 0.3 ? -Math.PI / 2 : 0, w: arasi(10, 60), conf: arasi(30, 99) }));
    for (const o of kelimeler.slice(0, 10)) expect(kelimeKutusu(o)).toEqual(cagir(ocr, 'wordBox', o));
    expect(kelimeAyikla(structuredClone(kelimeler))).toEqual(cagir(ocr, 'dedupeWords', structuredClone(kelimeler)));
    const g1 = { data: new Uint8ClampedArray(120 * 80 * 4), width: 120, height: 80 }, g2 = { ...g1, data: new Uint8ClampedArray(120 * 80 * 4) };
    yaziMaskele(g1, kelimeler, 10, 5, 0.5); cagir(ocr, 'maskText', g2, kelimeler, 10, 5, 0.5);
    expect(Array.from(g1.data)).toEqual(Array.from(g2.data));
    expect(g1.data.some((v) => v === 255)).toBe(true);
  });
});

describe('Birleştirme ve bit paketleme (eskisiyle aynı)', () => {
  it('metin ve OCR ölçüleri birleşir; mürekkep bitleri geri açılır', () => {
    const a = olcuOnerileri(sayfa(4, false).items, 'm', { w: 1000, h: 800 }), b = olcuOnerileri(sayfa(5, true).items, 'm', { w: 1000, h: 800, ocr: true });
    const bst = { table: 2, notes: 1 };
    expect(duz(olcuBirlestir(a, b, 1000, bst))).toEqual(duz(cagir(pdf, 'mergeDims', a, b, 1000, bst)));
    const { r } = rastgele(9), bits = new Uint8Array(1003).map(() => (r() < 0.4 ? 1 : 0));
    const p = bitPaketle(bits);
    expect(p).toEqual(cagir(pdf, 'packBits', bits));
    expect(bitAc(p, bits.length)).toEqual(bits);
  });
});
