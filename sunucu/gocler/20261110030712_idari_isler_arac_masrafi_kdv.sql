-- 2715 (2712 a): araç masrafına KDV tutarı. Tutar KDV dahil kalır; KDV boş olabilir (eski kayıt ve KDV'si bilinmeyen fiş).
-- Boş olabilen yeni sütun: tablo yeniden yazılmaz, var olan veri değişmez.
ALTER TABLE idari_isler_arac_masrafi ADD COLUMN kdv numeric(12, 2)
  CONSTRAINT idari_isler_arac_masrafi_kdv CHECK (kdv IS NULL OR (kdv >= 0 AND kdv < tutar));
