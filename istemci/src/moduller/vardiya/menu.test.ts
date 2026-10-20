import { describe, expect, it } from 'vitest';
import { SAYFALAR, menudeGorunur } from '#paylasilan/sayfalar.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { rotalar } from './rotalar.tsx';

describe('Vardiya ikinci menüsü', () => {
  const maddeler = menuMaddeleri(IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/vardiya')!);

  it('günlük mesai maddesi sayfa.mesai işlemiyle kök altında /vardiya/mesai yoludur', () => {
    expect(maddeler.find((m) => m.anahtar === 'mesai')).toMatchObject({ baslik: 'Günlük mesai', yol: '/vardiya/mesai', islem: 'sayfa.mesai' });
  });

  it('her madde yolunun rotası vardır; /mesai adresle açılır ama ana menüde görünmez', () => {
    const yollar = rotalar.map((r) => r.yol);
    for (const m of maddeler) expect(yollar).toContain(m.yol);
    expect(yollar).toContain('/mesai');
    const mesai = SAYFALAR.find((s) => s.yol === '/mesai');
    expect(mesai?.islem).toBe('sayfa.mesai');
    expect(menudeGorunur(mesai!)).toBe(false);
  });

  it('İstasyonlar menüsünün Vardiyalar maddesi vardiya düzenini açar (#1109)', () => {
    expect(rotalar.find((r) => r.yol === '/istasyonlar/vardiyalar')?.ekran).toBe(rotalar.find((r) => r.yol === '/vardiya')?.ekran);
  });
});
