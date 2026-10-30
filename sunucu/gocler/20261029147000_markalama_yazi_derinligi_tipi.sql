-- Markalama (kart 1295): markanın yazı derinliği ve yazı tipi. Yükseklik ve derinlik ayrı ölçülerdir; ikisi de boş olabilir.
-- Yalnız boş olabilen iki sütun eklenir; var olan satırlar değişmez. Boş yazı tipi makinenin varsayılanıdır.
ALTER TABLE markalama_alani
  ADD COLUMN yazi_derinligi_mm numeric(5, 3) CONSTRAINT markalama_alani_derinlik CHECK (yazi_derinligi_mm > 0 AND yazi_derinligi_mm <= 10),
  ADD COLUMN yazi_tipi text CONSTRAINT markalama_alani_yazi_tipi_degeri
    CHECK (yazi_tipi IN ('gotik', 'iso_3098', 'tek_cizgi', 'nokta_matris_5x7', 'ocr_a', 'ocr_b', 'din_1451'));
