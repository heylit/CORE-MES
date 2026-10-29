import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K komutları (1230 a): her biri sevkiyatın mevcut formunu açar; kaydetme formun ucunda, sürümüyle olur.
export const komutlar: readonly Komut[] = [
  {
    anahtar: 'sevkiyat-yeni-is', sira: 10, baslik: 'Yeni sevkiyat işi', aciklama: 'Bugünün planında yeni iş formunu açar.',
    sozcukler: ['teslimat', 'alım', 'irsaliye'], simge: 'truck', yol: '/sevkiyat?yeni=1', islem: 'sevkiyat.is-yaz',
  },
  {
    anahtar: 'sevkiyat-elle-is', sira: 20, baslik: 'Elle sevk kalemi gir', aciklama: 'Tüm işlerde kaynağı olmayan iş (numune, tamir, iade) formunu açar.',
    sozcukler: ['numune', 'tamir', 'iade', 'kalibrasyon'], simge: 'plus', yol: '/sevkiyat/tum-isler?elle=1', islem: 'sevkiyat.is-yaz',
  },
  {
    anahtar: 'sevkiyat-yeni-nokta', sira: 30, baslik: 'Yeni sevkiyat noktası', aciklama: 'Müşteri, tedarikçi ya da fason noktası formunu açar.',
    sozcukler: ['adres', 'müşteri', 'tedarikçi', 'fason'], simge: 'pin', yol: '/sevkiyat/noktalar?yeni=1', islem: 'sevkiyat.tanim-yaz',
  },
  {
    anahtar: 'sevkiyat-yeni-arac', sira: 40, baslik: 'Yeni araç tanımla', aciklama: 'Sevkiyat aracı formunu açar.',
    sozcukler: ['kamyonet', 'plaka'], simge: 'car', yol: '/sevkiyat/araclar?yeni=1', islem: 'sevkiyat.tanim-yaz',
  },
];
