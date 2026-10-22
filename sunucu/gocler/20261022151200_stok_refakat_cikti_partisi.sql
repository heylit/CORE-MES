-- Refakat kartıyla sayılan parça kartın kendi üretim partisine girer (kart #126): emir başına tek parti yerine (malzeme, refakat partisi)
-- başına bir parti. Kartsız sayım ve eski emir partileri olduğu gibi kalır (refakat_partisi_id boş). Satır değişmez; yalnız sütun ve dizin.
ALTER TABLE stok_parti ADD COLUMN refakat_partisi_id int REFERENCES stok_refakat_partisi,
  ADD CONSTRAINT stok_parti_refakat_uretimde CHECK (refakat_partisi_id IS NULL OR uretim_emri_id IS NOT NULL);
DROP INDEX stok_parti_emir_tek;
CREATE UNIQUE INDEX stok_parti_emir_tek ON stok_parti (malzeme_id, uretim_emri_id) WHERE uretim_emri_id IS NOT NULL AND refakat_partisi_id IS NULL;
CREATE UNIQUE INDEX stok_parti_refakat_tek ON stok_parti (malzeme_id, refakat_partisi_id) WHERE refakat_partisi_id IS NOT NULL;
