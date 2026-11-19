import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Toplantılar (3448): sayfa toplantı açan rollerdedir (3448-5 a); liste kişinin kendi toplantısına süzülür, `toplantilar.oku` hepsini
// görür. Katılımcının kendi toplantıları Hesap menüsündeki Toplantılarım'dadır (yalnız oturum; sayfa işlemi istemez).
export const TOPLANTILAR_SAYFALARI = [
  { yol: '/toplantilar', islem: 'sayfa.toplantilar', baslik: 'Toplantılar', simge: 'mail', grup: 'Planlama', sira: 9 },
] as const satisfies readonly SayfaTanimi[];

export const TOPLANTILAR_IKINCI_MENU = {
  kok: '/toplantilar',
  baslik: 'Toplantılar',
  simge: 'mail',
  gruplar: [
    { maddeler: [
      { anahtar: 'yaklasan', baslik: 'Yaklaşan', yol: '/toplantilar', simge: 'calendar', islem: 'sayfa.toplantilar', okur: ['/toplantilar'] },
      { anahtar: 'gecmis', baslik: 'Geçmiş', yol: '/toplantilar/gecmis', simge: 'clock', islem: 'sayfa.toplantilar', okur: ['/toplantilar'] },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
