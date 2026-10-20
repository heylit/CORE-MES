import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const AYARLAR_SAYFALARI = [
  { yol: '/ayarlar', islem: 'sayfa.ayarlar', baslik: 'Sistem Ayarları', simge: 'wrench', grup: 'Yönetim', sira: 10 },
] as const satisfies readonly SayfaTanimi[];

// Madde işlemi ekranı besleyen uçla aynıdır: ayarlar listesini okumak da `ayarlar.yaz` ister (karar #117); yetki matrisi
// rol yönetenindir (`kisiler.rol-yonet`, kart #586).
export const AYARLAR_IKINCI_MENU = {
  kok: '/ayarlar',
  baslik: 'Sistem Ayarları',
  simge: 'wrench',
  gruplar: [
    { maddeler: [
      { anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/ayarlar', simge: 'wrench', islem: 'ayarlar.yaz' },
      { anahtar: 'yetkiler', baslik: 'Yetkiler', yol: '/ayarlar/yetkiler', simge: 'lock', islem: 'kisiler.rol-yonet' },
      // Kişiye rolün üstüne sayfa ve işlem (kart #1233); uç da `kisiler.rol-yonet` ister.
      { anahtar: 'sayfa-yetkileri', baslik: 'Sayfa yetkileri', yol: '/ayarlar/sayfa-yetkileri', simge: 'user', islem: 'kisiler.rol-yonet' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
