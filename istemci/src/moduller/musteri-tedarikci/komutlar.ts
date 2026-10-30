import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K komutları (kart 1235, 1230 a): her biri firma formunu türü seçili açar; kayıt formun kendi ucundadır.
// Menü maddesinin yolu türü verir (gorunum.ts menuSuzgeci), `yeni=1` formu açar (Firmalar.tsx).
export const komutlar: readonly Komut[] = [
  { anahtar: 'musteri-yeni', sira: 10, baslik: 'Yeni müşteri', aciklama: 'Müşteri firma kartı açın.', sozcukler: ['firma', 'cari'], simge: 'user', yol: '/musteri-tedarikci/musteriler?yeni=1', islem: 'musteri-tedarikci.yaz' },
  { anahtar: 'tedarikci-yeni', sira: 20, baslik: 'Yeni tedarikçi', aciklama: 'Tedarikçi firma kartı açın.', sozcukler: ['firma', 'cari'], simge: 'truck', yol: '/musteri-tedarikci/tedarikciler?yeni=1', islem: 'musteri-tedarikci.yaz' },
  { anahtar: 'fason-firma-yeni', sira: 30, baslik: 'Yeni fason firma', aciklama: 'Fason firma kartı açın.', sozcukler: ['firma', 'tedarikci'], simge: 'tool', yol: '/musteri-tedarikci/fason?yeni=1', islem: 'musteri-tedarikci.yaz' },
];
