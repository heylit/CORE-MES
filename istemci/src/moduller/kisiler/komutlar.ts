import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K genel komutları (kart #1236, karar 1230 a): komut Personel ekranını ilgili pencere açık gelir; yazma ekranın kendi ucundadır.
export const komutlar: Komut[] = [
  {
    anahtar: 'kisi-ekle',
    sira: 10,
    baslik: 'Kişi ekle',
    aciklama: 'Personel listesine yeni kişi kaydı',
    sozcukler: ['personel', 'yeni kişi', 'çalışan'],
    simge: 'plus',
    yol: '/personel?yeni=1',
    islem: 'kisiler.yaz',
  },
  {
    anahtar: 'yetki-matrisi',
    sira: 20,
    baslik: 'Yetki matrisini aç',
    aciklama: 'Rollerin işlemlerini tek tabloda gör ve düzenle',
    sozcukler: ['rol', 'yetki', 'işlem'],
    simge: 'lock',
    yol: '/personel?gorunum=matris',
    islem: 'kisiler.rol-yonet',
  },
];
