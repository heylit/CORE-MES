import { describe, expect, it } from 'vitest';
import { balonDizimi, balonYaricapi, kilavuzCizgisi, siraKoruyanEsleme, type DizilecekBalon } from './balon-dizimi.ts';
import { kutuNoktasi } from './kurallar.ts';
import type { YaziKutusu } from './okuma.ts';

const W = 1000, H = 707;
// Yazı boyu 10 birim: yarı yükseklik 6,2.
const kutu = (x: number, y: number, hw = 20, a = 0): YaziKutusu => [x, y, hw, 6.2, a];
const balon = (id: number, x: number, y: number, ar?: YaziKutusu, ek: Partial<DizilecekBalon> = {}): DizilecekBalon => ({ id, x, y, ...(ar ? { ar } : {}), ...ek });

function maske(cizgiler: readonly [number, number, number, number][]): Uint8Array {
  const m = new Uint8Array(W * H);
  for (const [x1, y1, x2, y2] of cizgiler) {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    for (let i = 0; i <= n; i++) m[Math.round(y1 + (y2 - y1) * i / n) * W + Math.round(x1 + (x2 - x1) * i / n)] = 1;
  }
  return m;
}
const yaziyaDeger = (ar: YaziKutusu, x: number, y: number, R: number) => { const p = kutuNoktasi(ar, x, y); return Math.hypot(p[0] - x, p[1] - y) < R; };

describe('balon yarıçapı', () => {
  it('yazı yüksekliğinden gelir ve ayar çarpanıyla büyür', () => {
    const b = [balon(1, 0, 0, kutu(100, 100)), balon(2, 0, 0, kutu(200, 100)), balon(3, 0, 0, kutu(300, 100))];
    expect(balonYaricapi(b, W, 1)).toBeCloseTo(11, 5);
    expect(balonYaricapi(b, W, 1.5)).toBeCloseTo(16.5, 5);
  });
  it('yazısı bilinmeyen resimde sayfa genişliğinin binde 16sı, sınırlar içinde', () => {
    expect(balonYaricapi([balon(1, 0, 0)], W, 1)).toBe(16);
    expect(balonYaricapi([balon(1, 0, 0, [0, 0, 5, 200, 0])], W, 1.5)).toBe(24);
    expect(balonYaricapi([balon(1, 0, 0, [0, 0, 5, 0.1, 0])], W, 0.8)).toBe(6);
  });
});

