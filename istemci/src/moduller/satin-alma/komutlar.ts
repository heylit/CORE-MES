import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K komutları (1237, 1230 a): mevcut ekranı yeni talep penceresiyle açar; yazma ve yetki o ekranın ucundadır.
export const komutlar: readonly Komut[] = [
  {
    anahtar: 'satin-alma-yeni-talep', sira: 10, baslik: 'Yeni satın alma talebi', aciklama: 'Satın Alma Merkezi\'nde boş talep formunu açar.',
    sozcukler: ['talep aç', 'satın alma', 'ihtiyaç'], simge: 'plus', yol: '/satin-alma/talepler?yeni=talep', islem: 'satin-alma.yaz',
  },
  {
    anahtar: 'satin-alma-talep-ac', sira: 20, baslik: 'Malzeme talep et', aciklama: 'Taleplerim\'de yeni talep formunu açar.',
    sozcukler: ['talep aç', 'taleplerim', 'ihtiyaç', 'satın alma'], simge: 'edit', yol: '/taleplerim?bolum=yeni', islem: 'satin-alma.talep-ac',
  },
  {
    anahtar: 'satin-alma-onay-bekleyenler', sira: 30, baslik: 'Onay bekleyen talepler', aciklama: 'Onayınızı bekleyen satın alma taleplerini açar.',
    sozcukler: ['onayla', 'satın alma'], simge: 'check', yol: '/satin-alma/onaylar', islem: 'satin-alma.onayla',
  },
];
