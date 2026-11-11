import { describe, expect, it } from 'vitest';
import { acilisVarsayimlari, durumOku } from './durum.ts';

describe('durum', () => {
  it('her okuma yeni nesne verir (varsayılan paylaşılmaz)', () => {
    const a = durumOku(null);
    a.byType['mill'] = { fixture: 'degisti', jaw: '', zero: '' };
    expect(durumOku(null).byType['mill']?.fixture).toBe('vise125');
  });
});

describe('açılış varsayılanları', () => {
  it('iç nesneler her uygulamada yenidir', () => {
    const a = durumOku(null); acilisVarsayimlari(a);
    a.life.cal['x'] = 2;
    const b = durumOku(null); acilisVarsayimlari(b);
    expect(b.life.cal).toEqual({});
  });

  it('kalkan G-Kod Sim. ayarları atılır, Hazırlık programı kalır', () => {
    const a = durumOku(null);
    Object.assign(a, { gsimOpt: { lathe: true }, gtools: { __v2: 1 }, gstock: { x: 1 }, gstockMan: { x: 2 }, gsimText: { name: 'P1', text: 'G0 X1' } });
    acilisVarsayimlari(a);
    for (const ad of ['gsimOpt', 'gtools', 'gstock', 'gstockMan']) expect(a, ad).not.toHaveProperty(ad);
    expect(a['gsimText']).toEqual({ name: 'P1', text: 'G0 X1' });
  });
});
