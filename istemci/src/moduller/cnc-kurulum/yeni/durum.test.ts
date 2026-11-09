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
});
