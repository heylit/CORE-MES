import { describe, expect, it } from 'vitest';
import { yetkilerTmide } from '../../../../arkon/web/src/data/tmi-yetkileri.ts';

// Arkon Ayarlar > Yetkiler (arkon/web/src/app/giris-ayarlar-spc.ts PermEditor): TMI içinde salt okunur.
describe('Arkon yetki ekranı', () => {
  it('sunucuya bağlıyken yetkiler TMI\'dedir, ekran salt okunur', () => {
    expect(yetkilerTmide('server')).toBe(true);
  });
  it('yerel kipte (sunucusuz) yönetici düzenler', () => {
    expect(yetkilerTmide('local')).toBe(false);
  });
});