describe('balon dizimi', () => {
  it('boş listede boş döner', () => {
    expect(balonDizimi([], { W, H, carpan: 1, kip: 'karma' }).pos).toEqual({});
  });

  it('balon hiçbir yazıya ve çizgiye binmez, balonlar birbirine binmez', () => {
    const ar = [kutu(300, 300), kutu(345, 300), kutu(300, 330), kutu(345, 330), kutu(600, 200, 25, -Math.PI / 2)];
    const ink = maske([[200, 315, 450, 315], [322, 250, 322, 380], [560, 150, 560, 260], [250, 280, 420, 280]]);
    const d = balonDizimi(ar.map((a, i) => balon(i + 1, a[0], a[1], a)), { W, H, carpan: 1, kip: 'yakin', ink, yazilar: [kutu(500, 500)] });
    const yer = Object.values(d.pos);
    expect(yer).toHaveLength(5);
    for (const p of yer) {
      for (const a of [...ar, kutu(500, 500)]) expect(yaziyaDeger(a, p.x, p.y, d.R)).toBe(false);
      for (let k = 0; k < 16; k++) {
        const x = Math.round(p.x + Math.cos(k * Math.PI / 8) * d.R * 0.9), y = Math.round(p.y + Math.sin(k * Math.PI / 8) * d.R * 0.9);
        expect(ink[y * W + x]).toBe(0);
      }
    }
    for (let i = 0; i < yer.length; i++) for (let j = i + 1; j < yer.length; j++) expect(Math.hypot(yer[i]!.x - yer[j]!.x, yer[i]!.y - yer[j]!.y)).toBeGreaterThanOrEqual(2 * d.R);
  });

  it('hücreden uzun, döndürülmüş ve sayfa dışına taşan yazılar da sayılır: balon onlara binmez', () => {
    const uzun = [kutu(500, 350, 260, 0.6), kutu(500, 350, 240, -0.9), kutu(-10, 200, 60), kutu(1005, 400, 40, Math.PI / 2)];
    const ar = [kutu(420, 300), kutu(580, 300), kutu(30, 230), kutu(960, 420)];
    for (const kip of ['karma', 'yakin', 'serit'] as const) {
      const d = balonDizimi(ar.map((a, i) => balon(i + 1, a[0], a[1], a)), { W, H, carpan: 1, kip, yazilar: uzun });
      for (const p of Object.values(d.pos)) if (p.yer !== 'sabit') for (const a of uzun) expect(yaziyaDeger(a, p.x, p.y, d.R)).toBe(false);
    }
  });

  it('elle konan balon yerinde kalır, öteki ondan kaçar', () => {
    const a = kutu(400, 400);
    const d = balonDizimi([balon(1, 0, 0, a, { yer: [400, 375] }), balon(2, 0, 0, kutu(400, 420))], { W, H, carpan: 1, kip: 'karma' });
    expect(d.pos[1]).toMatchObject({ x: 400, y: 375, yer: 'sabit' });
    expect(Math.hypot(d.pos[2]!.x - 400, d.pos[2]!.y - 375)).toBeGreaterThanOrEqual(2 * d.R);
  });

  it('kenar şeridinde aynı kenardaki kılavuzlar kesişmez ve sıra yazı sırasıdır', () => {
    const ar = [kutu(300, 120), kutu(250, 130), kutu(420, 110), kutu(380, 140)];
    const d = balonDizimi(ar.map((a, i) => balon(i + 1, a[0], a[1], a)), { W, H, carpan: 1, kip: 'serit' });
    const p = [1, 2, 3, 4].map((i) => d.pos[i]!);
    expect(p.every((q) => q.yer === 'serit')).toBe(true);
    // Hepsi üst kenara gider; x sırası yazının x sırasıdır (2, 1, 4, 3).
    expect(new Set(p.map((q) => Math.round(q.y))).size).toBe(1);
    const sira = [2, 1, 4, 3].map((i) => d.pos[i]!.x);
    expect([...sira].sort((x, y) => x - y)).toEqual(sira);
  });

  it('tek balon şeride zorlanır, ötekiler yakında kalır', () => {
    const d = balonDizimi([balon(1, 0, 0, kutu(500, 350), { yerKipi: 'serit' }), balon(2, 0, 0, kutu(300, 350))], { W, H, carpan: 1, kip: 'karma' });
    expect(d.pos[1]!.yer).toBe('serit');
    expect(d.pos[2]!.yer).toBe('yakin');
  });

  it('antet bölgesine balon konmaz', () => {
    const yasak = [{ x0: 690, y0: 600, x1: 1000, y1: 707 }];
    const d = balonDizimi([balon(1, 0, 0, kutu(800, 590))], { W, H, carpan: 1, kip: 'yakin', yasak });
    const p = d.pos[1]!;
    expect(p.x > 690 - d.R && p.y > 600 - d.R).toBe(false);
  });
});

describe('kılavuz ve eşleme', () => {
  it('kılavuz balonun kenarından yazının en yakın noktasına gider', () => {
    const l = kilavuzCizgisi({ x: 0, y: 0, ar: kutu(100, 100) }, 100, 40, 10)!;
    expect(l[0]).toBeCloseTo(100); expect(l[1]).toBeCloseTo(50); expect(l[2]).toBeCloseTo(100); expect(l[3]).toBeCloseTo(93.8);
    expect(kilavuzCizgisi({ x: 0, y: 0, ar: kutu(100, 100) }, 100, 85, 10)).toBeNull();
  });
  it('sıra koruyan eşleme en az kaymayı ve aralığı sağlar', () => {
    const yuva = [0, 10, 20, 30, 40, 50, 60];
    expect(siraKoruyanEsleme([12, 14, 50], yuva, 20)).toEqual([0, 20, 50]);
    expect(siraKoruyanEsleme([], yuva, 20)).toEqual([]);
    expect(siraKoruyanEsleme([1, 2, 3, 4, 5], yuva, 20)).toEqual([]);
  });
});
