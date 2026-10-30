import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K genel komutları (kart #1241, 1230 a): komut yazmaz, Reçete ve Rota'nın mevcut penceresini açık getirir; kayıt o pencerenin
// düğmesiyle ve ucuyla yapılır. İşlem düğmenin işlemidir (yeni/yetki.ts), sorguyu bölüm okur (`?yeni=`).
export const komutlar: Komut[] = [
  {
    anahtar: 'recete-rota-yeni-rota', sira: 10, baslik: 'Yeni rota', aciklama: 'Ürün ve rotalarda yeni rota penceresini açar.',
    sozcukler: ['rota aç', 'reçete', 'akış şeması'], simge: 'layers', yol: '/recete-rota/schema?yeni=1', islem: 'rota.yaz',
  },
  {
    anahtar: 'recete-rota-yeni-emir', sira: 20, baslik: 'Reçeteden üretim emri aç', aciklama: 'Reçete ve Rota\'da yeni üretim emri formunu açar.',
    sozcukler: ['emir aç', 'iş emri'], simge: 'list', yol: '/recete-rota?yeni=1', islem: 'uretim-emirleri.yaz', veya: ['rota.emre-kopyala'],
  },
  {
    anahtar: 'recete-rota-yeni-sartname', sira: 30, baslik: 'Yeni şartname', aciklama: 'Şartname ve talimatlarda yeni şartname penceresini açar.',
    sozcukler: ['işlem şartnamesi', 'spesifikasyon'], simge: 'clipboard-check', yol: '/recete-rota/sartnameler?yeni=sartname', islem: 'rota.sartname-yaz',
  },
  {
    anahtar: 'recete-rota-yeni-talimat', sira: 40, baslik: 'Yeni talimat şablonu', aciklama: 'Şartname ve talimatlarda yeni talimat şablonu penceresini açar.',
    sozcukler: ['iş talimatı', 'adım talimatı'], simge: 'plus', yol: '/recete-rota/sartnameler?yeni=talimat', islem: 'rota.talimat-yaz',
  },
];
