// Sevkiyat modülünün veri işlemleri. Toplayıcıya (paylasilan/islemler.ts) eklenmesi ve rollere verilmesi çekirdek işidir.
// oku: noktalar, araçlar, gün planı, tek rota, harita, arama. tanim-yaz: nokta ve araç. is-yaz: iş ekleme, düzenleme, iptal.
// plan-yaz: dağıtma ve elle düzenleme. onayla: planı onaylama ve onayı kaldırma.
// sofor-kimlik-oku: şoförün kimlik no'sunu tam görür (3685, kullanıcı kararı 25.11: yalnız yönetici); hiçbir role verilmez, yöneticide bayrakla vardır.
// Henüz hiçbir uç kullanmıyor: şoför alanı kapalı.
export const SEVKIYAT_ISLEMLERI = [
  'sevkiyat.oku',
  'sevkiyat.tanim-yaz',
  'sevkiyat.is-yaz',
  'sevkiyat.plan-yaz',
  'sevkiyat.onayla',
  'sevkiyat.sofor-kimlik-oku',
] as const;
