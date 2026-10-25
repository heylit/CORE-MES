import { describe, expect, it } from 'vitest';
import { aralik } from '../harita/kurallar.ts';
import { derle, girdiKur, planOku, plandanBitenler, simdiSaati } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { gunCizelgesi, olcekCizelgesi, tezgahSirasi, zamanCizelgesi } from './kurallar.ts';

// Beklenen değerler eski sayfanın (cerceve/planlama) aynı örnek kayıtla Çizelge'de çizdiği konumlardır (yüzde, üç basamak).
function kur() {
  const c = ornekCalisma(); const p = planOku(c); if (!p) throw new Error('plan yok');
  const cx = derle(girdiKur(c, plandanBitenler(c, p))); return { c, p, cx, now: simdiSaati(c) };
}
const yz = (v: number) => Number((v * 100).toFixed(3));

describe('çizelge hesapları', () => {
  it('hafta: satır sırası, gün başlıkları, işler ve şimdi çizgisi eski çizelgeyle aynı', () => {
    const { c, p, cx, now } = kur();
    expect(tezgahSirasi(c.D, p, cx)).toEqual(['1', '2', '3', '4', '5', '@5']);
    const o = olcekCizelgesi(c, p, cx, 'hafta', aralik(now, 'hafta', 0), now);
    expect(o.basliklar.map((b) => [b.ad, yz(b.x), b.bugun])).toEqual([
      ['19.10 Pzt', 0, true], ['20.10 Sal', 14.286, false], ['21.10 Çar', 28.571, false], ['22.10 Per', 42.857, false],
      ['23.10 Cum', 57.143, false], ['24.10 Cmt', 71.429, false], ['25.10 Paz', 85.714, false],
    ]);
    expect(o.satirlar.map((s) => [s.etiket, s.isler.map((i) => [i.id, yz(i.x), yz(i.w), i.etiket])])).toEqual([
      ['1', [['3.10', 76.19, 1.188, null]]], ['2', []], ['3', [['2.20', 82.51, 17.49, '2']]], ['4', [['3.20', 77.378, 0.982, null]]], ['5', []], ['fason 5', []],
    ]);
    expect(yz(o.simdi ?? -1)).toBe(4.762); expect(o.ufuk).toBeNull();
  });

  it('saatlik gün: kapalı saatler, bloklar, doluluk ve en erken başlama eski gün katmanıyla aynı', () => {
    const { c, p, cx } = kur();
    const g = gunCizelgesi(c, p, cx, 5, '3.10', null);
    const s1 = g.satirlar[0]; const s3 = g.satirlar[2]; const s4 = g.satirlar[3];
    expect(s1?.kapali.map((k) => [yz(k.x), yz(k.w)])).toEqual([[0, 33.333], [50, 2.083], [66.667, 33.333]]);
    expect(s1?.bloklar.map((b) => [b.id, yz(b.x), yz(b.w), b.secili])).toEqual([['3.10', 33.333, 8.315, true]]);
    expect([s1?.oran != null ? Math.round(s1.oran * 100) : null, s1?.isi, s1?.uygun]).toEqual([27, 1, true]);
    expect(s1?.erken && [yz(s1.erken.w), s1.erken.ad, yz(s1.erken.cizgi ?? -1)]).toEqual([33.333, 'Sipariş serbest bırakılır', 33.333]);
    expect(s3?.bloklar.map((b) => [b.id, yz(b.x), yz(b.w), b.sag, b.gec, b.soluk])).toEqual([['2.20', 77.569, 22.431, true, true, true]]);
    expect([s4?.bloklar[0]?.id, yz(s4?.bloklar[0]?.x ?? 0), yz(s4?.bloklar[0]?.w ?? 0), Math.round((s4?.oran ?? 0) * 100), s4?.uygun]).toEqual(['3.20', 41.648, 6.871, 22, false]);
    expect(g.satirlar.map((s) => s.etiket)).toEqual(['1', '2', '3', '4', '5', '5']);
    expect(g.gunler[5]?.ad).toBe('24.10 Cmt');
    expect(g.kilit).toMatchObject({ donukBu: 0, donukTum: 0, elle: 0 });
  });

  it('Siparişler merceği: gruplar, fason, işlerin saat konumu, ayar payı ve yıl başlıkları eski çizelgeyle aynı', () => {
    const { c, p, cx } = kur();
    const z = zamanCizelgesi(c, p, cx, 'hafta', '3');
    expect(z.px).toBe(10);
    expect(z.saat).toBe(240);
    expect(z.basliklar.map((b) => b.ad)).toEqual(['19.10 Pzt', '20.10 Sal', '21.10 Çar', '22.10 Per', '23.10 Cum', '24.10 Cmt', '25.10 Paz', '26.10 Pzt', '27.10 Sal', '28.10 Çar']);
    expect(z.gruplar.map((g) => [g.g, g.n, g.satirlar.map((s) => s.m)])).toEqual([['1', 1, ['1']], ['2', 1, ['2']], ['3', 1, ['3']], ['4', 1, ['4']], ['5', 1, ['5']]]);
    expect(z.fason.map((s) => [s.m, s.kod])).toEqual([['@5', '5']]);
    const is = Object.fromEntries([...z.gruplar.flatMap((g) => g.satirlar), ...z.fason].flatMap((s) => s.isler).map((i) => [i.id, i]));
    // Eski sayfada 3.10 left 1280px, width 19.956px, --a 20.879%; 2.30 fasonda left 1840px, width 240px.
    expect([is['3.10']?.x, Number(((is['3.10']?.w ?? 0) * 10).toFixed(3)), Number(((is['3.10']?.ayar ?? 0) * 100).toFixed(3))]).toEqual([128, 19.956, 20.879]);
    expect([is['2.30']?.x, is['2.30']?.w, is['2.30']?.gec, is['2.30']?.soluk]).toEqual([184, 24, true, true]);
    expect(is['3.10']?.soluk).toBe(false);
    // Eski kapalı şerit: 0-8, 12-12,5, 20-20,5 saatleri (left 0/80px, 120/5px, 200/5px).
    expect(z.gruplar[0]?.satirlar[0]?.kapali.slice(0, 3)).toEqual([{ x: 0, w: 8 }, { x: 12, w: 0.5 }, { x: 20, w: 0.5 }]);
    const y = zamanCizelgesi(c, p, cx, 'yil', null);
    expect(y.basliklar.map((b) => b.ad)).toEqual(['Eki']);
    expect(y.cizgiler).toEqual([0, 168]);
    expect(y.termin).toBeNull();
  });
});
