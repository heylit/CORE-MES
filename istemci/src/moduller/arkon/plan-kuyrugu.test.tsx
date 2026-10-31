import { describe, expect, it } from 'vitest';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { rotaninSayfasi } from '../../ortak/rota/sayfa.ts';
import { rotalar } from './rotalar.tsx';

// Ana menüdeki Kuyruk yeni ekranı açar (541, 527 1 a; ekranın kendisi yeni/ArkonYeni.test.tsx).
describe('Kuyruk sayfası', () => {
  const operator = ['arkon.operator', 'sayfa.arkon', 'sayfa.kuyruk'];

  it('Kuyruk sayfasının ekranı Arkon modülündedir ve çerçeveli menüyle açılır', () => {
    expect(SAYFALAR.find((s) => s.yol === '/kuyruk')?.islem).toBe('sayfa.kuyruk');
    expect(rotalar.find((r) => r.yol === '/kuyruk')?.ekran).toBeDefined();
    expect(rotaninSayfasi('/kuyruk')).toBe('/kuyruk');
    const menu = IKINCI_MENULER.find((m) => m.kok === '/kuyruk');
    expect(menu?.cerceveli).toBe(true);
    expect(menu?.gruplar.flatMap((g) => g.maddeler).filter((m) => maddeGorunurMu(m, operator)).map((m) => m.yol)).toEqual(['/kuyruk']);
  });
});
