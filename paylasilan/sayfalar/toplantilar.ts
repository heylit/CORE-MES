import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Toplantılar (3448): bütün toplantılar sayfası yalnız `toplantilar.oku` ile görünür. Katılımcının kendi toplantıları Hesap menüsündeki
// Toplantılarım'dadır (yalnız oturum; sayfa işlemi istemez, rol matrisi değişmez).
export const TOPLANTILAR_SAYFALARI = [
  { yol: '/toplantilar', islem: 'sayfa.toplantilar', baslik: 'Toplantılar', simge: 'mail', grup: 'Planlama', sira: 9 },
] as const satisfies readonly SayfaTanimi[];

export const TOPLANTILAR_IKINCI_MENU = {
  kok: '/toplantilar',
  baslik: 'Toplantılar',
  simge: 'mail',
  gruplar: [
    { maddeler: [
      { anahtar: 'yaklasan', baslik: 'Yaklaşan', yol: '/toplantilar', simge: 'calendar', islem: 'toplantilar.oku', okur: ['/toplantilar'] },
      { anahtar: 'gecmis', baslik: 'Geçmiş', yol: '/toplantilar/gecmis', simge: 'clock', islem: 'toplantilar.oku', okur: ['/toplantilar'] },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
