import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K komutları (kart #1243): komut ekranın formunu açar, kaydı form yazar (1230 a). Aletin kalibrasyon formu genel
// aramada aletin numarası tam yazılınca ilk satırdır (sunucu `arama/servis.ts`).
export const komutlar: readonly Komut[] = [
  {
    anahtar: 'kalibrasyon-yeni-alet', sira: 10, baslik: 'Yeni ölçü aleti', aciklama: 'Ölçü Aletleri: alet ekleme formunu açar.',
    sozcukler: ['kalibrasyon', 'alet ekle', 'mikrometre', 'kumpas'], simge: 'plus', yol: '/kalibrasyon?yeni=1', islem: 'kalibrasyon.yaz',
  },
  {
    anahtar: 'kalibrasyon-yeni-tur', sira: 20, baslik: 'Yeni ölçü aleti türü', aciklama: 'Ölçü Aletleri: tür ekleme formunu açar.',
    sozcukler: ['kalibrasyon', 'tür ekle'], simge: 'list', yol: '/kalibrasyon/turler?yeni=1', islem: 'kalibrasyon.yaz',
  },
  {
    anahtar: 'kalibrasyon-kaydet', sira: 30, baslik: 'Kalibrasyon kaydet', aciklama: 'Ölçü Aletleri: aleti seçin, kalibrasyon sonucunu girin.',
    sozcukler: ['kalibrasyondan döndü', 'sertifika'], simge: 'ruler', yol: '/kalibrasyon', islem: 'kalibrasyon.yaz',
  },
];
