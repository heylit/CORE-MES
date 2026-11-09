import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K komutları (1237, 1230 a): yazma ve yetki açılan ekranın ucundadır. Talep yalnız Taleplerim'den açılır (2405 a).
export const komutlar: readonly Komut[] = [
  {
    anahtar: 'satin-alma-talep-ac', sira: 20, baslik: 'Malzeme talep et', aciklama: 'Taleplerim\'de yeni talep formunu açar.',
    sozcukler: ['talep aç', 'taleplerim', 'ihtiyaç', 'satın alma'], simge: 'edit', yol: '/taleplerim?bolum=yeni', islem: 'satin-alma.talep-ac',
  },
  {
    anahtar: 'satin-alma-onay-bekleyenler', sira: 30, baslik: 'Onay bekleyen talepler', aciklama: 'Onayınızı bekleyen satın alma taleplerini açar.',
    sozcukler: ['onayla', 'satın alma'], simge: 'check', yol: '/satin-alma/onaylar', islem: 'satin-alma.onayla',
  },
];
