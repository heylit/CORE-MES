import { describe, expect, it } from 'vitest';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { rotaninSayfasi } from '../../ortak/rota/sayfa.ts';
import { rotalar } from './rotalar.tsx';

// Üretim Terminali: Arkon'un operatör ekranı ana menüde kendi sayfa işlemiyle (rollere Çekirdek göçüyle verilir).
describe('Üretim Terminali', () => {
  const operator = ['arkon.operator', 'sayfa.arkon', 'sayfa.uretim-terminali'];
  const gorunur = SAYFALAR.filter((s) => operator.includes(s.islem));

  it('sayfa.uretim-terminali olmayan kullanıcı görmez, olan görür', () => {
    const yollar = (islemler: string[]) => SAYFALAR.filter((s) => islemler.includes(s.islem)).map((s) => s.yol);
    expect(yollar(['arkon.operator', 'sayfa.arkon'])).not.toContain('/uretim-terminali');
    expect(yollar(operator)).toContain('/uretim-terminali');
  });

  it('operatör ana menüde Üretim grubunda görür ve ekranı kurulur', () => {
    const sayfa = gorunur.find((s) => s.yol === '/uretim-terminali');
    expect(sayfa).toMatchObject({ baslik: 'Üretim Terminali', grup: 'Üretim' });
    expect(rotalar.map((r) => r.yol)).toContain('/uretim-terminali');
    // Rota planı ekranı yolun sayfasının işlemiyle kurar.
    expect(rotaninSayfasi('/uretim-terminali')).toBe('/uretim-terminali');
  });

  it('çerçeveli tek maddelik menüyle açılır', () => {
    const menu = IKINCI_MENULER.find((m) => m.kok === '/uretim-terminali');
    expect(menu?.cerceveli).toBe(true);
    expect(menu?.gruplar.flatMap((g) => g.maddeler).filter((m) => maddeGorunurMu(m, operator)).map((m) => m.yol)).toEqual(['/uretim-terminali']);
  });
});

describe('Üretim Terminali kalıcıdır', () => {
  it('terminal rotası kalıcı, Arkon MES ve Kuyruk değil', () => {
    const kalici = rotalar.filter((r) => r.kalici === true).map((r) => r.yol);
    expect(kalici).toEqual(['/uretim-terminali']);
  });
});
