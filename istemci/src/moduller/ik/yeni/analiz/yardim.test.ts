import { describe, expect, it } from 'vitest';
import { dugumMetni, vurgula, yardimAra, yardimDuzle } from './kurallar.ts';
import { GORUNUM_YARDIMI, IK_YARDIM, SIK_ARANANLAR, type YardimDugumu } from './yardim.ts';

const ETIKETLER = new Set(['p', 'b', 'h4', 'div', 'span', 'ul', 'ol', 'li', 'table', 'tbody', 'tr', 'th', 'td', 'kbd', 'code', 'svg', 'g', 'defs', 'marker', 'path', 'rect', 'circle', 'line', 'text']);
const OZELLIKLER = new Set(['className', 'viewBox', 'role', 'aria-label', 'x', 'y', 'width', 'height', 'rx', 'textAnchor', 'id', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'd', 'markerEnd', 'cx', 'cy', 'r', 'x1', 'x2', 'y1', 'y2', 'transform']);

function dolas(d: YardimDugumu, ziyaret: (e: Exclude<YardimDugumu, string>) => void): void {
  if (typeof d === 'string') return;
  ziyaret(d);
  for (const c of d.slice(2)) dolas(c as YardimDugumu, ziyaret);
}

describe('İK kılavuzu verisi', () => {
  it('bugünkü ekrandaki 34 konu; kimlikler tek, zimmet konusu yok (244 a)', () => {
    expect(IK_YARDIM).toHaveLength(34);
    expect(new Set(IK_YARDIM.map((k) => k.kimlik)).size).toBe(34);
    expect(IK_YARDIM.some((k) => k.kimlik === 'zimmet')).toBe(false);
  });

  it('ilgili konular ve görünüm konuları var olan konuya gider', () => {
    const var_ = new Set(IK_YARDIM.map((k) => k.kimlik));
    for (const k of IK_YARDIM) for (const r of k.ilgili) expect(var_.has(r), `${k.kimlik} -> ${r}`).toBe(true);
    for (const [g, k] of Object.entries(GORUNUM_YARDIMI)) expect(var_.has(k), `${g} -> ${k}`).toBe(true);
    expect(SIK_ARANANLAR.length).toBeGreaterThan(0);
  });

  it('yalnız izinli etiket ve öznitelik; sınıflar parçanın önekiyle; şekil tek SVG', () => {
    for (const k of IK_YARDIM) {
      for (const d of [...k.govde, ...(k.sekil ? [k.sekil] : [])]) {
        dolas(d, ([e, o]) => {
          expect(ETIKETLER.has(e), `${k.kimlik}: ${e}`).toBe(true);
          for (const [a, v] of Object.entries(o ?? {})) {
            expect(OZELLIKLER.has(a), `${k.kimlik}: ${e}.${a}`).toBe(true);
            if (a === 'className') for (const s of v.split(' ')) expect(s.startsWith('tc-ikr-'), s).toBe(true);
            if (a === 'id') expect(v.startsWith('tc-ikr-')).toBe(true);
          }
        });
      }
      if (k.sekil) expect(typeof k.sekil !== 'string' && k.sekil[0]).toBe('svg');
    }
  });

  it('metin boş değil; dış bağlantı yok', () => {
    for (const k of IK_YARDIM) {
      const metin = k.govde.map(dugumMetni).join(' ');
      expect(metin.trim().length, k.kimlik).toBeGreaterThan(20);
      expect(metin).not.toMatch(/https?:\/\//);
    }
  });
});

describe('kılavuz araması', () => {
  it('Türkçe harfleri düzler, uzunluğu korur', () => {
    expect(yardimDuzle('Kıdem İhbar Çağrı')).toBe('kidem ihbar cagri');
    expect(yardimDuzle('Kıdem İhbar').length).toBe('Kıdem İhbar'.length);
  });

  it('başlıkta geçen konu önce gelir; her terim geçmeli', () => {
    const s = yardimAra(IK_YARDIM, 'kidem');
    expect(s.length).toBeGreaterThan(0);
    expect(yardimDuzle(s[0]!.konu.baslik)).toContain('kidem');
    expect(yardimAra(IK_YARDIM, 'kidem zzzyyy')).toEqual([]);
    expect(yardimAra(IK_YARDIM, 'a')).toEqual([]);
  });

  it('parça işaretlenir', () => {
    const [ilk] = yardimAra(IK_YARDIM, 'yıllık izin');
    expect(ilk!.parca.some((p) => p.vurgu)).toBe(true);
    expect(vurgula('Yıllık izin', ['izin'])).toEqual([{ metin: 'Yıllık ', vurgu: false }, { metin: 'izin', vurgu: true }]);
  });
});
