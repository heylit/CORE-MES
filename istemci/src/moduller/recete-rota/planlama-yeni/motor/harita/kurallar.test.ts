import { describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler, simdiSaati } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import {
  aralik, bitisIzleri, dilimAdi, dilimNo, durusOku, haritaGruplari, ornekTezgah, sahneKur, seritEtiketleri, sigdir, tezgahDurumu, yakinlas,
  yakinlikSiniri, yerlesim, yoldakiParcalar,
} from './kurallar.ts';

// Beklenen değerler eski sayfanın (cerceve/planlama) aynı örnek kayıtla, Harita görünümünde 1280 genişlikte (tuval 1080 x 677, alttaki
// oynatıcı 98, üstteki çubuk yok sayılır 60) kurduğu sahnedir.
function kur(olcek: 'gun' | 'hafta' | 'ay' | 'yil' = 'hafta', kayma = 0) {
  const c = ornekCalisma(); const p = planOku(c); if (!p) throw new Error('plan yok');
  const cx = derle(girdiKur(c, plandanBitenler(c, p))); const now = simdiSaati(c); const r = aralik(now, olcek, kayma);
  const g = haritaGruplari(c.D, p, cx); const y = yerlesim(g, 1080, 677 - 60 - 98);
  return { c, p, cx, now, r, g, s: sahneKur(c.D, p, cx, y, r, now) };
}

describe('tezgâh haritası hesapları', () => {
  it('gruplar rota sırasıyla, yerleşim ve bölgeler eski sahneyle aynı', () => {
    const { g, s } = kur();
    expect(g.map((x) => x.g)).toEqual(['1', '3', '2', 'fason', '4', '5']);
    expect(Object.values(s.ist).map((a) => [a.m, a.grup, Math.round(a.x), Math.round(a.y)])).toEqual(expect.arrayContaining([
      ['1', '1', 118, 128], ['2', '2', 638, 128], ['3', '3', 378, 128], ['4', '4', 378, 376], ['5', '5', 638, 376], ['@5', 'fason', 118, 376],
    ]));
    expect(s.bolge.map((b) => [b.g, b.x, b.y, b.w, b.h, b.n])).toEqual([
      ['1', 12, 6, 236, 194, 1], ['3', 272, 6, 236, 194, 1], ['2', 532, 6, 236, 194, 1], ['fason', 12, 254, 236, 194, 1], ['4', 272, 254, 236, 194, 1], ['5', 532, 254, 236, 194, 1],
    ]);
  });

  it('dilim doluluğu, akış kenarları ve şerit eski sahneyle aynı', () => {
    const { c, s, r, now, cx } = kur();
    expect([now, s.son]).toEqual([8, 168]);
    expect(s.dol['1']?.map((v) => (v == null ? null : Math.round(v * 1e6) / 1e6))).toEqual([0, 0, 0, 0, 0, 0.266082, null]);
    expect(s.dol['4']?.[5]).toBeCloseTo(0.21988304093567498, 9);
    expect(Object.values(s.kenar).map((e) => [e.a, e.b, e.n, [...e.j]])).toEqual([['1', '4', 1, ['3']]]);
    expect([dilimNo(r, now), dilimAdi(c.D, 'hafta', r, 0), dilimAdi(c.D, 'hafta', r, 0, true)]).toEqual([0, 'Pz', '19.10 Pzt']);
    expect(seritEtiketleri(c.D, 'hafta', now, s.son).map(([x, e]) => [Math.round(x * 100), e])).toEqual([[0, 'Pzt'], [10, 'Sal'], [25, 'Çar'], [40, 'Per'], [55, 'Cum'], [70, 'Cmt'], [85, 'Paz']]);
    const iz = bitisIzleri(c.D, s, cx);
    expect(iz.ic.map((x) => [x.id, Math.round(x.x * 10000) / 100, x.ln, x.gec])).toEqual([['3', 77.28, 0, false]]);
    expect(iz.ote).toEqual(['2']);
  });

  it('tezgâh hâli, örnek tezgâh, yoldaki parça ve kamera', () => {
    const { c, s, now } = kur();
    const d = durusOku(c);
    expect(tezgahDurumu(s, d, '1', now)).toMatchObject({ cal: null, dur: 'bos', bekleyen: 1 });
    expect(ornekTezgah(s, d, now)).toBe('1');
    expect(yoldakiParcalar(s, now)).toEqual([]);
    const k = sigdir(s.bolge, 1080, 677, 50, 98);
    expect(k?.k).toBeCloseTo(1.1123348017621146, 9);
    expect(k?.x).toBe(390); expect(k?.y).toBeCloseTo(248.57623762376238, 9);
    if (!k) return;
    const z = yakinlas(k, 1080, 677, 100, yakinlikSiniri(k.k));
    expect(z.k).toBeCloseTo(Math.max(1.6, k.k * 1.3), 9);
  });
});
