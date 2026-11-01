import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K komutları (kart 1240, 1230 a): yeni belge penceresini türü seçili açar (`?yeni=1`, Belgeler.tsx okur); yükleme ve
// onay o penceredeki mevcut uçtadır. Komut yazma yapmaz.
export const komutlar: readonly Komut[] = [
  {
    anahtar: 'cizimler-yeni-belge', sira: 10, baslik: 'Yeni belge yükle', aciklama: 'Çizim Merkezi’ne dosya yükler',
    sozcukler: ['çizim', 'doküman', 'dosya'], simge: 'upload', yol: '/cizimler?yeni=1', islem: 'belge-merkezi.yaz',
  },
  {
    anahtar: 'cizimler-yeni-teknik-resim', sira: 20, baslik: 'Yeni teknik resim yükle', aciklama: 'Tür teknik resim seçili açılır',
    sozcukler: ['çizim', 'resim no'], simge: 'ruler', yol: '/cizimler/teknik-resim?yeni=1', islem: 'belge-merkezi.yaz',
  },
  {
    anahtar: 'cizimler-yeni-3b-model', sira: 30, baslik: 'Yeni 3B model yükle', aciklama: 'Tür 3B model seçili açılır',
    sozcukler: ['step', 'model', 'katı'], simge: 'cube', yol: '/cizimler/3b-model?yeni=1', islem: 'belge-merkezi.yaz',
  },
  {
    anahtar: 'cizimler-yeni-sertifika', sira: 40, baslik: 'Yeni sertifika yükle', aciklama: 'Tür sertifika seçili açılır',
    sozcukler: ['malzeme sertifikası', 'belge'], simge: 'check', yol: '/cizimler/sertifika?yeni=1', islem: 'belge-merkezi.yaz',
  },
];
