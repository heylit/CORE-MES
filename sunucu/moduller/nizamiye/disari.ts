export { personelKartSahibi, yemegeKalanZiyaretci } from './servis.ts';
// Personel giriş kartını yalnız İK verir ve kaldırır (1902 b, 1903 b); yetkiyi İK ucu denetler.
export { kisininPersonelKarti, personelKartiniKaldir, personelKartiVer } from './servis.ts';
export type { PersonelKartSatiri } from './sorgular.ts';
// İK sayfasının kart listesi (1925 a): etkin personel kartları, yalnız kişi, son dört hane ve kayıt zamanı; kart özeti çıkmaz.
// Yetki ve iş merkezi kapsamı İK ucunda.
export { etkinPersonelKartlari } from './servis.ts';
