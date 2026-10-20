import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Görünen ad "Güvenlik ve Karşılama" (164 a); modül adı nizamiye, bilgi güvenliği defteri olan `guvenlik` modülüyle karışmasın diye.
export const NIZAMIYE_SAYFALARI = [
  { yol: '/nizamiye', islem: 'sayfa.nizamiye', baslik: 'Güvenlik ve Karşılama', simge: 'scan', grup: 'Yönetim', sira: 7 },
] as const satisfies readonly SayfaTanimi[];

export const NIZAMIYE_IKINCI_MENU = {
  kok: '/nizamiye',
  baslik: 'Güvenlik ve Karşılama',
  simge: 'scan',
  sayacUcu: '/nizamiye/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'kapi', baslik: 'Kapı', yol: '/nizamiye', simge: 'scan', islem: 'nizamiye.oku' },
      { anahtar: 'kartlar', baslik: 'Kart rafı', yol: '/nizamiye/kartlar', simge: 'tag', islem: 'nizamiye.oku' },
      { anahtar: 'gecmis', baslik: 'Geçmiş', yol: '/nizamiye/gecmis', simge: 'clock', islem: 'nizamiye.oku' },
      { anahtar: 'acil', baslik: 'Acil durum listesi', yol: '/nizamiye/acil-durum', simge: 'alert', islem: 'nizamiye.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
