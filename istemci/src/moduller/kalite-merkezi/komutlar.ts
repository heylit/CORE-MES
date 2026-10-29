import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K genel komutları (1238, 1230 a): her biri kayıt penceresini açar, alanlar adresle dolu gelir (yeni/KaliteMerkeziYeni.tsx
// adrestenGecis); kayıt ekranda onaylanır. İşlem, ekrandaki düğmenin istediği işlemdir.
export const komutlar: readonly Komut[] = [
  {
    anahtar: 'kalite-ncr-yeni', sira: 10, baslik: 'Yeni uygunsuzluk (NCR)', aciklama: 'Uygunsuzluk kaydı penceresini açar.',
    sozcukler: ['ncr', 'uygunsuz parça'], simge: 'alert', yol: '/kalite-merkezi/uygunsuzluklar?yeni=1', islem: 'kalite-merkezi.yaz',
  },
  {
    anahtar: 'kalite-dof-yeni', sira: 20, baslik: 'Yeni DÖF / 8D', aciklama: 'Düzeltici ve önleyici faaliyet kaydını açar.',
    sozcukler: ['capa', 'düzeltici faaliyet'], simge: 'wrench', yol: '/kalite-merkezi/dof?yeni=1', islem: 'kalite-merkezi.yaz',
  },
  {
    anahtar: 'kalite-giris-muayenesi', sira: 30, baslik: 'Giriş muayenesi yap', aciklama: 'Muayene kaydını giriş türüyle açar.',
    sozcukler: ['muayene', 'mal kabul kontrolü'], simge: 'eye', yol: '/kalite-merkezi/muayeneler?yeni=1&tur=Giri%C5%9F', islem: 'kalite-merkezi.yaz',
  },
  {
    anahtar: 'kalite-lot-kabul', sira: 40, baslik: 'Lot kabul (AQL) yap', aciklama: 'Lot kabul kaydını açar.',
    sozcukler: ['aql', 'numune'], simge: 'scan', yol: '/kalite-merkezi/lot-kabul?yeni=1', islem: 'kalite-merkezi.yaz',
  },
  {
    anahtar: 'kalite-hatali-karar', sira: 50, baslik: 'Hatalı parça kararı ver', aciklama: 'Karar bekleyen hatalı parçalar Bugün görünümündedir.',
    sozcukler: ['hatalı', 'rework', 'hurda'], simge: 'clipboard-check', yol: '/kalite-merkezi', islem: 'kalite-merkezi.onayla',
  },
];
