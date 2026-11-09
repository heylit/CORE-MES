import { describe, expect, it } from 'vitest';
import { IKINCI_MENU_TANIMLARI } from '../../ortak/rota/ikinci-menu.ts';
import { MALIYET_ANAHTARLARI, MALIYET_ISLEMI, ONERILEN_IKINCI_MENU, PLANLAMA_ANAHTARLARI, PLANLAMA_ISLEMI } from './planlama-menusu.ts';
import { rotalar } from './rotalar.tsx';

describe('planlama menüsü', () => {
  it('Reçete ve Rota menüsünün her maddesinin rotası vardır; eski planlama adresleri Planlama sayfasına yönlenir', () => {
    const yollar = new Set(rotalar.map((r) => r.yol));
    for (const g of ONERILEN_IKINCI_MENU.gruplar) for (const m of g.maddeler) expect(yollar.has(m.yol), m.yol).toBe(true);
    for (const a of PLANLAMA_ANAHTARLARI) expect(yollar.has(`/recete-rota/${a}`)).toBe(true);
  });

  it('önerilen menü çekirdekteki menüyle aynıdır; Planlama menüsünde planlama maddeleri planlama işlemini, maliyet maddeleri maliyet okumasını ister (195 a)', () => {
    expect(IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/recete-rota')).toEqual(ONERILEN_IKINCI_MENU);
    const planMenusu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/plan');
    // Görünüm maddeleri gruplara dağılır (2538 b); bazı görünümler bir sayfanın sekmesidir, menüde yoktur.
    const maddeler: ReadonlyArray<{ anahtar: string; islem: string }> = (planMenusu?.gruplar ?? []).flatMap((g) => g.maddeler)
      .filter((m) => PLANLAMA_ANAHTARLARI.includes(m.anahtar));
    expect(maddeler.length).toBeGreaterThan(0);
    for (const m of maddeler) expect(m.islem, m.anahtar).toBe(MALIYET_ANAHTARLARI.includes(m.anahtar) ? MALIYET_ISLEMI : PLANLAMA_ISLEMI);
    expect(maddeler.filter((m) => m.islem === MALIYET_ISLEMI).map((m) => m.anahtar)).toEqual(['maliyet', 'giderler']);
    expect(MALIYET_ANAHTARLARI.every((a) => PLANLAMA_ANAHTARLARI.includes(a))).toBe(true);
  });
});
