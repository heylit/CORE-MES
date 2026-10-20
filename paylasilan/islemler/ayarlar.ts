// Okuma da aynı işlemi ister: ayar listesini yalnız değiştirebilen görür.
export const AYARLAR_ISLEMLERI = [
  'ayarlar.yaz',
  // Güncelleme paketi yüklemek sunucuya kod koymaktır: hiçbir role verilmez, yalnız bayraklı yönetici (kart #870).
  'ayarlar.guncelleme-yukle',
  // Yedek veritabanının tamamıdır (ücret, finans, parola özetleri): hiçbir role verilmez, yalnız bayraklı yönetici (kart #1205).
  'ayarlar.yedek-indir',
] as const;
