-- IDR-8 (G2): araç görevine isteğe bağlı çıkış ve dönüş saati. Saatsiz görev bütün günü tutar; aynı gün sabah ve öğleden sonra
-- iki göreve verilebilmek için saat yazılır. Dolu tabloya yalnız boş olabilen sütun eklenir; eski görevler saatsiz kalır.
ALTER TABLE idari_isler_arac_gorevi
  ADD COLUMN cikis_saati time,
  ADD COLUMN donus_saati time,
  ADD CONSTRAINT idari_isler_arac_gorevi_saat_sirasi
    CHECK (donus_tarihi > tarih OR cikis_saati IS NULL OR donus_saati IS NULL OR donus_saati > cikis_saati);
