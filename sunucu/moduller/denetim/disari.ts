export { denetimYaz } from './servis.ts';
// Güvenlik Merkezi koruma durumu: kaydın yazılır ve değiştirilemez olduğu, son kaydın zamanı. Yetki denetlemez: çağıran uç denetler.
export { denetimDurumu, type DenetimDurumuSatiri } from './sorgular.ts';
// Değişiklik akışı (1962): okuyan modülün tablo ve alan sözlüğüyle eski/yeni değer defteri. Yetki denetlemez: çağıran uç denetler.
export { degisiklikAkisi, type DegisiklikAkisiIstegi, type DegisiklikAkisiSatiri } from './servis.ts';
