-- 3755: emir parçanın hangi çizim revizyonuyla üretileceğini taşır; çizim sonradan değişse de emir değişmez. Ekleyicidir:
-- hiçbir emre değer yazılmaz, var olan emirlerde alanlar boş kalır ("Rev —").
-- Kod Belge Merkezi'nin gösterdiği koddur (antet, yoksa kartın revizyonu), seçim anında kopyalanır; belge ve revizyon kaynağı gösterir.
ALTER TABLE uretim_emri
  ADD COLUMN parca_revizyon_kodu text
    CONSTRAINT uretim_emri_parca_revizyon_kodu_bicimi CHECK (parca_revizyon_kodu IS NULL OR (btrim(parca_revizyon_kodu) <> '' AND char_length(parca_revizyon_kodu) <= 20)),
  ADD COLUMN parca_cizim_belge_id int,
  ADD COLUMN parca_cizim_revizyon_id int,
  ADD CONSTRAINT uretim_emri_parca_cizim_revizyonu FOREIGN KEY (parca_cizim_revizyon_id, parca_cizim_belge_id) REFERENCES belge_merkezi_revizyon (id, belge_id),
  ADD CONSTRAINT uretim_emri_parca_cizim_butun CHECK ((parca_cizim_belge_id IS NULL) = (parca_cizim_revizyon_id IS NULL)),
  ADD CONSTRAINT uretim_emri_parca_revizyon_kaynakli CHECK (parca_revizyon_kodu IS NULL OR parca_cizim_revizyon_id IS NOT NULL);
CREATE INDEX uretim_emri_parca_cizim_revizyonu_idx ON uretim_emri (parca_cizim_revizyon_id);
