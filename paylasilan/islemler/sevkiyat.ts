// Sevkiyat modülünün veri işlemleri. Toplayıcıya (paylasilan/islemler.ts) eklenmesi ve rollere verilmesi çekirdek işidir.
// oku: noktalar, araçlar, gün planı, tek rota, harita, arama. tanim-yaz: nokta ve araç. is-yaz: iş ekleme, düzenleme, iptal.
// plan-yaz: dağıtma ve elle düzenleme. onayla: planı onaylama ve onayı kaldırma.
export const SEVKIYAT_ISLEMLERI = [
  'sevkiyat.oku',
  'sevkiyat.tanim-yaz',
  'sevkiyat.is-yaz',
  'sevkiyat.plan-yaz',
  'sevkiyat.onayla',
] as const;
