-- 3129, 3134 a: başlangıç stoğu Excel'den toplu girer; belge mal kabuldür, türü 'baslangic'. Yalnız genişletme: tür listesi büyür,
-- üç boş olabilen sütun eklenir; var olan satır değişmez. Belge yalnız eklenir (yalniz_ekleme): sütunlar yalnız INSERT'te yazılır.
-- dosya_ozeti: yüklenen dosyanın sha256 özeti (aynı dosya iki kez girmesin; tekillik uygulamada, geri alınmamış belgeler arasında).
-- duzeltmeler: tabloda yapılan düzeltmelerin listesi (satır, alan, dosyadaki, girilen); dizi, boyutu sınırlı.
ALTER TABLE stok_mal_kabul DROP CONSTRAINT stok_mal_kabul_tur_degeri;
ALTER TABLE stok_mal_kabul ADD CONSTRAINT stok_mal_kabul_tur_degeri CHECK (tur IN ('satin_alma', 'iade', 'diger', 'baslangic'));

ALTER TABLE stok_mal_kabul
  ADD COLUMN dosya_ozeti text CONSTRAINT stok_mal_kabul_dosya_ozeti_bicimi CHECK (dosya_ozeti ~ '^[0-9a-f]{64}$'),
  ADD COLUMN dosya_adi text CONSTRAINT stok_mal_kabul_dosya_adi_bicimi CHECK (btrim(dosya_adi) <> '' AND length(dosya_adi) <= 120),
  ADD COLUMN duzeltmeler jsonb CONSTRAINT stok_mal_kabul_duzeltmeler_bicimi CHECK (jsonb_typeof(duzeltmeler) = 'array' AND pg_column_size(duzeltmeler) <= 1048576),
  ADD CONSTRAINT stok_mal_kabul_dosya_yalniz_baslangic CHECK ((dosya_ozeti IS NULL AND dosya_adi IS NULL AND duzeltmeler IS NULL) OR tur = 'baslangic');

CREATE INDEX stok_mal_kabul_dosya_ozeti_idx ON stok_mal_kabul (dosya_ozeti) WHERE dosya_ozeti IS NOT NULL;
