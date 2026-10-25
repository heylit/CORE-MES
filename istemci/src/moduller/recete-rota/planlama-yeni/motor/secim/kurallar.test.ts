import { describe, expect, it } from 'vitest';
import { aralik, haritaGruplari, sahneKur, yerlesim } from '../harita/kurallar.ts';
import { derle, girdiKur, planOku, plandanBitenler, simdiSaati } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { mesaiAdaylari, panelSecimi, rotaAdimlari, tezgahYazi, yolculuk } from './kurallar.ts';

function kur() {
  const c = ornekCalisma(); const p = planOku(c);
  if (!p) throw new Error('plan yok');
  const cx = derle(girdiKur(c, plandanBitenler(c, p))); const now = simdiSaati(c);
  const s = sahneKur(c.D, p, cx, yerlesim(haritaGruplari(c.D, p, cx), 1000, 600), aralik(now, 'hafta', 0), now);
  return { c, p, cx, s, now };
}
const BOS = { adim: null, siparis: null, tezgah: null };

describe('Yan panel hesapları', () => {
  it('seçim: iş, sipariş, tezgâh; sahnede yeri olmayan seçim panel açmaz', () => {
    const { p, s, now } = kur();
    expect(panelSecimi(p, s, BOS, now)).toBeNull();
    expect(panelSecimi(p, s, { ...BOS, adim: '2.20', siparis: '2' }, now)).toEqual({ tur: 'is', id: '2.20' });
    expect(panelSecimi(p, s, { ...BOS, siparis: '2' }, now)).toEqual({ tur: 'siparis', id: '2' });
    expect(panelSecimi(p, s, { ...BOS, tezgah: '3' }, now)).toEqual({ tur: 'tezgah', id: '3' });
    expect(panelSecimi(p, s, { ...BOS, tezgah: 'yok' }, now)).toBeNull();
    expect(panelSecimi(p, s, { ...BOS, siparis: 'yok' }, now)).toBeNull();
  });

  it('yolculuk: adımlar başlangıç sırasıyla, fason tezgâh adıyla; şimdiki ve biten adım', () => {
    const { c, s, now } = kur();
    const l = yolculuk(c, s, '2', now);
    expect(l.map((x) => [tezgahYazi(x.r.m), x.zaman])).toEqual([['3', 'Cmt 18:37 → 13:15'], ['5 (fason)', 'Pzt 16:00 → 16:00'], ['5', 'Sal 16:00 → 17:55']]);
    expect(yolculuk(c, s, '2', l[1]!.r.S + 1).map((x) => [x.simdi, x.bitti])).toEqual([[false, true], [true, false], [false, false]]);
  });

  it('ek mesai adayları: tezgâhın çalışmadığı vardiyalar, eklenmiş olan hariç', () => {
    const { c, cx } = kur();
    expect(mesaiAdaylari(c, cx, '3')).toEqual([]);
    const t = c.D.tezgahlar.find((x) => x.id === '3'); if (t) t.vardiyalar = ['1'];
    const d0 = Math.floor(cx.now / 24);
    c.ekMesai = [{ m: '3', gun: d0, vardiya: '2' }] as typeof c.ekMesai;
    const l = mesaiAdaylari(c, cx, '3');
    expect(l.map((x) => x.gun)).toEqual([d0 + 1, d0 + 2, d0 + 3, d0 + 4]);
    expect(l[0]?.ad).toMatch(/^\d\d\.\d\d \S+ 2 16:00-00:00$/);
  });

  it('rota: adımlar rota sırasıyla, yapabilen tezgâhlar ve süreleri; şu anki tezgâh, kilit, fason', () => {
    const { c, p, cx, now } = kur();
    const l = rotaAdimlari(c, p, cx, '2', now);
    expect(l.map((x) => [x.ad, x.zaman, x.kilitli])).toEqual([['Freze (CNC)', 'Cmt 18:37 → Pzt 13:15', false], ['Fason işlem', 'Pzt 16:00 → Sal 16:00', false], ['Boyutsal muayene', 'Sal 16:00 → Sal 17:55', false]]);
    expect(l[0]?.cipler.find((x) => x.bu)).toEqual({ m: '3', ad: '3', bu: true, sure: '4,4 sa + ayar 0,6 sa' });
    expect(l[1]?.cipler.find((x) => x.bu)).toMatchObject({ ad: '5 (fason)', sure: 'fason' });
    expect(rotaAdimlari({ ...c, locks: { '2.20': { m: '3', S: 0 } } }, p, cx, '2', now)[0]?.kilitli).toBe(true);
    expect(rotaAdimlari(c, p, cx, '2', (p.ops[l[1]?.id ?? '']?.S ?? now) + 1).map((x) => [x.bitti, x.simdi])).toEqual([[true, false], [false, true], [false, false]]);
  });
});
