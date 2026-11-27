-- 3788 (B ve teknik resim revizyonu eki): tanım bir emre ve bir teknik resim revizyonuna özel olabilir, çünkü markalama biçimi çizim
-- revizyonuyla değişebilir. Yalnız ekler: var olan tanımlar iki sütunu boş kalır ("bütün emirler, bütün revizyonlar"), hiçbir satır değişmez.
-- Eski tekillik (malzeme, op no) dört anahtarı kapsayan tekil dizinle yer değiştirir; revizyon kodu büyük-küçük harf ayırmadan karşılaştırılır.
ALTER TABLE markalama_tanimi
  ADD COLUMN uretim_emri_id int CONSTRAINT markalama_tanimi_emir REFERENCES uretim_emri (id),
  ADD COLUMN cizim_revizyon_kodu text
    CONSTRAINT markalama_tanimi_cizim_revizyon_bicimi CHECK (cizim_revizyon_kodu IS NULL OR (btrim(cizim_revizyon_kodu) <> '' AND char_length(cizim_revizyon_kodu) <= 20));
ALTER TABLE markalama_tanimi DROP CONSTRAINT markalama_tanimi_adim_tekil;
CREATE UNIQUE INDEX markalama_tanimi_anahtar_tekil
  ON markalama_tanimi (malzeme_id, op_no, (coalesce(upper(btrim(cizim_revizyon_kodu)), '')), (coalesce(uretim_emri_id, 0)));
