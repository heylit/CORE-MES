-- 3708: kaynağında muayene adımı, operasyon tipinde adı yazılı belgeler yüklenmeden onaylanmaz; belge adları tipin ayarıdır, boş "zorunlu belge yok" demektir.
ALTER TABLE istasyonlar_operasyon_tipi
  ADD COLUMN zorunlu_belgeler text[] NOT NULL DEFAULT '{}'
    CONSTRAINT istasyonlar_operasyon_tipi_zorunlu_belge_sinirli CHECK (cardinality(zorunlu_belgeler) <= 10 AND array_position(zorunlu_belgeler, '') IS NULL AND array_position(zorunlu_belgeler, NULL) IS NULL);
