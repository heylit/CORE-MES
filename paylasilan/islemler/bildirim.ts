// Elle bildirim (2147-2 c): işlemler açılır, hiçbir role göçle verilmez; başta yalnız yönetici (bütün işlemleri alır) kullanır,
// başka role yönetici rol yönetiminden verir. Kişinin kendi bildirimini okuması işlem istemez (oturum).
export const BILDIRIM_ISLEMLERI = [
  // Uyarı, duyuru, bilgi ya da acil bildirim hazırlar; kendi yayınlarını ve okunma raporlarını görür, geri çeker.
  'bildirim.yayinla',
  // Bütün yayınları ve okunma raporlarını görür; yayınlamaz, geri çekmez.
  'bildirim.yayin-oku',
  // E-posta kanalını yönetir (3397, ADR 0015): sunucu durumu, tetikleyiciler, şablonlar, gönderim defteri, kendine deneme e-postası.
  'bildirim.eposta-yonet',
  // Kademeli uyarı kaynaklarını ayarlar ve bütün açık takipleri görür (3405-3 a: yalnız yönetici bayrağı; hiçbir role göçle verilmez).
  'bildirim.kademe-yonet',
] as const;
