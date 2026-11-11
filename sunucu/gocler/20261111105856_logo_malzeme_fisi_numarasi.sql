-- Logo'ya giden malzeme fişi numarası (2948): numara kuralı değişti; fiş Logo'da açıldığı numarayla silinir ve yeniden açılır, kural değişince
-- Logo'da ikinci fiş açılmaz. Boşsa numara koddaki kuraldan çıkar; eski satırlar doldurulmaz.
ALTER TABLE logo_malzeme_fisi_giden
  ADD COLUMN numara text CONSTRAINT logo_malzeme_fisi_giden_numara CHECK (numara IS NULL OR (numara = btrim(numara) AND length(numara) BETWEEN 1 AND 16));
