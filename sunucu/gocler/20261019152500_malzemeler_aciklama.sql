-- 334 a: kartın Açıklama 1, 2, 3'ü Logo'ya gider; değerler ekranın kuralıyla kurulur (elle ya da seçimlerden), sunucu kayıtta ekranın sonucunu saklar.
-- Eski satırlar doldurulmaz (314: veri aktarılmaz); kart yeniden kaydedilince dolar.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN aciklama_1 text CONSTRAINT malzeme_katalog_karti_aciklama_1_dolu CHECK (aciklama_1 IS NULL OR btrim(aciklama_1) <> ''),
  ADD COLUMN aciklama_2 text CONSTRAINT malzeme_katalog_karti_aciklama_2_dolu CHECK (aciklama_2 IS NULL OR btrim(aciklama_2) <> ''),
  ADD COLUMN aciklama_3 text CONSTRAINT malzeme_katalog_karti_aciklama_3_dolu CHECK (aciklama_3 IS NULL OR btrim(aciklama_3) <> '');
